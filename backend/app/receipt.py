import base64
import json
import os

from openai import OpenAI


def extract_receipt(image_bytes: bytes, mime_type: str) -> dict:
    key = os.environ.get("OPENAI_API_KEY")
    if not key: raise RuntimeError("OPENAI_API_KEY is not set.")
    client = OpenAI(api_key=key)
    response = client.chat.completions.create(model="gpt-4o-mini", response_format={"type": "json_object"}, messages=[{"role": "system", "content": "Extract a receipt into JSON with merchant, date, total, currency, tax, category, and confidence. Use null when unreadable; never invent values."}, {"role": "user", "content": [{"type": "text", "text": "Read this receipt."}, {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"}}]}])
    return json.loads(response.choices[0].message.content or "{}")
