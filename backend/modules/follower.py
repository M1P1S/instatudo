import time
import random
import threading
from datetime import datetime, timedelta
from typing import Optional

from .instagram_client import get_client
from ..db.database import get_connection, get_setting, log_action, is_within_active_window, delay_to_seconds

_follow_thread: Optional[threading.Thread] = None
_follow_running = False
_follow_status = {"running": False, "followed_today": 0, "last_action": None, "log": []}


def get_follow_status() -> dict:
    return _follow_status


def _count_followed_today() -> int:
    conn = get_connection()
    today = datetime.utcnow().date().isoformat()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM follow_log WHERE action='follow' AND created_at LIKE ?",
        (f"{today}%",)
    ).fetchone()["c"]
    conn.close()
    return count


def _save_followed_user(user_id: str, username: str):
    conn = get_connection()
    conn.execute(
        """INSERT OR IGNORE INTO followed_users (user_id, username, followed_at, status)
           VALUES (?, ?, ?, 'following')""",
        (user_id, username, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()


def start_auto_follow(target_username: str, source: str = "followers"):
    """
    Follow users from a target account's followers or following list.
    source: 'followers' | 'following'
    """
    global _follow_thread, _follow_running, _follow_status

    target_username = target_username.lstrip('@').strip()

    if _follow_running:
        return {"success": False, "message": "Auto-follow já está em execução."}

    _follow_running = True
    _follow_status["running"] = True
    _follow_status["log"] = []

    def run():
        global _follow_running
        cl = get_client()
        delay_min_raw = int(get_setting("follow_delay_min") or 30)
        delay_max_raw = int(get_setting("follow_delay_max") or 90)
        delay_unit = get_setting("follow_delay_unit") or "seconds"
        delay_min = delay_to_seconds(delay_min_raw, delay_unit)
        delay_max = delay_to_seconds(delay_max_raw, delay_unit)
        daily_limit = int(get_setting("daily_follow_limit") or 0)
        amount = int(get_setting("follow_amount") or 200)

        try:
            target_user = cl.user_info_by_username(target_username)
            target_id = target_user.pk

            if source == "followers":
                users = cl.user_followers(target_id, amount=amount)
            else:
                users = cl.user_following(target_id, amount=amount)

            for uid, user in users.items():
                if not _follow_running:
                    break

                if daily_limit > 0:
                    followed_today = _count_followed_today()
                    if followed_today >= daily_limit:
                        msg = f"Limite diário de {daily_limit} follows atingido."
                        _follow_status["log"].append(msg)
                        break

                # Skip already followed
                conn = get_connection()
                already = conn.execute(
                    "SELECT id FROM followed_users WHERE user_id = ? AND status = 'following'",
                    (str(uid),)
                ).fetchone()
                conn.close()
                if already:
                    continue

                allowed, reason = is_within_active_window()
                if not allowed:
                    _follow_status["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] ⏸ Aguardando janela ativa — {reason}")
                    time.sleep(60)
                    continue

                try:
                    cl.user_follow(uid)
                    _save_followed_user(str(uid), user.username)
                    log_action("follow", str(uid), user.username)
                    _follow_status["followed_today"] = _count_followed_today()
                    msg = f"Seguiu @{user.username}"
                    _follow_status["last_action"] = msg
                    _follow_status["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

                    delay = random.randint(delay_min, delay_max)
                    time.sleep(delay)
                except Exception as e:
                    _follow_status["log"].append(f"Erro ao seguir @{user.username}: {e}")

        except Exception as e:
            _follow_status["log"].append(f"Erro geral: {e}")
        finally:
            _follow_running = False
            _follow_status["running"] = False
            _follow_status["last_action"] = "Finalizado"

    _follow_thread = threading.Thread(target=run, daemon=True)
    _follow_thread.start()
    return {"success": True, "message": f"Auto-follow iniciado para seguidores de @{target_username}"}


def stop_auto_follow():
    global _follow_running
    _follow_running = False
    _follow_status["running"] = False
    return {"success": True, "message": "Auto-follow parado."}
