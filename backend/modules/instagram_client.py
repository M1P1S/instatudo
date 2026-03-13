import os
import json
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, TwoFactorRequired

SESSION_DIR = Path(__file__).parent.parent / "db"

# Dict of clients keyed by app_user_id
_clients: dict = {}


def _session_file(user_id: int) -> Path:
    return SESSION_DIR / f"session_{user_id}.json"


def get_client(user_id: int = 0) -> Client:
    global _clients
    if user_id not in _clients:
        _clients[user_id] = Client()
        sf = _session_file(user_id)
        if sf.exists():
            try:
                _clients[user_id].load_settings(sf)
            except Exception:
                pass
    return _clients[user_id]


def login(username: str, password: str, verification_code: str = None, user_id: int = 0) -> dict:
    cl = get_client(user_id)
    sf = _session_file(user_id)

    if sf.exists():
        try:
            cl.load_settings(sf)
            cl.login(username, password)
            cl.dump_settings(sf)
            return {"success": True, "message": "Sessão restaurada com sucesso."}
        except Exception:
            pass

    try:
        if verification_code:
            cl.login(username, password, verification_code=verification_code)
        else:
            cl.login(username, password)
        cl.dump_settings(sf)
        return {"success": True, "message": "Login realizado com sucesso."}
    except TwoFactorRequired:
        return {"success": False, "requires_2fa": True, "message": "Código 2FA necessário."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def is_logged_in(user_id: int = 0) -> bool:
    sf = _session_file(user_id)
    if not sf.exists():
        return False
    cl = get_client(user_id)
    try:
        cl.load_settings(sf)
        cl.get_timeline_feed()
        return True
    except Exception:
        return False


def logout(user_id: int = 0):
    global _clients
    cl = get_client(user_id)
    try:
        cl.logout()
    except Exception:
        pass
    sf = _session_file(user_id)
    if sf.exists():
        sf.unlink()
    _clients.pop(user_id, None)
