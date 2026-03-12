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
        CREATE TABLE IF NOT EXISTS followed_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL,
            followed_at TEXT NOT NULL,
            unfollowed_at TEXT,
            status TEXT DEFAULT 'following'
        );

        CREATE TABLE IF NOT EXISTS follow_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            reason TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS analytics_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            followers_count INTEGER DEFAULT 0,
            following_count INTEGER DEFAULT 0,
            media_count INTEGER DEFAULT 0,
            captured_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS content_ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            hashtags TEXT,
            content_type TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS teleprompter_scripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            speed INTEGER DEFAULT 3,
            font_size INTEGER DEFAULT 36,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)

    # Default settings
    defaults = [
        ("follow_delay_min", "30"),
        ("follow_delay_max", "90"),
        ("daily_follow_limit", "0"),
        ("daily_unfollow_limit", "0"),
        ("follow_amount", "500"),
        ("unfollow_after_days", "7"),
        ("unfollow_non_followers", "true"),
        ("unfollow_followers", "false"),
    ]
    for key, value in defaults:
        cursor.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
            (key, value)
        )

    conn.commit()
    conn.close()


def get_setting(key: str) -> str:
    conn = get_connection()
    row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else None


def set_setting(key: str, value: str):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
        (key, value)
    )
    conn.commit()
    conn.close()


def log_action(action: str, user_id: str, username: str, reason: str = None):
    conn = get_connection()
    conn.execute(
        "INSERT INTO follow_log (action, user_id, username, reason, created_at) VALUES (?, ?, ?, ?, ?)",
        (action, user_id, username, reason, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
