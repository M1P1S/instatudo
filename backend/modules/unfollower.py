import time
import random
import threading
from datetime import datetime, timedelta
from typing import Optional

from .instagram_client import get_client
from ..db.database import get_connection, get_setting, log_action

_unfollow_thread: Optional[threading.Thread] = None
_unfollow_running = False
_unfollow_status = {"running": False, "unfollowed_today": 0, "last_action": None, "log": []}


def get_unfollow_status() -> dict:
    return _unfollow_status


def _count_unfollowed_today() -> int:
    conn = get_connection()
    today = datetime.utcnow().date().isoformat()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM follow_log WHERE action='unfollow' AND created_at LIKE ?",
        (f"{today}%",)
    ).fetchone()["c"]
    conn.close()
    return count


def _mark_unfollowed(user_id: str):
    conn = get_connection()
    conn.execute(
        "UPDATE followed_users SET status='unfollowed', unfollowed_at=? WHERE user_id=?",
        (datetime.utcnow().isoformat(), user_id)
    )
    conn.commit()
    conn.close()


def start_auto_unfollow(mode: str = "non_followers"):
    """
    mode: 'non_followers' = só quem não te segue de volta
          'all_followed'  = todos que você seguiu pelo bot
    """
    global _unfollow_thread, _unfollow_running, _unfollow_status

    if _unfollow_running:
        return {"success": False, "message": "Auto-unfollow já está em execução."}

    _unfollow_running = True
    _unfollow_status["running"] = True
    _unfollow_status["log"] = []

    def run():
        global _unfollow_running
        cl = get_client()
        delay_min = int(get_setting("follow_delay_min") or 30)
        delay_max = int(get_setting("follow_delay_max") or 90)
        daily_limit = int(get_setting("daily_unfollow_limit") or 0)

        try:
            my_id = cl.user_id

            # Get my current followers (as a set of user_ids)
            my_followers = set(cl.user_followers(my_id, amount=10000).keys())

            # Get users we followed via the bot
            conn = get_connection()
            bot_followed = conn.execute(
                "SELECT user_id, username FROM followed_users WHERE status='following'"
            ).fetchall()
            conn.close()

            for row in bot_followed:
                if not _unfollow_running:
                    break

                if daily_limit > 0:
                    unfollowed_today = _count_unfollowed_today()
                    if unfollowed_today >= daily_limit:
                        msg = f"Limite diário de {daily_limit} unfollows atingido."
                        _unfollow_status["log"].append(msg)
                        break

                uid = int(row["user_id"])
                username = row["username"]

                if mode == "non_followers" and uid in my_followers:
                    # They follow back, skip
                    continue

                try:
                    cl.user_unfollow(uid)
                    _mark_unfollowed(str(uid))
                    log_action("unfollow", str(uid), username, reason=mode)
                    _unfollow_status["unfollowed_today"] = _count_unfollowed_today()
                    msg = f"Deixou de seguir @{username}"
                    _unfollow_status["last_action"] = msg
                    _unfollow_status["log"].append(f"[{datetime.utcnow().strftime('%H:%M:%S')}] {msg}")

                    delay = random.randint(delay_min, delay_max)
                    time.sleep(delay)
                except Exception as e:
                    _unfollow_status["log"].append(f"Erro ao deixar de seguir @{username}: {e}")

        except Exception as e:
            _unfollow_status["log"].append(f"Erro geral: {e}")
        finally:
            _unfollow_running = False
            _unfollow_status["running"] = False
            _unfollow_status["last_action"] = "Finalizado"

    _unfollow_thread = threading.Thread(target=run, daemon=True)
    _unfollow_thread.start()
    return {"success": True, "message": "Auto-unfollow iniciado."}


def stop_auto_unfollow():
    global _unfollow_running
    _unfollow_running = False
    _unfollow_status["running"] = False
    return {"success": True, "message": "Auto-unfollow parado."}
