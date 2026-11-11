"""Edge-TTS serverless endpoint for HSK-main.

Vercel route: /api/edge-tts (rewritten from /api/tts).
Only two mainland Mandarin voices are accepted. No text/audio is logged or persisted.
"""
import asyncio
import inspect
import json
import sys
import time
import threading
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler

import edge_tts

# Vercel forwards the ORIGINAL request path to the Python function even when a
# rewrite points /api/tts at this file, so accept both.
PATHS = {"/api/edge-tts", "/api/tts"}

VOICES = {
    "zh-CN-XiaoxiaoNeural",
    "zh-CN-YunxiNeural",
}
RATES = {"0.8": "-20%", "0.9": "-10%", "1.0": "+0%", "1.1": "+10%", "1.2": "+20%"}
MAX_CHARS = 500
MAX_BODY = 16 * 1024
TIMEOUT_SECONDS = 45          # tổng thời gian cho mọi lần thử (function Vercel có maxDuration 60 s)
MAX_ATTEMPTS = 3              # V147: Microsoft thỉnh thoảng từ chối/ngắt kết nối ở lần đầu → thử lại, không rơi thẳng xuống Web Speech
RETRY_BACKOFF_SECONDS = 0.3
CONNECT_TIMEOUT_SECONDS = 8   # mặc định của edge-tts là 10 s; hạ xuống để lần thử hỏng được bỏ nhanh
RATE_LIMIT = 60
RATE_WINDOW_SECONDS = 60
# V148: trình duyệt người học gọi TRỰC TIẾP endpoint này (không còn lời gọi nội bộ từ server Node) → mỗi người học có IP riêng,
# giới hạn 60 request/phút/IP là đủ và áp dụng cho mọi lời gọi.

_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def _path_ok(path):
    return path.split("?", 1)[0].rstrip("/") in PATHS


def _client_ip(headers):
    # Vercel supplies x-forwarded-for. Use only the first address, never trust
    # client-provided alternative headers.
    return (headers.get("x-forwarded-for", "").split(",")[0].strip() or "unknown")[:80]


def _allow(ip, now=None):
    now = time.monotonic() if now is None else now
    with _hits_lock:
        bucket = _hits[ip]
        while bucket and now - bucket[0] >= RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            return False
        bucket.append(now)
        # Bound memory if many source IPs hit a warm instance.
        if len(_hits) > 2000:
            for key in list(_hits)[:500]:
                if not _hits[key] or now - _hits[key][-1] >= RATE_WINDOW_SECONDS:
                    _hits.pop(key, None)
        return True


def validate(payload):
    if not isinstance(payload, dict):
        return None, "Dữ liệu không hợp lệ"
    text = payload.get("text")
    voice = payload.get("voice", "zh-CN-XiaoxiaoNeural")
    rate = str(payload.get("rate", "0.9"))
    if not isinstance(text, str):
        return None, "Thiếu văn bản"
    text = text.strip()
    if not text:
        return None, "Văn bản trống"
    if len(text) > MAX_CHARS:
        return None, "Văn bản tối đa 500 ký tự"
    if voice not in VOICES:
        return None, "Giọng đọc không được phép"
    if rate not in RATES:
        return None, "Tốc độ không được phép"
    return {"text": text, "voice": voice, "rate": RATES[rate]}, None


def _communicate_kwargs():
    """Chỉ truyền các tham số mà phiên bản edge-tts đang cài thật sự hỗ trợ (tránh TypeError khi nâng/hạ bản)."""
    try:
        params = inspect.signature(edge_tts.Communicate.__init__).parameters
    except (TypeError, ValueError, AttributeError):
        return {}
    return {"connect_timeout": CONNECT_TIMEOUT_SECONDS} if "connect_timeout" in params else {}


def _is_mp3(audio):
    return len(audio) >= 4 and audio[0] == 0xFF and (audio[1] & 0xE0) == 0xE0


async def _synthesize(text, voice, rate):
    communicator = edge_tts.Communicate(text, voice, rate=rate, **_communicate_kwargs())
    output = bytearray()
    async for chunk in communicator.stream():
        if chunk.get("type") == "audio":
            output.extend(chunk["data"])
    return bytes(output)


def _attempt_timeout(text, remaining, last_attempt):
    # Câu ngắn bình thường ~1–2 s; 500 ký tự đo được tới ~19,5 s. Lần thử không cuối bị cắt sớm để còn thời gian thử lại.
    if last_attempt:
        return remaining
    return min(remaining, 8 + 0.05 * len(text))


async def _synthesize_with_retry(text, voice, rate):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + TIMEOUT_SECONDS
    last = None
    for attempt in range(MAX_ATTEMPTS):
        remaining = deadline - loop.time()
        if remaining < 3:
            break
        last_attempt = attempt == MAX_ATTEMPTS - 1
        try:
            audio = await asyncio.wait_for(
                _synthesize(text, voice, rate), timeout=_attempt_timeout(text, remaining, last_attempt)
            )
            if _is_mp3(audio):
                return audio
            last = ValueError("invalid_audio")
        except asyncio.TimeoutError as exc:
            last = exc
        except Exception as exc:  # noqa: BLE001 — lỗi mạng/WebSocket/403 từ dịch vụ; chỉ log tên lỗi, không log văn bản
            last = exc
        if not last_attempt:
            # Chỉ log loại lỗi và số lần thử — không log văn bản người dùng.
            print("EDGE_TTS_RETRY attempt=%d type=%s" % (attempt + 1, type(last).__name__), file=sys.stderr)
            await asyncio.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))
    raise last if last is not None else asyncio.TimeoutError()


def synthesize(text, voice, rate):
    return asyncio.run(_synthesize_with_retry(text, voice, rate))


class handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not log text, request bodies, or IP addresses.
        pass

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if _path_ok(self.path):
            self._json(200, {"ok": True, "voices": sorted(VOICES), "maxChars": MAX_CHARS})
        else:
            print("EDGE_TTS_PATH_MISMATCH " + self.path.split("?", 1)[0], file=sys.stderr)
            self._json(404, {"ok": False, "error": "Không tìm thấy"})

    def do_POST(self):
        if not _path_ok(self.path):
            print("EDGE_TTS_PATH_MISMATCH " + self.path.split("?", 1)[0], file=sys.stderr)
            self._json(404, {"ok": False, "error": "Không tìm thấy"})
            return
        if not _allow(_client_ip(self.headers)):
            self._json(429, {"ok": False, "error": "Bạn thao tác quá nhanh. Hãy thử lại sau một phút."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except (TypeError, ValueError):
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json(400, {"ok": False, "error": "Dữ liệu gửi lên không hợp lệ"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._json(400, {"ok": False, "error": "JSON không hợp lệ"})
            return
        args, error = validate(payload)
        if error:
            self._json(400, {"ok": False, "error": error})
            return
        try:
            audio = synthesize(**args)
        except asyncio.TimeoutError:
            print("EDGE_TTS_TIMEOUT", file=sys.stderr)
            self._json(504, {"ok": False, "error": "Tạo âm thanh quá thời gian chờ"})
            return
        except Exception as exc:
            # Log only the exception type — never the user's text.
            print("EDGE_TTS_SYNTH_ERROR " + type(exc).__name__, file=sys.stderr)
            self._json(502, {"ok": False, "error": "Dịch vụ giọng đọc tạm thời không khả dụng"})
            return
        if len(audio) < 4 or not (audio[0] == 0xFF and (audio[1] & 0xE0) == 0xE0):
            self._json(502, {"ok": False, "error": "Dịch vụ trả về tệp âm thanh không hợp lệ"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "private, max-age=86400")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(audio)
