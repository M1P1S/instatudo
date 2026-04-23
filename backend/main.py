import os
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

# Load .env before any module reads os.getenv()
load_dotenv()

from .db.database import init_db, get_setting, set_setting, get_connection
from .modules import instagram_client, follower, unfollower, analytics, content, teleprompter
from .modules import app_auth, asaas, entregas

app = FastAPI(title="InstaTudo", version="2.0.0")

# ── Startup ────────────────────────────────────────────────────────────────────
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


@app.get("/entregas")
def entregas_page():
    return FileResponse(os.path.join(FRONTEND, "templates", "entregas.html"))


# ── JWT Auth dependency ────────────────────────────────────────────────────────

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Autenticação necessária.")
    token = authorization[7:]
    user = app_auth.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.")
    return dict(user)


def require_pro(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("plan") != "pro":
        raise HTTPException(
            status_code=403,
            detail="Esta funcionalidade requer o plano Pro. Faça o upgrade para continuar."
        )
    return current_user


# ── Plans definition ──────────────────────────────────────────────────────────
PLANS = {
    "free": {
        "name": "Gratuito",
        "price": 0,
        "description": "Dashboard + acesso limitado a conteúdo e teleprompter",
        "features": [
            "Dashboard e analytics",
            "Gerar ideias de conteúdo (ilimitado)",
            "Salvar até 10 ideias/mês",
            "Até 3 roteiros no Teleprompter",
        ],
        "locked": ["Auto-Follow", "Auto-Unfollow", "Configurações avançadas"],
    },
    "pro": {
        "name": "Pro",
        "price": 49.90,
        "description": "Acesso completo a todas as funcionalidades",
        "features": [
            "Dashboard completo",
            "Auto-Follow ilimitado",
            "Auto-Unfollow ilimitado",
            "Ideias de conteúdo ilimitadas",
            "Roteiros ilimitados no Teleprompter",
            "Configurações avançadas",
            "Suporte prioritário",
        ],
    },
}

# ── Free plan limits ──────────────────────────────────────────────────────────
FREE_CONTENT_SAVES_PER_MONTH = 10
FREE_TELEPROMPTER_SCRIPTS = 3


def _count_content_saves_this_month(app_user_id: int) -> int:
    month_prefix = datetime.utcnow().strftime("%Y-%m") + "%"
    conn = get_connection()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM content_ideas WHERE app_user_id=? AND created_at LIKE ?",
        (app_user_id, month_prefix)
    ).fetchone()["c"]
    conn.close()
    return count


def _count_teleprompter_scripts(app_user_id: int) -> int:
    conn = get_connection()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM teleprompter_scripts WHERE app_user_id=?", (app_user_id,)
    ).fetchone()["c"]
    conn.close()
    return count


# ── App-level auth (register/login) ──────────────────────────────────────────
class RegisterBody(BaseModel):
    email: str
    password: str
    name: str = ""


class AppLoginBody(BaseModel):
    email: str
    password: str


@app.post("/api/app/register")
def register(body: RegisterBody):
    return app_auth.register_user(body.email, body.password, body.name)


@app.post("/api/app/login")
def app_login(body: AppLoginBody):
    return app_auth.login_user(body.email, body.password)


@app.get("/api/app/me")
def me(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    plan = current_user["plan"]
    usage = {}
    if plan == "free":
        saves = _count_content_saves_this_month(uid)
        scripts = _count_teleprompter_scripts(uid)
        usage = {
            "content_saves_this_month": saves,
            "content_saves_limit": FREE_CONTENT_SAVES_PER_MONTH,
            "teleprompter_scripts": scripts,
            "teleprompter_scripts_limit": FREE_TELEPROMPTER_SCRIPTS,
        }
    return {
        "id": uid,
        "email": current_user["email"],
        "name": current_user["name"],
        "plan": plan,
        "plan_info": PLANS.get(plan, PLANS["free"]),
        "usage": usage,
    }


@app.get("/api/plans")
def get_plans():
    return PLANS


# ── Subscriptions / Asaas ─────────────────────────────────────────────────────
@app.get("/api/subscriptions/checkout")
def checkout(current_user: dict = Depends(get_current_user)):
    """Generate Asaas payment link for Pro upgrade."""
    if current_user["plan"] == "pro":
        return {"success": False, "message": "Você já possui o plano Pro!"}

    url = asaas.create_payment_link(current_user["id"])
    if url:
        return {"success": True, "url": url, "price": 49.90}

    # Asaas not configured — return instructions
    return {
        "success": False,
        "message": "Sistema de pagamento não configurado. Configure ASAAS_API_KEY no servidor.",
        "manual": True,
    }


@app.get("/api/subscriptions/status")
def subscription_status(current_user: dict = Depends(get_current_user)):
    customer_id = current_user.get("asaas_customer_id")
    active = asaas.get_active_subscription(customer_id) if customer_id else False
    return {
        "plan": current_user["plan"],
        "active_subscription": active,
        "plan_info": PLANS.get(current_user["plan"]),
    }


@app.post("/api/webhooks/asaas")
async def asaas_webhook(request: Request):
    """Asaas webhook — no auth required (validated by payload)."""
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"ok": False}, status_code=400)

    result = asaas.process_webhook(payload)
    if result["user_id"] and result["plan"]:
        app_auth.update_user_plan(result["user_id"], result["plan"])
    return {"ok": True}


# ── Instagram auth ────────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    username: str
    password: str
    verification_code: Optional[str] = None


@app.post("/api/auth/login")
def login(body: LoginBody, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    return instagram_client.login(body.username, body.password, body.verification_code, user_id=uid)


@app.get("/api/auth/status")
def auth_status(current_user: dict = Depends(get_current_user)):
    return {"logged_in": instagram_client.is_logged_in(user_id=current_user["id"])}


@app.post("/api/auth/logout")
def logout(current_user: dict = Depends(get_current_user)):
    instagram_client.logout(user_id=current_user["id"])
    return {"success": True}


# ── Follow (Pro only) ─────────────────────────────────────────────────────────
class FollowBody(BaseModel):
    target_username: str
    source: str = "followers"


@app.post("/api/follow/start")
def follow_start(body: FollowBody, current_user: dict = Depends(require_pro)):
    return follower.start_auto_follow(body.target_username, body.source, app_user_id=current_user["id"])


@app.post("/api/follow/stop")
def follow_stop(current_user: dict = Depends(require_pro)):
    return follower.stop_auto_follow(app_user_id=current_user["id"])


@app.get("/api/follow/status")
def follow_status(current_user: dict = Depends(require_pro)):
    return follower.get_follow_status(user_id=current_user["id"])


# ── Unfollow (Pro only) ───────────────────────────────────────────────────────
class UnfollowBody(BaseModel):
    mode: str = "non_followers"


@app.post("/api/unfollow/start")
def unfollow_start(body: UnfollowBody, current_user: dict = Depends(require_pro)):
    return unfollower.start_auto_unfollow(body.mode, app_user_id=current_user["id"])


@app.post("/api/unfollow/stop")
def unfollow_stop(current_user: dict = Depends(require_pro)):
    return unfollower.stop_auto_unfollow(app_user_id=current_user["id"])


@app.get("/api/unfollow/status")
def unfollow_status(current_user: dict = Depends(require_pro)):
    return unfollower.get_unfollow_status(user_id=current_user["id"])


# ── Analytics (all plans — Free has limited access) ───────────────────────────
@app.post("/api/analytics/capture")
def capture(current_user: dict = Depends(get_current_user)):
    return analytics.capture_snapshot(app_user_id=current_user["id"])


@app.get("/api/analytics/summary")
def summary(current_user: dict = Depends(get_current_user)):
    return analytics.get_profile_summary(app_user_id=current_user["id"])


@app.get("/api/analytics/history")
def history(current_user: dict = Depends(get_current_user)):
    return analytics.get_snapshots(app_user_id=current_user["id"])


@app.get("/api/analytics/follow-stats")
def follow_stats(current_user: dict = Depends(get_current_user)):
    return analytics.get_follow_stats(app_user_id=current_user["id"])


# ── Content (free with limits, pro unlimited) ─────────────────────────────────
class ContentBody(BaseModel):
    topic: str
    niche: str = ""
    count: int = 8


@app.post("/api/content/generate")
def generate(body: ContentBody, current_user: dict = Depends(get_current_user)):
    return content.generate_ideas(body.topic, body.niche, body.count)


class SaveIdeaBody(BaseModel):
    title: str
    description: str
    hashtags: str
    content_type: str


@app.post("/api/content/save")
def save_idea(body: SaveIdeaBody, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    if current_user["plan"] != "pro":
        used = _count_content_saves_this_month(uid)
        if used >= FREE_CONTENT_SAVES_PER_MONTH:
            raise HTTPException(
                status_code=403,
                detail=f"Limite de {FREE_CONTENT_SAVES_PER_MONTH} ideias salvas por mês atingido. Faça upgrade para o plano Pro."
            )
    return content.save_idea(body.title, body.description, body.hashtags, body.content_type, app_user_id=uid)


@app.get("/api/content/ideas")
def get_ideas(current_user: dict = Depends(get_current_user)):
    return content.get_saved_ideas(app_user_id=current_user["id"])


@app.patch("/api/content/ideas/{idea_id}")
def update_idea(idea_id: int, status: str, current_user: dict = Depends(get_current_user)):
    return content.update_idea_status(idea_id, status, app_user_id=current_user["id"])


# ── Teleprompter (free with limits, pro unlimited) ────────────────────────────
class ScriptBody(BaseModel):
    title: str
    content: str
    speed: int = 3
    font_size: int = 36


@app.post("/api/teleprompter/scripts")
def create_script(body: ScriptBody, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    if current_user["plan"] != "pro":
        count = _count_teleprompter_scripts(uid)
        if count >= FREE_TELEPROMPTER_SCRIPTS:
            raise HTTPException(
                status_code=403,
                detail=f"Limite de {FREE_TELEPROMPTER_SCRIPTS} roteiros atingido. Faça upgrade para o plano Pro."
            )
    return teleprompter.save_script(body.title, body.content, body.speed, body.font_size, app_user_id=uid)


@app.get("/api/teleprompter/scripts")
def list_scripts(current_user: dict = Depends(get_current_user)):
    return teleprompter.get_scripts(app_user_id=current_user["id"])


@app.get("/api/teleprompter/scripts/{script_id}")
def get_script(script_id: int, current_user: dict = Depends(get_current_user)):
    s = teleprompter.get_script(script_id, app_user_id=current_user["id"])
    if not s:
        raise HTTPException(status_code=404, detail="Roteiro não encontrado")
    return s


@app.put("/api/teleprompter/scripts/{script_id}")
def update_script(script_id: int, body: ScriptBody, current_user: dict = Depends(get_current_user)):
    return teleprompter.update_script(script_id, body.title, body.content, body.speed, body.font_size, app_user_id=current_user["id"])


@app.delete("/api/teleprompter/scripts/{script_id}")
def delete_script(script_id: int, current_user: dict = Depends(get_current_user)):
    return teleprompter.delete_script(script_id, app_user_id=current_user["id"])


# ── Settings (Pro only) ───────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(current_user: dict = Depends(require_pro)):
    uid = current_user["id"]
    keys = [
        "follow_delay_min", "follow_delay_max", "follow_delay_unit", "follow_amount",
        "daily_follow_limit", "daily_unfollow_limit", "unfollow_after_days",
        "unfollow_non_followers", "unfollow_followers",
        "active_hours_start", "active_hours_end", "active_days",
    ]
    return {k: get_setting(k, uid) for k in keys}


class SettingBody(BaseModel):
    key: str
    value: str


@app.post("/api/settings")
def save_setting(body: SettingBody, current_user: dict = Depends(require_pro)):
    set_setting(body.key, body.value, user_id=current_user["id"])
    return {"success": True}


# ── Delivery management ────────────────────────────────────────────────────────

def _get_delivery_owner(authorization: Optional[str] = Header(None)) -> bool:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de acesso necessário.")
    token = authorization[7:]
    if not entregas.verify_owner_token(token):
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.")
    return True


class OwnerSetupBody(BaseModel):
    password: str


class OwnerLoginBody(BaseModel):
    password: str


class ChangePwBody(BaseModel):
    old_password: str
    new_password: str


class MotoboyBody(BaseModel):
    name: str
    phone: str = ""


class DeliveryBody(BaseModel):
    client_name: str
    address: str
    product: str
    delivery_fee: float
    motoboy_id: Optional[int] = None
    client_phone: str = ""
    payment_method: str = "dinheiro"
    notes: str = ""
    date: Optional[str] = None


class DeliveryUpdateBody(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    address: Optional[str] = None
    product: Optional[str] = None
    payment_method: Optional[str] = None
    delivery_fee: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    motoboy_id: Optional[int] = None


class ParseWhatsAppBody(BaseModel):
    text: str


class MotoboyStatusBody(BaseModel):
    status: str


# owner setup / login
@app.get("/api/entregas/setup-status")
def delivery_setup_status():
    return {"configured": entregas.is_owner_setup()}


@app.post("/api/entregas/setup")
def delivery_setup(body: OwnerSetupBody):
    return entregas.setup_owner(body.password)


@app.post("/api/entregas/login")
def delivery_login(body: OwnerLoginBody):
    token = entregas.owner_login(body.password)
    if not token:
        raise HTTPException(status_code=401, detail="Senha incorreta.")
    return {"token": token}


@app.post("/api/entregas/change-password")
def delivery_change_pw(body: ChangePwBody, _: bool = Depends(_get_delivery_owner)):
    return entregas.change_owner_password(body.old_password, body.new_password)


# motoboys
@app.get("/api/entregas/motoboys")
def list_motoboys(_: bool = Depends(_get_delivery_owner)):
    return entregas.get_motoboys()


@app.post("/api/entregas/motoboys")
def add_motoboy(body: MotoboyBody, _: bool = Depends(_get_delivery_owner)):
    return entregas.create_motoboy(body.name, body.phone)


@app.delete("/api/entregas/motoboys/{motoboy_id}")
def remove_motoboy(motoboy_id: int, _: bool = Depends(_get_delivery_owner)):
    return entregas.deactivate_motoboy(motoboy_id)


# deliveries (owner)
@app.get("/api/entregas/deliveries")
def list_deliveries(
    date: Optional[str] = None,
    motoboy_id: Optional[int] = None,
    status: Optional[str] = None,
    _: bool = Depends(_get_delivery_owner),
):
    return entregas.get_deliveries(filter_date=date, motoboy_id=motoboy_id, status=status)


@app.post("/api/entregas/deliveries")
def create_delivery(body: DeliveryBody, _: bool = Depends(_get_delivery_owner)):
    return entregas.create_delivery(
        client_name=body.client_name,
        address=body.address,
        product=body.product,
        delivery_fee=body.delivery_fee,
        motoboy_id=body.motoboy_id,
        client_phone=body.client_phone,
        payment_method=body.payment_method,
        notes=body.notes,
        target_date=body.date,
    )


@app.patch("/api/entregas/deliveries/{delivery_id}")
def update_delivery(
    delivery_id: int,
    body: DeliveryUpdateBody,
    _: bool = Depends(_get_delivery_owner),
):
    result = entregas.update_delivery(delivery_id, **body.dict(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Entrega não encontrada.")
    return result


@app.delete("/api/entregas/deliveries/{delivery_id}")
def delete_delivery(delivery_id: int, _: bool = Depends(_get_delivery_owner)):
    return entregas.delete_delivery(delivery_id)


@app.get("/api/entregas/summary")
def delivery_summary(date: Optional[str] = None, _: bool = Depends(_get_delivery_owner)):
    return entregas.get_summary(filter_date=date)


@app.post("/api/entregas/parse-whatsapp")
def parse_whatsapp(body: ParseWhatsAppBody, _: bool = Depends(_get_delivery_owner)):
    return entregas.parse_whatsapp(body.text)


# motoboy public endpoints (auth via access code only)
@app.get("/api/entregas/motoboy/{code}")
def motoboy_view(code: str, date: Optional[str] = None):
    data = entregas.get_motoboy_deliveries(code, filter_date=date)
    if not data:
        raise HTTPException(status_code=404, detail="Código de acesso inválido.")
    return data


@app.patch("/api/entregas/motoboy/{code}/{delivery_id}")
def motoboy_update(code: str, delivery_id: int, body: MotoboyStatusBody):
    result = entregas.motoboy_update_status(code, delivery_id, body.status)
    if result is None:
        raise HTTPException(status_code=404, detail="Entrega não encontrada ou acesso negado.")
    return result
