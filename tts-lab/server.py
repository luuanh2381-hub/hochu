#!/usr/bin/env python3
"""Edge-TTS Lab — thử nghiệm giọng đọc tiếng Trung (độc lập, KHÔNG nối vào app chính).

Chạy:  python3 tts-lab/server.py            (mặc định http://127.0.0.1:8765/tts-lab)
       python3 tts-lab/server.py --port 9000

Yêu cầu: Python có cài `edge-tts` (`pip install edge-tts`).
Thiết kế tối giản: stdlib http.server, không DB, không log nội dung người dùng,
chỉ 2 voice, tối đa 500 ký tự, rate limit + timeout.
"""
import argparse
import asyncio
import json
import sys
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:
    import edge_tts
except ImportError:
    sys.stderr.write(
        "Không import được edge_tts.\n"
        "Cài: pip install edge-tts\n"
        "Rồi chạy bằng đúng Python có gói đó (vd. python3 -c \"import edge_tts\").\n"
    )
    raise SystemExit(2)

HERE = Path(__file__).resolve().parent
INDEX = HERE / "index.html"

# Chỉ 2 voice phổ thông Trung Quốc đại lục. KHÔNG thêm giọng Đài Loan.
VOICES = {
    "zh-CN-XiaoxiaoNeural": {"label": "Nữ · Xiaoxiao", "gender": "Nữ"},
    "zh-CN-YunxiNeural": {"label": "Nam · Yunxi", "gender": "Nam"},
}
# UI gửi hệ số; đổi chính xác sang tham số rate của Edge-TTS.
RATE_PERCENT = {"0.8": "-20%", "0.9": "-10%", "1.0": "+0%", "1.1": "+10%", "1.2": "+20%"}
MAX_CHARS = 500
TIMEOUT_S = 45           # 500 ký tự thực đo ~19.5 s; 20 s quá sát
RATE_LIMIT = 10          # số lần tạo / IP
RATE_WINDOW = 60.0       # trong bao nhiêu giây
MAX_BODY = 16 * 1024     # chặn body quá lớn trước khi parse


def validate(payload):
    """Trả ({text, voice, rate}, None) hoặc (None, lỗi)."""
    if not isinstance(payload, dict):
        return None, "Dữ liệu không hợp lệ"
    text = payload.get("text")
    voice = payload.get("voice")
    rate = payload.get("rate", "0.9")
    if not isinstance(text, str):
        return None, "Thiếu văn bản"
    text = text.strip()
    if not text:
        return None, "Văn bản trống"
    if len(text) > MAX_CHARS:
        return None, "Văn bản tối đa %d ký tự" % MAX_CHARS
    if voice not in VOICES:
        return None, "Giọng đọc không được phép"
    if str(rate) not in RATE_PERCENT:
        return None, "Tốc độ không được phép"
    return {"text": text, "voice": voice, "rate": RATE_PERCENT[str(rate)]}, None


_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def allow(ip, now=None):
    """Rate limit theo IP. Tách hàm để test được mà không cần mạng."""
    now = time.monotonic() if now is None else now
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return False
        q.append(now)
        return True


async def _synth(text, voice, rate):
    comm = edge_tts.Communicate(text, voice, rate=rate)
    buf = bytearray()
    async for chunk in comm.stream():
        if chunk.get("type") == "audio":
            buf.extend(chunk["data"])
    return bytes(buf)


def synth_mp3(text, voice, rate):
    """Tạo MP3 với timeout. Ném TimeoutError / Exception cho tầng HTTP xử lý."""
    return asyncio.run(asyncio.wait_for(_synth(text, voice, rate), TIMEOUT_S))


class Handler(BaseHTTPRequestHandler):
    server_version = "EdgeTTSLab/1.0"

    def log_message(self, fmt, *args):
        # Không ghi nội dung người dùng / thông tin môi trường ra log.
        pass

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _html(self):
        try:
            body = INDEX.read_bytes()
        except OSError:
            self._json(500, {"ok": False, "error": "Thiếu index.html"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/tts-lab", "/tts-lab/"):
            self._html()
        elif path == "/tts-lab/health":
            self._json(200, {"ok": True, "voices": list(VOICES), "maxChars": MAX_CHARS})
        else:
            self._json(404, {"ok": False, "error": "Không tìm thấy"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/tts":
            self._json(404, {"ok": False, "error": "Không tìm thấy"})
            return
        ip = self.client_address[0]
        if not allow(ip):
            self._json(429, {"ok": False, "error": "Quá nhiều yêu cầu, thử lại sau"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            self._json(400, {"ok": False, "error": "Body không hợp lệ"})
            return
        try:
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._json(400, {"ok": False, "error": "JSON không hợp lệ"})
            return
        args, err = validate(payload)
        if err:
            self._json(400, {"ok": False, "error": err})
            return
        try:
            audio = synth_mp3(**args)
        except asyncio.TimeoutError:
            self._json(504, {"ok": False, "error": "Dịch vụ TTS quá thời gian chờ"})
            return
        except Exception:
            self._json(502, {"ok": False, "error": "Không tạo được âm thanh (lỗi kết nối dịch vụ)"})
            return
        if not audio:
            self._json(502, {"ok": False, "error": "Dịch vụ trả về âm thanh rỗng"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Disposition", "inline; filename=tts.mp3")
        self.end_headers()
        self.wfile.write(audio)


def main():
    ap = argparse.ArgumentParser(description="Edge-TTS Lab (local)")
    ap.add_argument("--host", default="127.0.0.1", help="mặc định chỉ localhost")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print("Edge-TTS Lab: http://%s:%d/tts-lab" % (a.host, a.port), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()