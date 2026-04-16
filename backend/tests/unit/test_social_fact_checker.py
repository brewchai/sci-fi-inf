from pathlib import Path

from app.services.social_fact_checker import _yt_dlp_command_prefix, _yt_dlp_shared_args


def test_yt_dlp_command_uses_binary_when_available(monkeypatch):
    monkeypatch.setattr("app.services.social_fact_checker.shutil.which", lambda name: "/usr/local/bin/yt-dlp")

    assert _yt_dlp_command_prefix() == ["/usr/local/bin/yt-dlp"]


def test_yt_dlp_command_falls_back_to_python_module(monkeypatch):
    monkeypatch.setattr("app.services.social_fact_checker.shutil.which", lambda name: None)

    class _YtDlpModule:
        pass

    original_import = __import__

    def _fake_import(name, *args, **kwargs):
        if name == "yt_dlp":
            return _YtDlpModule()
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", _fake_import)
    monkeypatch.setattr("app.services.social_fact_checker.sys.executable", "/usr/bin/python3")

    assert _yt_dlp_command_prefix() == ["/usr/bin/python3", "-m", "yt_dlp"]


def test_yt_dlp_shared_args_include_node_runtime(monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.social_fact_checker.settings.YT_DLP_JS_RUNTIMES", "node")
    monkeypatch.setattr("app.services.social_fact_checker.settings.YT_DLP_COOKIES_PATH", None)
    monkeypatch.setattr("app.services.social_fact_checker.settings.YT_DLP_COOKIES_B64", None)
    monkeypatch.setattr("app.services.social_fact_checker.settings.YT_DLP_EXTRA_ARGS", None)

    assert _yt_dlp_shared_args(tmp_path) == ["--js-runtimes", "node"]


def test_yt_dlp_shared_args_write_cookie_file_from_base64(monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.social_fact_checker.settings.YT_DLP_JS_RUNTIMES", "node")
    monkeypatch.setattr("app.services.social_fact_checker.settings.YT_DLP_COOKIES_PATH", None)
    monkeypatch.setattr(
        "app.services.social_fact_checker.settings.YT_DLP_COOKIES_B64",
        "I05ldHNjYXBlIEhUVFAgQ29va2llIEZpbGUKeW91dHViZS5jb20JVFJVRQkvCUZBTFNFCjAJU0lECnZhbHVlCg==",
    )
    monkeypatch.setattr("app.services.social_fact_checker.settings.YT_DLP_EXTRA_ARGS", "--proxy http://proxy.internal:8080")

    args = _yt_dlp_shared_args(tmp_path)

    assert args[:2] == ["--js-runtimes", "node"]
    assert "--cookies" in args
    cookie_path = Path(args[args.index("--cookies") + 1])
    assert cookie_path.exists()
    assert "youtube.com" in cookie_path.read_text(encoding="utf-8")
    assert args[-2:] == ["--proxy", "http://proxy.internal:8080"]
