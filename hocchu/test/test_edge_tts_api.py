import importlib.util
import pathlib
import sys
import types
import unittest

fake = types.ModuleType("edge_tts")
fake.Communicate = object
sys.modules.setdefault("edge_tts", fake)
module_path = pathlib.Path(__file__).resolve().parents[1] / "api" / "edge-tts.py"
spec = importlib.util.spec_from_file_location("edge_tts_api", module_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class EdgeTtsApiTests(unittest.TestCase):
    def test_accepts_only_two_mainland_voices(self):
        for voice in ("zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"):
            args, error = mod.validate({"text": "你好。", "voice": voice, "rate": "0.9"})
            self.assertIsNone(error)
            self.assertEqual(args["voice"], voice)

    def test_rejects_taiwan_voice(self):
        args, error = mod.validate({"text": "你好。", "voice": "zh-TW-HsiaoChenNeural"})
        self.assertIsNone(args)
        self.assertIsNotNone(error)

    def test_rejects_invalid_text_and_rate(self):
        for payload in (
            {"text": "  ", "voice": "zh-CN-XiaoxiaoNeural"},
            {"text": "你" * 501, "voice": "zh-CN-XiaoxiaoNeural"},
            {"text": "你好", "voice": "zh-CN-XiaoxiaoNeural", "rate": "2.0"},
            [],
        ):
            args, error = mod.validate(payload)
            self.assertIsNone(args)
            self.assertIsNotNone(error)

    def test_accepts_max_length(self):
        args, error = mod.validate({"text": "你" * 500, "voice": "zh-CN-XiaoxiaoNeural"})
        self.assertIsNone(error)
        self.assertEqual(len(args["text"]), 500)

    def test_accepts_rewrite_and_direct_paths(self):
        # Vercel forwards the original path (/api/tts) to the Python function.
        for path in ("/api/tts", "/api/edge-tts", "/api/tts?x=1", "/api/edge-tts/"):
            self.assertTrue(mod._path_ok(path), path)
        for path in ("/api/tts/hints", "/api/other", "/"):
            self.assertFalse(mod._path_ok(path), path)

    def test_rate_limit(self):
        ip = "test-rate-limit"
        now = 1000.0
        for _ in range(mod.RATE_LIMIT):
            self.assertTrue(mod._allow(ip, now))
        self.assertFalse(mod._allow(ip, now))
        self.assertTrue(mod._allow(ip, now + mod.RATE_WINDOW_SECONDS + 1))


MP3 = bytes([0xFF, 0xFB, 0x90, 0x64, 0, 0])


class RetryAndInternalTests(unittest.TestCase):
    """V147: retry khi Microsoft từ chối/ngắt kết nối; bỏ giới hạn IP cho lời gọi nội bộ."""

    def setUp(self):
        self._orig = (mod._synthesize, mod.RETRY_BACKOFF_SECONDS, mod.TIMEOUT_SECONDS)
        mod.RETRY_BACKOFF_SECONDS = 0

    def tearDown(self):
        mod._synthesize, mod.RETRY_BACKOFF_SECONDS, mod.TIMEOUT_SECONDS = self._orig

    def _fake(self, outcomes):
        calls = {"n": 0}

        async def fake(text, voice, rate):
            outcome = outcomes[min(calls["n"], len(outcomes) - 1)]
            calls["n"] += 1
            if isinstance(outcome, BaseException):
                raise outcome
            if callable(outcome):
                return await outcome()
            return outcome

        mod._synthesize = fake
        return calls

    def test_retry_succeeds_after_transient_error(self):
        calls = self._fake([ConnectionError("ws 403"), MP3])
        self.assertEqual(mod.synthesize("你好", "zh-CN-XiaoxiaoNeural", "+0%"), MP3)
        self.assertEqual(calls["n"], 2)

    def test_retry_gives_up_after_max_attempts(self):
        calls = self._fake([ConnectionError("down")])
        with self.assertRaises(ConnectionError):
            mod.synthesize("你好", "zh-CN-XiaoxiaoNeural", "+0%")
        self.assertEqual(calls["n"], mod.MAX_ATTEMPTS)

    def test_invalid_audio_is_retried(self):
        calls = self._fake([b"", b"\x00\x01\x02\x03\x04", MP3])
        self.assertEqual(mod.synthesize("你好", "zh-CN-XiaoxiaoNeural", "+0%"), MP3)
        self.assertEqual(calls["n"], 3)

    def test_hung_attempt_is_cut_then_retried(self):
        import asyncio as aio

        async def hang():
            await aio.sleep(60)

        calls = self._fake([hang, MP3])
        orig = mod._attempt_timeout
        mod._attempt_timeout = lambda text, remaining, last: 0.05 if not last else remaining
        try:
            self.assertEqual(mod.synthesize("你好", "zh-CN-XiaoxiaoNeural", "+0%"), MP3)
        finally:
            mod._attempt_timeout = orig
        self.assertEqual(calls["n"], 2)

    def test_total_timeout_raises_timeout_error(self):
        import asyncio as aio

        async def hang():
            await aio.sleep(60)

        self._fake([hang])
        mod.TIMEOUT_SECONDS = 3.2  # chỉ đủ 1 lần thử (< 3 s còn lại thì dừng)
        orig = mod._attempt_timeout
        mod._attempt_timeout = lambda text, remaining, last: 0.2
        try:
            with self.assertRaises(aio.TimeoutError):
                mod.synthesize("你好", "zh-CN-XiaoxiaoNeural", "+0%")
        finally:
            mod._attempt_timeout = orig

    def test_attempt_timeout_scales_with_text_and_last_attempt_gets_all(self):
        self.assertLess(mod._attempt_timeout("你好", 45, False), 10)
        self.assertGreater(mod._attempt_timeout("你" * 500, 45, False), 30)
        self.assertEqual(mod._attempt_timeout("你好", 12.5, True), 12.5)

    def test_communicate_kwargs_only_supported_params(self):
        class New:
            def __init__(self, text, voice, *, rate="+0%", connect_timeout=10):
                pass

        class Old:
            def __init__(self, text, voice, *, rate="+0%"):
                pass

        orig = mod.edge_tts
        try:
            mod.edge_tts = types.SimpleNamespace(Communicate=New)
            self.assertEqual(mod._communicate_kwargs(), {"connect_timeout": mod.CONNECT_TIMEOUT_SECONDS})
            mod.edge_tts = types.SimpleNamespace(Communicate=Old)
            self.assertEqual(mod._communicate_kwargs(), {})
        finally:
            mod.edge_tts = orig

    def test_no_internal_bypass_every_caller_is_rate_limited(self):
        # V148: không còn lời gọi nội bộ từ server Node (thư viện R2 đã bỏ) → không có đường vòng giới hạn theo IP.
        self.assertFalse(hasattr(mod, "_is_internal"))
        self.assertFalse(hasattr(mod, "INTERNAL_HEADER"))
        with open(mod.__file__, encoding="utf-8") as fh:
            src = fh.read()
        self.assertNotIn("AUDIO_INTERNAL_TOKEN", src)
        self.assertNotIn("x-audio-internal", src)
        mod._hits.clear()
        for _ in range(mod.RATE_LIMIT):
            self.assertTrue(mod._allow("203.0.113.9", now=1000.0))
        self.assertFalse(mod._allow("203.0.113.9", now=1000.5))


if __name__ == "__main__":
    unittest.main()
