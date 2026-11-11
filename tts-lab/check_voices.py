#!/usr/bin/env python3
"""Kiểm thử THỰC TẾ Edge-TTS: 2 voice × 5 tốc độ × 5 câu mẫu.
Ghi MP3 vào thư mục tạm, KHÔNG lưu vào repo/DB. In thời gian + kích thước.

Chạy: python3 tts-lab/check_voices.py
"""
import asyncio
import sys
import tempfile
import time
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.stderr.write("Cần cài edge-tts: pip install edge-tts\n")
    raise SystemExit(2)

VOICES = ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"]
RATES = {"0.8": "-20%", "0.9": "-10%", "1.0": "+0%", "1.1": "+10%", "1.2": "+20%"}
SENTENCES = [
    "你好，很高兴认识你。",
    "我每天早上七点起床。",
    "因为今天下雨，所以我没有出去。",
    "你觉得这个问题应该怎么解决？",
    "我想在台湾找一份合适的工作。",
]
TIMEOUT = 25


async def synth(text, voice, rate):
    comm = edge_tts.Communicate(text, voice, rate=rate)
    buf = bytearray()
    async for chunk in comm.stream():
        if chunk.get("type") == "audio":
            buf.extend(chunk["data"])
    return bytes(buf)


def is_mp3(data):
    return len(data) > 4 and (data[:3] == b"ID3" or data[0] == 0xFF)


def main():
    out = Path(tempfile.mkdtemp(prefix="edge-tts-lab-"))
    print("Thư mục tạm:", out)
    print("voices:", ", ".join(VOICES))
    ok = fail = 0
    times, sizes = [], []
    for si, text in enumerate(SENTENCES):
        for voice in VOICES:
            for rk, rv in RATES.items():
                name = "s%d_%s_%s.mp3" % (si + 1, voice.split("-")[-1], rk)
                t0 = time.monotonic()
                try:
                    data = asyncio.run(asyncio.wait_for(synth(text, voice, rv), TIMEOUT))
                    ms = int((time.monotonic() - t0) * 1000)
                    if not data or not is_mp3(data):
                        raise ValueError("không phải MP3 hợp lệ")
                    (out / name).write_bytes(data)
                    ok += 1
                    times.append(ms)
                    sizes.append(len(data))
                    print("OK   %-34s %5d ms %7d B" % (name, ms, len(data)))
                except Exception as e:
                    fail += 1
                    print("FAIL %-34s %s" % (name, type(e).__name__))
    print("\nTổng: %d OK, %d FAIL" % (ok, fail))
    if times:
        print("Thời gian: min %d ms · trung bình %d ms · max %d ms" % (
            min(times), sum(times) // len(times), max(times)))
        print("Kích thước: min %d B · max %d B" % (min(sizes), max(sizes)))
    raise SystemExit(1 if fail else 0)


if __name__ == "__main__":
    main()