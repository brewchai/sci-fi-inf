import pytest
from pathlib import Path

from app.services.social_fact_checker import (
    _extract_youtube_video_id,
    _ingest_youtube_via_transcript_api,
    _parse_vtt_segments,
    _transcript_payload_from_snippets,
    _word_timestamps_from_segments,
    ingest_youtube_video,
    _yt_dlp_command_prefix,
    _yt_dlp_shared_args,
)


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


def test_parse_vtt_segments_and_word_timestamps():
    segments = _parse_vtt_segments(
        """WEBVTT

00:00:00.000 --> 00:00:02.000
Vitamin D may reduce inflammation.

00:00:02.000 --> 00:00:04.000
More trials are still needed.
"""
    )

    assert segments == [
        {"start": 0.0, "end": 2.0, "text": "Vitamin D may reduce inflammation."},
        {"start": 2.0, "end": 4.0, "text": "More trials are still needed."},
    ]

    words = _word_timestamps_from_segments(segments)
    assert words[0]["word"] == "Vitamin"
    assert words[0]["start"] == 0.0
    assert words[-1]["word"] == "needed."
    assert words[-1]["end"] == 4.0


def test_extract_youtube_video_id_variants():
    assert _extract_youtube_video_id("https://www.youtube.com/watch?v=o9j3zzf63Ds") == "o9j3zzf63Ds"
    assert _extract_youtube_video_id("https://youtu.be/o9j3zzf63Ds") == "o9j3zzf63Ds"
    assert _extract_youtube_video_id("https://www.youtube.com/shorts/o9j3zzf63Ds") == "o9j3zzf63Ds"


def test_transcript_payload_from_snippets():
    payload = _transcript_payload_from_snippets(
        [
            {"text": "Vitamin D helps", "start": 0.0, "duration": 1.5},
            {"text": "but evidence varies", "start": 1.5, "duration": 1.5},
        ]
    )

    assert payload is not None
    assert payload["video_url"] is None
    assert payload["audio_url"] is None
    assert payload["transcript"] == "Vitamin D helps but evidence varies"
    assert payload["word_timestamps"][0]["word"] == "Vitamin"


@pytest.mark.asyncio
async def test_ingest_youtube_video_refuses_media_download_for_public_flow(monkeypatch):
    async def fake_metadata(url, yt_dlp_cmd, yt_dlp_args):
        return {"title": "Test title", "channel": "Test channel", "duration": 12.0}

    async def fake_transcript_api(url):
        return None

    async def fake_subtitle_ingest(**kwargs):
        return None

    monkeypatch.setattr("app.services.social_fact_checker._youtube_metadata", fake_metadata)
    monkeypatch.setattr("app.services.social_fact_checker._ingest_youtube_via_transcript_api", fake_transcript_api)
    monkeypatch.setattr("app.services.social_fact_checker._ingest_youtube_via_transcript", fake_subtitle_ingest)
    monkeypatch.setattr("app.services.social_fact_checker._yt_dlp_command_prefix", lambda: ["yt-dlp"])
    monkeypatch.setattr("app.services.social_fact_checker._yt_dlp_shared_args", lambda job_dir: [])

    with pytest.raises(RuntimeError, match="We couldn't access a transcript for this video"):
        await ingest_youtube_video("https://www.youtube.com/watch?v=o9j3zzf63Ds", allow_media_download=False)
