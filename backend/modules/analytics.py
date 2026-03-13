from datetime import datetime
from .instagram_client import get_client
from ..db.database import get_connection


def capture_snapshot(app_user_id: int = 0) -> dict:
    cl = get_client(app_user_id)
    user = cl.user_info(cl.user_id)

    conn = get_connection()
    conn.execute(
        """INSERT INTO analytics_snapshot (app_user_id, followers_count, following_count, media_count, captured_at)
           VALUES (?, ?, ?, ?, ?)""",
        (app_user_id, user.follower_count, user.following_count, user.media_count, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

    return {
        "followers": user.follower_count,
        "following": user.following_count,
        "media_count": user.media_count,
        "captured_at": datetime.utcnow().isoformat(),
    }


def get_snapshots(limit: int = 30, app_user_id: int = 0) -> list:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM analytics_snapshot WHERE app_user_id=? ORDER BY captured_at DESC LIMIT ?",
        (app_user_id, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_profile_summary(app_user_id: int = 0) -> dict:
    cl = get_client(app_user_id)
    user = cl.user_info(cl.user_id)

    medias = cl.user_medias(cl.user_id, amount=12)
    posts = []
    total_likes = total_comments = total_views = 0

    for m in medias:
        likes = m.like_count or 0
        comments = m.comment_count or 0
        views = m.view_count or 0
        total_likes += likes
        total_comments += comments
        total_views += views
        posts.append({
            "id": str(m.pk),
            "media_type": m.media_type,
            "likes": likes,
            "comments": comments,
            "views": views,
            "taken_at": m.taken_at.isoformat() if m.taken_at else None,
            "caption": (m.caption_text or "")[:120],
        })

    conn = get_connection()
    history = conn.execute(
        "SELECT followers_count, captured_at FROM analytics_snapshot WHERE app_user_id=? ORDER BY captured_at DESC LIMIT 2",
        (app_user_id,)
    ).fetchall()
    conn.close()

    growth = 0
    if len(history) == 2:
        growth = history[0]["followers_count"] - history[1]["followers_count"]

    avg_engagement = round((total_likes + total_comments) / len(posts), 1) if posts else 0

    return {
        "username": user.username,
        "full_name": user.full_name,
        "followers": user.follower_count,
        "following": user.following_count,
        "media_count": user.media_count,
        "biography": user.biography,
        "growth_since_last_capture": growth,
        "avg_engagement_per_post": avg_engagement,
        "total_likes_recent": total_likes,
        "total_comments_recent": total_comments,
        "total_views_recent": total_views,
        "posts": posts,
    }


def get_follow_stats(app_user_id: int = 0) -> dict:
    conn = get_connection()
    total_followed = conn.execute(
        "SELECT COUNT(*) as c FROM followed_users WHERE app_user_id=?", (app_user_id,)
    ).fetchone()["c"]
    total_unfollowed = conn.execute(
        "SELECT COUNT(*) as c FROM followed_users WHERE app_user_id=? AND status='unfollowed'", (app_user_id,)
    ).fetchone()["c"]
    still_following = conn.execute(
        "SELECT COUNT(*) as c FROM followed_users WHERE app_user_id=? AND status='following'", (app_user_id,)
    ).fetchone()["c"]
    recent_log = conn.execute(
        "SELECT * FROM follow_log WHERE app_user_id=? ORDER BY created_at DESC LIMIT 20", (app_user_id,)
    ).fetchall()
    conn.close()

    return {
        "total_followed_by_bot": total_followed,
        "total_unfollowed_by_bot": total_unfollowed,
        "currently_following_by_bot": still_following,
        "recent_log": [dict(r) for r in recent_log],
    }
