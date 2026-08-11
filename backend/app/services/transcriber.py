from app.config import settings


def transcribe(audio_path: str) -> str:
    """Transcribe an audio file with the OpenAI Whisper API.

    Returns "" when no key is configured or the call fails.

    Cleanup is deliberately NOT done here. It used to be, in a `finally` block —
    but the `return ""` for a missing key sits *before* the try, so that block
    never ran on an unconfigured deploy and every downloaded file was orphaned on
    disk forever. Ownership now sits with the caller, which is the only place
    that knows whether the file is still needed: extractor.download_audio()
    cleans up its own failures, and the caller pairs a successful download with
    extractor.cleanup_audio() in a `finally`.
    """
    if not settings.OPENAI_API_KEY:
        return ""

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        with open(audio_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="text"
            )
        return response.strip()
    except Exception:
        return ""
