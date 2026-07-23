import json
import os
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

TOKEN_FILE = Path(os.getenv("GOOGLE_TOKEN_FILE", Path(__file__).parents[1] / ".google_tokens.enc"))
def _fernet() -> Fernet:
    key = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY")
    if not key: raise RuntimeError("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured.")
    return Fernet(key.encode())
def save_token(token: dict) -> None: TOKEN_FILE.write_bytes(_fernet().encrypt(json.dumps(token).encode()))
def load_token() -> dict | None:
    if not TOKEN_FILE.exists(): return None
    try: return json.loads(_fernet().decrypt(TOKEN_FILE.read_bytes()))
    except InvalidToken as error: raise RuntimeError("Google token vault could not be decrypted.") from error
