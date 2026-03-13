from datetime import datetime
from ..db.database import get_connection


def save_script(title: str, content: str, speed: int = 3, font_size: int = 36, app_user_id: int = 0) -> dict:
    conn = get_connection()
    conn.execute(
        """INSERT INTO teleprompter_scripts (app_user_id, title, content, speed, font_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (app_user_id, title, content, speed, font_size, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Roteiro salvo!"}


def get_scripts(app_user_id: int = 0) -> list:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM teleprompter_scripts WHERE app_user_id=? ORDER BY created_at DESC", (app_user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_script(script_id: int, app_user_id: int = 0) -> dict:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM teleprompter_scripts WHERE id=? AND app_user_id=?", (script_id, app_user_id)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_script(script_id: int, title: str, content: str, speed: int, font_size: int, app_user_id: int = 0) -> dict:
    conn = get_connection()
    conn.execute(
        "UPDATE teleprompter_scripts SET title=?, content=?, speed=?, font_size=? WHERE id=? AND app_user_id=?",
        (title, content, speed, font_size, script_id, app_user_id)
    )
    conn.commit()
    conn.close()
    return {"success": True}


def delete_script(script_id: int, app_user_id: int = 0) -> dict:
    conn = get_connection()
    conn.execute(
        "DELETE FROM teleprompter_scripts WHERE id=? AND app_user_id=?", (script_id, app_user_id)
    )
    conn.commit()
    conn.close()
    return {"success": True}
