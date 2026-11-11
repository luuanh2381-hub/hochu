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


if __name__ == "__main__":
    unittest.main()
