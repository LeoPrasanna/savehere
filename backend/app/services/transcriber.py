import os
from app.config import settings


def transcribe(audio_path: str) -> str:
    """Transcribe audio file using OpenAI Whisper API. Returns empty string if key not set."""
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
    finally:
        # clean up temp audio file
        try:
            os.remove(audio_path)
            os.rmdir(os.path.dirname(audio_path))
        except Exception:
            pass
