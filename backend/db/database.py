import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "instatudo.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        -- ── App users (SaaS accounts) ─────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT DEFAULT '',
            plan TEXT DEFAULT 'free',
            asaas_customer_id TEXT,
            created_at TEXT NOT NULL
        );

        -- ── Instagram bot data (per-user) ─────────────────────────────────────
        CREATE TABLE IF NOT EXISTS followed_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_user_id INTEGER NOT NULL DEFAULT 0,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            followed_at TEXT NOT NULL,
            unfollowed_at TEXT,
            status TEXT DEFAULT 'following'
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_followed_users_uid
            ON followed_users (app_user_id, user_id);

        CREATE TABLE IF NOT EXISTS follow_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_user_id INTEGER NOT NULL DEFAULT 0,
            action TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            reason TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS analytics_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_user_id INTEGER NOT NULL DEFAULT 0,
            followers_count INTEGER DEFAULT 0,
            following_count INTEGER DEFAULT 0,
            media_count INTEGER DEFAULT 0,
            captured_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS content_ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_user_id INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            description TEXT,
            hashtags TEXT,
            content_type TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS teleprompter_scripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_user_id INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            speed INTEGER DEFAULT 3,
            font_size INTEGER DEFAULT 36,
            created_at TEXT NOT NULL
        );

        -- ── Customer list (papelaria personalizada prospects) ────────────────
        CREATE TABLE IF NOT EXISTS customer_list (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_user_id INTEGER NOT NULL DEFAULT 0,
            username TEXT NOT NULL,
            full_name TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            followers INTEGER DEFAULT 0,
            following INTEGER DEFAULT 0,
            posts INTEGER DEFAULT 0,
            profile_url TEXT DEFAULT '',
            profile_pic TEXT DEFAULT '',
            hashtag_source TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'prospect',
            created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_list_username
            ON customer_list (app_user_id, username);

        -- ── Per-user settings (app_user_id=0 = global defaults) ──────────────
        CREATE TABLE IF NOT EXISTS app_settings (
            app_user_id INTEGER NOT NULL DEFAULT 0,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (app_user_id, key)
        );
    """)

    # Global default settings (app_user_id = 0)
    defaults = [
        ("follow_delay_min", "30"),
        ("follow_delay_max", "90"),
        ("follow_delay_unit", "seconds"),
        ("daily_follow_limit", "0"),
        ("daily_unfollow_limit", "0"),
        ("follow_amount", "500"),
        ("unfollow_after_days", "7"),
        ("unfollow_non_followers", "true"),
        ("unfollow_followers", "false"),
        ("active_hours_start", "0"),
        ("active_hours_end", "23"),
        ("active_days", "0,1,2,3,4,5,6"),
    ]
    for key, value in defaults:
        cursor.execute(
            "INSERT OR IGNORE INTO app_settings (app_user_id, key, value) VALUES (0, ?, ?)",
            (key, value)
        )

    conn.commit()
    conn.close()


def get_setting(key: str, user_id: int = 0) -> str:
    """Get setting for user, falling back to global defaults (user_id=0)."""
    conn = get_connection()
    row = conn.execute(
        "SELECT value FROM app_settings WHERE app_user_id=? AND key=?", (user_id, key)
    ).fetchone()
    if not row and user_id != 0:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE app_user_id=0 AND key=?", (key,)
        ).fetchone()
    conn.close()
    return row["value"] if row else None


def set_setting(key: str, value: str, user_id: int = 0):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (app_user_id, key, value) VALUES (?, ?, ?)",
        (user_id, key, value)
    )
    conn.commit()
    conn.close()


def is_within_active_window(user_id: int = 0) -> tuple:
    """Returns (allowed, reason_if_not)."""
    now = datetime.now()
    hour = now.hour
    weekday = now.weekday()

    try:
        start = int(get_setting("active_hours_start", user_id) or 0)
        end = int(get_setting("active_hours_end", user_id) or 23)
        days_raw = get_setting("active_days", user_id) or "0,1,2,3,4,5,6"
        active_days = [int(d) for d in days_raw.split(",") if d.strip()]
    except Exception:
        return True, ""

    if weekday not in active_days:
        day_names = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
        return False, f"Hoje ({day_names[weekday]}) não está nos dias ativos."

    if start <= end:
        allowed = start <= hour <= end
    else:
        allowed = hour >= start or hour <= end

    if not allowed:
        return False, f"Fora do horário ativo ({start:02d}:00 – {end:02d}:59)."

    return True, ""


def delay_to_seconds(value: int, unit: str) -> int:
    return value * {"seconds": 1, "minutes": 60, "hours": 3600}.get(unit, 1)


def log_action(action: str, ig_user_id: str, username: str, reason: str = None, app_user_id: int = 0):
    conn = get_connection()
    conn.execute(
        "INSERT INTO follow_log (app_user_id, action, user_id, username, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (app_user_id, action, ig_user_id, username, reason, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
