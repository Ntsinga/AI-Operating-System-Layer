import base64
import json

from app import llm


def extract_receipt(image_bytes: bytes, mime_type: str) -> dict:
    # vision=True keeps this on a provider that can actually read images (OpenAI by default;
    # deepseek-flash via LLM_PROVIDER_VISION=deepseek; or an open-weight VLM with OPEN_WEIGHT_VISION=1)
    # even if the global provider is text-only. DeepSeek only takes JPEG/PNG/GIF/WebP, so an
    # unsupported format (e.g. HEIC) errors there - with LLM_FALLBACK on it retries on OpenAI.
    # LLMError is a RuntimeError, which the /expenses/receipt route already turns into a 500.
    result = llm.chat(
        "vision",
        [
            {"role": "system", "content": "Extract a receipt into JSON with merchant, date, total, currency, tax, category, and confidence. Use null when unreadable; never invent values."},
            {"role": "user", "content": [{"type": "text", "text": "Read this receipt."}, {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"}}]},
        ],
        json_mode=True,
        vision=True,
    )
    try:
        receipt = json.loads(result.text or "{}")
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Receipt model {result.provider}/{result.model} returned unparsable JSON.") from error
    if not isinstance(receipt, dict):
        raise RuntimeError(f"Receipt model {result.provider}/{result.model} returned a non-object result.")
    return receipt
