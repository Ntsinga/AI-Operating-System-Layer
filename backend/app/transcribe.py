"""Audio transcription (voice input for commands).

Uses OpenAI's gpt-4o-mini-transcribe - reuses the OPENAI_API_KEY already required for the
planner/workflow, rather than onboarding a new transcription vendor. See CLAUDE.md.
"""

import os

from openai import OpenAI

TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"


def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set. Add it to backend/.env.")

    client = OpenAI(api_key=api_key)
    response = client.audio.transcriptions.create(
        model=TRANSCRIBE_MODEL,
        file=(filename, file_bytes),
        language="en",
        prompt="The speaker is saying a short English wake phrase: Hey Casper.",
    )
    return response.text
