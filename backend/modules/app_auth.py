"""
App-level authentication (email + JWT).
Separate from Instagram auth — each user registers here first,
then connects their Instagram account.
"""
import os
import hmac
import hashlib
import base64
import json
import time
from typing import Optional

from ..db.database import get_connection

JWT_SECRET = os.getenv("JWT_SECRET", "instatudo-secret-key-change-in-production")
JWT_EXPIRE_SECONDS = 7 * 24 * 3600  # 7 days


# ── Password hashing (PBKDF2 via stdlib) ─────────────────────────────────────

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return base64.b64encode(salt + key).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        raw = base64.b64decode(stored.encode())
        salt, key = raw[:16], raw[16:]
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
        return hmac.compare_digest(key, check)
    except Exception:
        return False


# ── JWT (pure stdlib, no external deps) ──────────────────────────────────────

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (padding % 4))


def create_token(user_id: int, email: str) -> str:
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url_encode(json.dumps({
        "sub": str(user_id),
        "email": email,
        "exp": int(time.time()) + JWT_EXPIRE_SECONDS,
    }).encode())
    msg = f"{header}.{payload}"
    sig = hmac.new(JWT_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
    return f"{msg}.{_b64url_encode(sig)}"


def verify_token(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, signature = parts
        msg = f"{header}.{payload}"
        expected = _b64url_encode(
            hmac.new(JWT_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(expected, signature):
            return None
        data = json.loads(_b64url_decode(payload))
        if data.get("exp", 0) < time.time():
            return None
        return data
    except Exception:
        return None


# ── User management ───────────────────────────────────────────────────────────

def register_user(email: str, password: str, name: str = "") -> dict:
    if not email or not password:
        return {"success": False, "message": "Email e senha são obrigatórios."}
    if len(password) < 6:
        return {"success": False, "message": "Senha deve ter pelo menos 6 caracteres."}

    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (email.lower(),)
        ).fetchone()
        if existing:
            return {"success": False, "message": "Email já cadastrado."}

        pw_hash = hash_password(password)
        conn.execute(
            "INSERT INTO users (email, password_hash, name, plan, created_at) VALUES (?, ?, ?, 'free', ?)",
            (email.lower(), pw_hash, name.strip(), _now())
        )
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
        token = create_token(user["id"], user["email"])
        return {
            "success": True,
            "token": token,
            "user_id": user["id"],
            "plan": "free",
            "name": user["name"] or user["email"],
        }
    except Exception as e:
        return {"success": False, "message": str(e)}
    finally:
        conn.close()


def login_user(email: str, password: str) -> dict:
    if not email or not password:
        return {"success": False, "message": "Email e senha são obrigatórios."}

    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email.lower(),)
        ).fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            return {"success": False, "message": "Email ou senha inválidos."}

        token = create_token(user["id"], user["email"])
        return {
            "success": True,
            "token": token,
            "user_id": user["id"],
            "plan": user["plan"],
            "name": user["name"] or user["email"],
        }
    except Exception as e:
        return {"success": False, "message": str(e)}
    finally:
        conn.close()


def get_user_by_token(token: str) -> Optional[dict]:
    payload = verify_token(token)
    if not payload:
        return None
    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (int(payload["sub"]),)).fetchone()
    conn.close()
    return dict(user) if user else None


def update_user_plan(user_id: int, plan: str):
    conn = get_connection()
    conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user_id))
    conn.commit()
    conn.close()


def _now() -> str:
    from datetime import datetime
    return datetime.utcnow().isoformat()
