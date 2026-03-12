import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from .db.database import init_db, get_setting, set_setting
from .modules import instagram_client, follower, unfollower, analytics, content, teleprompter

app = FastAPI(title="InstaTudo", version="1.0.0")

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()


# ── Static files ──────────────────────────────────────────────────────────────
FRONTEND = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND, "static")), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND, "templates", "index.html"))


@app.get("/teleprompter-page")
def tp_page():
    return FileResponse(os.path.join(FRONTEND, "templates", "teleprompter.html"))


# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    username: str
    password: str
    verification_code: Optional[str] = None


@app.post("/api/auth/login")
def login(body: LoginBody):
    return instagram_client.login(body.username, body.password, body.verification_code)


@app.get("/api/auth/status")
def auth_status():
    return {"logged_in": instagram_client.is_logged_in()}


@app.post("/api/auth/logout")
def logout():
    instagram_client.logout()
    return {"success": True}


# ── Follow ────────────────────────────────────────────────────────────────────
class FollowBody(BaseModel):
    target_username: str
    source: str = "followers"


@app.post("/api/follow/start")
def follow_start(body: FollowBody):
    return follower.start_auto_follow(body.target_username, body.source)


@app.post("/api/follow/stop")
def follow_stop():
    return follower.stop_auto_follow()


@app.get("/api/follow/status")
def follow_status():
    return follower.get_follow_status()


# ── Unfollow ──────────────────────────────────────────────────────────────────
class UnfollowBody(BaseModel):
    mode: str = "non_followers"


@app.post("/api/unfollow/start")
def unfollow_start(body: UnfollowBody):
    return unfollower.start_auto_unfollow(body.mode)


@app.post("/api/unfollow/stop")
def unfollow_stop():
    return unfollower.stop_auto_unfollow()


@app.get("/api/unfollow/status")
def unfollow_status():
    return unfollower.get_unfollow_status()


# ── Analytics ─────────────────────────────────────────────────────────────────
@app.post("/api/analytics/capture")
def capture():
    return analytics.capture_snapshot()


@app.get("/api/analytics/summary")
def summary():
    return analytics.get_profile_summary()


@app.get("/api/analytics/history")
def history():
    return analytics.get_snapshots()


@app.get("/api/analytics/follow-stats")
def follow_stats():
    return analytics.get_follow_stats()


# ── Content ───────────────────────────────────────────────────────────────────
class ContentBody(BaseModel):
    topic: str
    niche: str = ""
    count: int = 8


@app.post("/api/content/generate")
def generate(body: ContentBody):
    return content.generate_ideas(body.topic, body.niche, body.count)


class SaveIdeaBody(BaseModel):
    title: str
    description: str
    hashtags: str
    content_type: str


@app.post("/api/content/save")
def save_idea(body: SaveIdeaBody):
    return content.save_idea(body.title, body.description, body.hashtags, body.content_type)


@app.get("/api/content/ideas")
def get_ideas():
    return content.get_saved_ideas()


@app.patch("/api/content/ideas/{idea_id}")
def update_idea(idea_id: int, status: str):
    return content.update_idea_status(idea_id, status)


# ── Teleprompter ──────────────────────────────────────────────────────────────
class ScriptBody(BaseModel):
    title: str
    content: str
    speed: int = 3
    font_size: int = 36


@app.post("/api/teleprompter/scripts")
def create_script(body: ScriptBody):
    return teleprompter.save_script(body.title, body.content, body.speed, body.font_size)


@app.get("/api/teleprompter/scripts")
def list_scripts():
    return teleprompter.get_scripts()


@app.get("/api/teleprompter/scripts/{script_id}")
def get_script(script_id: int):
    s = teleprompter.get_script(script_id)
    if not s:
        raise HTTPException(status_code=404, detail="Roteiro não encontrado")
    return s


@app.put("/api/teleprompter/scripts/{script_id}")
def update_script(script_id: int, body: ScriptBody):
    return teleprompter.update_script(script_id, body.title, body.content, body.speed, body.font_size)


@app.delete("/api/teleprompter/scripts/{script_id}")
def delete_script(script_id: int):
    return teleprompter.delete_script(script_id)


# ── Settings ──────────────────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings():
    keys = [
        "follow_delay_min", "follow_delay_max", "daily_follow_limit",
        "daily_unfollow_limit", "unfollow_after_days",
        "unfollow_non_followers", "unfollow_followers"
    ]
    return {k: get_setting(k) for k in keys}


class SettingBody(BaseModel):
    key: str
    value: str


@app.post("/api/settings")
def save_setting(body: SettingBody):
    set_setting(body.key, body.value)
    return {"success": True}
