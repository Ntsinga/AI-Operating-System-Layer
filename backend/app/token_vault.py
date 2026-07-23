import json
import os
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from app.storage import postgres_enabled

TOKEN_FILE = Path(os.getenv("GOOGLE_TOKEN_FILE", Path(__file__).parents[1] / ".google_tokens.enc"))
def _fernet() -> Fernet:
    key = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY")
    if not key: raise RuntimeError("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured.")
    return Fernet(key.encode())
def save_token(token: dict) -> None:
    encrypted = _fernet().encrypt(json.dumps(token).encode()).decode()
    if postgres_enabled():
        import psycopg
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS oauth_tokens (provider TEXT PRIMARY KEY, encrypted_token TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)")
            conn.execute("INSERT INTO oauth_tokens(provider, encrypted_token) VALUES (%s, %s) ON CONFLICT (provider) DO UPDATE SET encrypted_token = EXCLUDED.encrypted_token, updated_at = CURRENT_TIMESTAMP", ("google", encrypted))
    else:
        TOKEN_FILE.write_bytes(encrypted.encode())
def load_token() -> dict | None:
    try:
        if postgres_enabled():
            import psycopg
            with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
                conn.execute("CREATE TABLE IF NOT EXISTS oauth_tokens (provider TEXT PRIMARY KEY, encrypted_token TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)")
                row = conn.execute("SELECT encrypted_token FROM oauth_tokens WHERE provider = %s", ("google",)).fetchone()
                if not row: return None
                return json.loads(_fernet().decrypt(row[0].encode()))
        if not TOKEN_FILE.exists(): return None
        return json.loads(_fernet().decrypt(TOKEN_FILE.read_bytes()))
    except InvalidToken as error: raise RuntimeError("Google token vault could not be decrypted.") from error
