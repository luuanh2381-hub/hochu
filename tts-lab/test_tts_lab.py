#!/usr/bin/env python3
"""Kiểm thử phần thuần của Edge-TTS Lab (không cần mạng).
Chạy: python3 tts-lab/test_tts_lab.py
"""
import unittest

import server


class ValidateTest(unittest.TestCase):
    def test_ok(self):
        args, err = server.validate({"text": " 你好 ", "voice": "zh-CN-XiaoxiaoNeural", "rate": "0.9"})
        self.assertIsNone(err)
        self.assertEqual(args["text"], "你好")
        self.assertEqual(args["rate"], "-10%")

    def test_rejects(self):
        cases = [
            ({}, "Thiếu văn bản"),
            ({"text": "   ", "voice": "zh-CN-XiaoxiaoNeural"}, "Văn bản trống"),
            ({"text": "a", "voice": "zh-TW-HsiaoChenNeural"}, "Giọng đọc không được phép"),
            ({"text": "a", "voice": "zh-CN-XiaoxiaoNeural", "rate": "2.0"}, "Tốc độ không được phép"),
        ]
        for payload, want in cases:
            args, err = server.validate(payload)
            self.assertIsNone(args)
            self.assertEqual(err, want, payload)

    def test_500_limit(self):
        args, err = server.validate({"text": "汉" * 501, "voice": "zh-CN-XiaoxiaoNeural"})
        self.assertIsNone(args)
        self.assertIn("500", err)
        args, err = server.validate({"text": "汉" * 500, "voice": "zh-CN-XiaoxiaoNeural"})
        self.assertIsNone(err)


class RateMapTest(unittest.TestCase):
    def test_all_rates(self):
        self.assertEqual(server.RATE_PERCENT, {"0.8": "-20%", "0.9": "-10%", "1.0": "+0%", "1.1": "+10%", "1.2": "+20%"})


class RateLimitTest(unittest.TestCase):
    def test_limit(self):
        server._hits.clear()
        for i in range(server.RATE_LIMIT):
            self.assertTrue(server.allow("1.2.3.4", now=0 + i * 0.1))
        self.assertFalse(server.allow("1.2.3.4", now=2.0))

    def test_window(self):
        server._hits.clear()
        for i in range(server.RATE_LIMIT):
            self.assertTrue(server.allow("5.6.7.8", now=0 + i * 0.1))
        self.assertTrue(server.allow("5.6.7.8", now=server.RATE_WINDOW + 1))

    def test_other_ip(self):
        server._hits.clear()
        for i in range(server.RATE_LIMIT):
            server.allow("9.9.9.9", now=0 + i * 0.1)
        self.assertFalse(server.allow("9.9.9.9", now=2.0))
        self.assertTrue(server.allow("8.8.8.8", now=2.0))


if __name__ == "__main__":
    unittest.main(verbosity=2)