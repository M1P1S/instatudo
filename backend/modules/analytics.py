from datetime import datetime
from .instagram_client import get_client
from ..db.database import get_connection


def capture_snapshot() -> dict:
    """Captures current profile metrics and saves to DB."""
    cl = get_client()
    user = cl.user_info(cl.user_id)

    followers = user.follower_count
    following = user.following_count
    media = user.media_count

    conn = get_connection()
    conn.execute(
        """INSERT INTO analytics_snapshot (followers_count, following_count, media_count, captured_at)
           VALUES (?, ?, ?, ?)""",
        (followers, following, media, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

    return {
        "followers": followers,
        "following": following,
        "media_count": media,
        "captured_at": datetime.utcnow().isoformat(),
    }


def get_snapshots(limit: int = 30) -> list:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM analytics_snapshot ORDER BY captured_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_profile_summary() -> dict:
    """Returns current profile info + recent posts metrics."""
    cl = get_client()
    user = cl.user_info(cl.user_id)

    # Get recent media
    medias = cl.user_medias(cl.user_id, amount=12)
    posts = []
    total_likes = 0
    total_comments = 0
    total_views = 0

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
            "thumbnail": str(m.thumbnail_url or m.image_versions2 and "" or ""),
            "likes": likes,
            "comments": comments,
            "views": views,
            "taken_at": m.taken_at.isoformat() if m.taken_at else None,
            "caption": (m.caption_text or "")[:120],
        })

    # Growth calculation
    conn = get_connection()
    history = conn.execute(
        "SELECT followers_count, captured_at FROM analytics_snapshot ORDER BY captured_at DESC LIMIT 2"
    ).fetchall()
    conn.close()

    growth = 0
    if len(history) == 2:
        growth = history[0]["followers_count"] - history[1]["followers_count"]

    avg_engagement = 0
    if posts:
        avg_engagement = round((total_likes + total_comments) / len(posts), 1)

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


def get_follow_stats() -> dict:
    conn = get_connection()
    total_followed = conn.execute(
        "SELECT COUNT(*) as c FROM followed_users"
    ).fetchone()["c"]
    total_unfollowed = conn.execute(
        "SELECT COUNT(*) as c FROM followed_users WHERE status='unfollowed'"
    ).fetchone()["c"]
    still_following = conn.execute(
        "SELECT COUNT(*) as c FROM followed_users WHERE status='following'"
    ).fetchone()["c"]
    recent_log = conn.execute(
        "SELECT * FROM follow_log ORDER BY created_at DESC LIMIT 20"
    ).fetchall()
    conn.close()

    return {
        "total_followed_by_bot": total_followed,
        "total_unfollowed_by_bot": total_unfollowed,
        "currently_following_by_bot": still_following,
        "recent_log": [dict(r) for r in recent_log],
    }
