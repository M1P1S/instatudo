import time
import random
import threading
from datetime import datetime
from typing import Optional

from .instagram_client import get_client
from ..db.database import get_connection, get_setting, log_action, is_within_active_window, delay_to_seconds

# Per-user state (keyed by app_user_id)
_follow_threads: dict = {}
_follow_running: dict = {}
_follow_statuses: dict = {}


def _status(user_id: int) -> dict:
    if user_id not in _follow_statuses:
        _follow_statuses[user_id] = {
            "running": False,
            "followed_today": 0,
            "last_action": None,
            "log": [],
        }
    return _follow_statuses[user_id]


def get_follow_status(user_id: int = 0) -> dict:
    return _status(user_id)


def _count_followed_today(user_id: int) -> int:
    conn = get_connection()
    today = datetime.utcnow().date().isoformat()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM follow_log WHERE app_user_id=? AND action='follow' AND created_at LIKE ?",
        (user_id, f"{today}%")
    ).fetchone()["c"]
    conn.close()
    return count


def _save_followed_user(ig_user_id: str, username: str, app_user_id: int):
    conn = get_connection()
    conn.execute(
        """INSERT OR IGNORE INTO followed_users (app_user_id, user_id, username, followed_at, status)
           VALUES (?, ?, ?, ?, 'following')""",
        (app_user_id, ig_user_id, username, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()


def start_auto_follow(target_username: str, source: str = "followers", app_user_id: int = 0):
    global _follow_running

    target_username = target_username.lstrip("@").strip()

    if _follow_running.get(app_user_id):
        return {"success": False, "message": "Auto-follow já está em execução."}

    _follow_running[app_user_id] = True
    st = _status(app_user_id)
    st["running"] = True
    st["log"] = []

    def run():
        cl = get_client(app_user_id)
        delay_min_raw = int(get_setting("follow_delay_min", app_user_id) or 30)
        delay_max_raw = int(get_setting("follow_delay_max", app_user_id) or 90)
        delay_unit = get_setting("follow_delay_unit", app_user_id) or "seconds"
        delay_min = delay_to_seconds(delay_min_raw, delay_unit)
        delay_max = delay_to_seconds(delay_max_raw, delay_unit)
        daily_limit = int(get_setting("daily_follow_limit", app_user_id) or 0)
        amount = int(get_setting("follow_amount", app_user_id) or 200)

        try:
            resp = cl.private_request(f"users/web_profile_info/?username={target_username}")
            target_id = int(resp["data"]["user"]["id"])

            if source == "followers":
                users = cl.user_followers(target_id, amount=amount)
            else:
                users = cl.user_following(target_id, amount=amount)

            for uid, user in users.items():
                if not _follow_running.get(app_user_id):
                    break

                if daily_limit > 0:
                    if _count_followed_today(app_user_id) >= daily_limit:
                        st["log"].append(f"Limite diário de {daily_limit} follows atingido.")
                        break

                conn = get_connection()
                already = conn.execute(
                    "SELECT id FROM followed_users WHERE app_user_id=? AND user_id=? AND status='following'",
                    (app_user_id, str(uid))
                ).fetchone()
                conn.close()
                if already:
                    continue

                allowed, reason = is_within_active_window(app_user_id)
                if not allowed:
                    st["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] ⏸ Aguardando — {reason}")
                    time.sleep(60)
                    continue

                try:
                    cl.user_follow(uid)
                    _save_followed_user(str(uid), user.username, app_user_id)
                    log_action("follow", str(uid), user.username, app_user_id=app_user_id)
                    st["followed_today"] = _count_followed_today(app_user_id)
                    msg = f"Seguiu @{user.username}"
                    st["last_action"] = msg
                    st["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
                    time.sleep(random.randint(delay_min, delay_max))
                except Exception as e:
                    st["log"].append(f"Erro ao seguir @{user.username}: {e}")

        except Exception as e:
            st["log"].append(f"Erro geral: {e}")
        finally:
            _follow_running[app_user_id] = False
            st["running"] = False
            st["last_action"] = "Finalizado"

    _follow_threads[app_user_id] = threading.Thread(target=run, daemon=True)
    _follow_threads[app_user_id].start()
    return {"success": True, "message": f"Auto-follow iniciado para @{target_username}"}


def stop_auto_follow(app_user_id: int = 0):
    _follow_running[app_user_id] = False
    _status(app_user_id)["running"] = False
    return {"success": True, "message": "Auto-follow parado."}
