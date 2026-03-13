"""
Asaas payment gateway integration.
Docs: https://docs.asaas.com/
"""
import os
import httpx
from typing import Optional

ASAAS_API_KEY = os.getenv("ASAAS_API_KEY", "")
_ENV = os.getenv("ASAAS_ENVIRONMENT", "sandbox")
ASAAS_BASE_URL = (
    "https://sandbox.asaas.com/api/v3"
    if _ENV == "sandbox"
    else "https://api.asaas.com/v3"
)

PRO_PRICE = 49.90
PRO_NAME = "InstaTudo Pro"


def _headers() -> dict:
    return {"access_token": ASAAS_API_KEY, "Content-Type": "application/json"}


def _configured() -> bool:
    return bool(ASAAS_API_KEY)


def create_customer(name: str, email: str, cpf_cnpj: str = "00000000000") -> Optional[str]:
    """Create customer in Asaas. Returns customer ID or None."""
    if not _configured():
        return None
    try:
        resp = httpx.post(
            f"{ASAAS_BASE_URL}/customers",
            headers=_headers(),
            json={"name": name or email, "email": email, "cpfCnpj": cpf_cnpj},
            timeout=10,
        )
        data = resp.json()
        customer_id = data.get("id")
        if customer_id:
            # Persist customer_id in DB
            from ..db.database import get_connection
            conn = get_connection()
            conn.execute(
                "UPDATE users SET asaas_customer_id = ? WHERE email = ?",
                (customer_id, email.lower())
            )
            conn.commit()
            conn.close()
        return customer_id
    except Exception:
        return None


def get_or_create_customer(user_id: int) -> Optional[str]:
    """Return existing Asaas customer_id or create a new one."""
    from ..db.database import get_connection
    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not user:
        return None
    if user["asaas_customer_id"]:
        return user["asaas_customer_id"]
    return create_customer(user["name"] or user["email"], user["email"])


def create_payment_link(user_id: int) -> Optional[str]:
    """
    Create a monthly subscription payment link for the user.
    Returns the URL the user should visit to pay.
    """
    if not _configured():
        return None

    customer_id = get_or_create_customer(user_id)
    if not customer_id:
        return None

    try:
        resp = httpx.post(
            f"{ASAAS_BASE_URL}/paymentLinks",
            headers=_headers(),
            json={
                "name": f"{PRO_NAME} — Usuário #{user_id}",
                "billingType": "UNDEFINED",       # pix, cartão ou boleto
                "chargeType": "RECURRENT",
                "value": PRO_PRICE,
                "subscriptionCycle": "MONTHLY",
                "description": "Assinatura mensal InstaTudo Pro — acesso completo a todas as funcionalidades.",
                "externalReference": f"user_{user_id}",
            },
            timeout=10,
        )
        data = resp.json()
        # Asaas pode retornar 'url' ou 'paymentLink'
        return data.get("url") or data.get("paymentLink") or data.get("shortUrl")
    except Exception:
        return None


def create_subscription(user_id: int) -> Optional[str]:
    """
    Alternative: create a subscription directly (no link) - charge PIX/boleto.
    Returns subscription ID or None.
    """
    if not _configured():
        return None

    customer_id = get_or_create_customer(user_id)
    if not customer_id:
        return None

    from datetime import date
    try:
        resp = httpx.post(
            f"{ASAAS_BASE_URL}/subscriptions",
            headers=_headers(),
            json={
                "customer": customer_id,
                "billingType": "PIX",
                "value": PRO_PRICE,
                "nextDueDate": date.today().isoformat(),
                "cycle": "MONTHLY",
                "description": "InstaTudo Pro",
                "externalReference": f"user_{user_id}",
            },
            timeout=10,
        )
        data = resp.json()
        return data.get("id")
    except Exception:
        return None


def get_active_subscription(customer_id: str) -> bool:
    """Check if customer has an active subscription."""
    if not _configured() or not customer_id:
        return False
    try:
        resp = httpx.get(
            f"{ASAAS_BASE_URL}/subscriptions",
            headers=_headers(),
            params={"customer": customer_id, "status": "ACTIVE"},
            timeout=10,
        )
        data = resp.json()
        return data.get("totalCount", 0) > 0
    except Exception:
        return False


def process_webhook(payload: dict) -> dict:
    """
    Process an Asaas webhook event.
    Returns {"user_id": int, "plan": "pro"|"free"} or {"user_id": None}.

    Relevant events:
      PAYMENT_RECEIVED / PAYMENT_CONFIRMED → activate Pro
      PAYMENT_OVERDUE                       → keep Pro (grace period)
      SUBSCRIPTION_INACTIVATED / PAYMENT_DELETED → downgrade to free
    """
    event = payload.get("event", "")
    payment = payload.get("payment", {}) or payload.get("subscription", {})
    ext_ref = payment.get("externalReference", "")

    user_id = None
    if ext_ref and ext_ref.startswith("user_"):
        try:
            user_id = int(ext_ref.replace("user_", ""))
        except ValueError:
            pass

    if not user_id:
        return {"user_id": None, "plan": None}

    activate_events = {"PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"}
    deactivate_events = {"SUBSCRIPTION_INACTIVATED", "PAYMENT_DELETED"}

    if event in activate_events:
        return {"user_id": user_id, "plan": "pro"}
    if event in deactivate_events:
        return {"user_id": user_id, "plan": "free"}

    return {"user_id": user_id, "plan": None}  # no action needed
