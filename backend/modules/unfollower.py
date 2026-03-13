import time
import random
import threading
from datetime import datetime
from typing import Optional

from .instagram_client import get_client
from ..db.database import get_connection, get_setting, log_action, is_within_active_window, delay_to_seconds

# Per-user state
_unfollow_threads: dict = {}
_unfollow_running: dict = {}
_unfollow_statuses: dict = {}


def _status(user_id: int) -> dict:
    if user_id not in _unfollow_statuses:
        _unfollow_statuses[user_id] = {
            "running": False,
            "unfollowed_today": 0,
            "last_action": None,
            "log": [],
        }
    return _unfollow_statuses[user_id]


def get_unfollow_status(user_id: int = 0) -> dict:
    return _status(user_id)


def _count_unfollowed_today(user_id: int) -> int:
    conn = get_connection()
    today = datetime.utcnow().date().isoformat()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM follow_log WHERE app_user_id=? AND action='unfollow' AND created_at LIKE ?",
        (user_id, f"{today}%")
    ).fetchone()["c"]
    conn.close()
    return count


def _mark_unfollowed(ig_user_id: str, app_user_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE followed_users SET status='unfollowed', unfollowed_at=? WHERE app_user_id=? AND user_id=?",
        (datetime.utcnow().isoformat(), app_user_id, ig_user_id)
    )
    conn.commit()
    conn.close()


def start_auto_unfollow(mode: str = "non_followers", app_user_id: int = 0):
    global _unfollow_running

    if _unfollow_running.get(app_user_id):
        return {"success": False, "message": "Auto-unfollow já está em execução."}

    _unfollow_running[app_user_id] = True
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
        daily_limit = int(get_setting("daily_unfollow_limit", app_user_id) or 0)

        try:
            my_id = cl.user_id
            my_followers = set(cl.user_followers(my_id, amount=10000).keys())

            conn = get_connection()
            bot_followed = conn.execute(
                "SELECT user_id, username FROM followed_users WHERE app_user_id=? AND status='following'",
                (app_user_id,)
            ).fetchall()
            conn.close()

            for row in bot_followed:
                if not _unfollow_running.get(app_user_id):
                    break

                if daily_limit > 0:
                    if _count_unfollowed_today(app_user_id) >= daily_limit:
                        st["log"].append(f"Limite diário de {daily_limit} unfollows atingido.")
                        break

                uid = int(row["user_id"])
                username = row["username"]

                if mode == "non_followers" and uid in my_followers:
                    continue

                allowed, reason = is_within_active_window(app_user_id)
                if not allowed:
                    st["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] ⏸ Aguardando — {reason}")
                    time.sleep(60)
                    continue

                try:
                    cl.user_unfollow(uid)
                    _mark_unfollowed(str(uid), app_user_id)
                    log_action("unfollow", str(uid), username, reason=mode, app_user_id=app_user_id)
                    st["unfollowed_today"] = _count_unfollowed_today(app_user_id)
                    msg = f"Deixou de seguir @{username}"
                    st["last_action"] = msg
                    st["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
                    time.sleep(random.randint(delay_min, delay_max))
                except Exception as e:
                    st["log"].append(f"Erro ao deixar de seguir @{username}: {e}")

        except Exception as e:
            st["log"].append(f"Erro geral: {e}")
        finally:
            _unfollow_running[app_user_id] = False
            st["running"] = False
            st["last_action"] = "Finalizado"

    _unfollow_threads[app_user_id] = threading.Thread(target=run, daemon=True)
    _unfollow_threads[app_user_id].start()
    return {"success": True, "message": "Auto-unfollow iniciado."}


def stop_auto_unfollow(app_user_id: int = 0):
    _unfollow_running[app_user_id] = False
    _status(app_user_id)["running"] = False
    return {"success": True, "message": "Auto-unfollow parado."}
