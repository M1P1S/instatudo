import os
import json
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, TwoFactorRequired

SESSION_FILE = Path(__file__).parent.parent / "db" / "session.json"

_client: Client = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = Client()
    return _client


def login(username: str, password: str, verification_code: str = None) -> dict:
    cl = get_client()

    # Try to reuse saved session
    if SESSION_FILE.exists():
        try:
            cl.load_settings(SESSION_FILE)
            cl.login(username, password)
            cl.dump_settings(SESSION_FILE)
            return {"success": True, "message": "Sessão restaurada com sucesso."}
        except Exception:
            pass  # Fall through to fresh login

    try:
        if verification_code:
            cl.login(username, password, verification_code=verification_code)
        else:
            cl.login(username, password)
        cl.dump_settings(SESSION_FILE)
        return {"success": True, "message": "Login realizado com sucesso."}
    except TwoFactorRequired:
        return {"success": False, "requires_2fa": True, "message": "Código 2FA necessário."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def is_logged_in() -> bool:
    cl = get_client()
    if not SESSION_FILE.exists():
        return False
    try:
        cl.load_settings(SESSION_FILE)
        cl.get_timeline_feed()
        return True
    except Exception:
        return False


def logout():
    global _client
    cl = get_client()
    try:
        cl.logout()
    except Exception:
        pass
    if SESSION_FILE.exists():
        SESSION_FILE.unlink()
    _client = None
