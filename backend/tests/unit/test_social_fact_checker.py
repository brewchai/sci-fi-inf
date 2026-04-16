from app.services.social_fact_checker import _yt_dlp_command_prefix


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
