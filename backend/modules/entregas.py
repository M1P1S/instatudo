import re
import os
import json
import base64
import hashlib
import hmac as hmac_lib
import secrets
import string
from datetime import datetime, date
from typing import Optional

from ..db.database import get_connection, get_setting, set_setting

_SECRET = os.getenv("DELIVERY_SECRET", "entregas-secret-key-mude-me")

# ── Owner auth ─────────────────────────────────────────────────────────────────

def _hash_pw(password: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), b"entregas", 100_000).hex()


def is_owner_setup() -> bool:
    return bool(get_setting("delivery_owner_password"))


def setup_owner(password: str) -> dict:
    if is_owner_setup():
        return {"success": False, "message": "Senha já configurada."}
    if len(password) < 4:
        return {"success": False, "message": "Senha deve ter ao menos 4 caracteres."}
    set_setting("delivery_owner_password", _hash_pw(password))
    return {"success": True}


def owner_login(password: str) -> Optional[str]:
    stored = get_setting("delivery_owner_password")
    if not stored:
        return None
    if hmac_lib.compare_digest(stored, _hash_pw(password)):
        return _make_token()
    return None


def change_owner_password(old_pw: str, new_pw: str) -> dict:
    stored = get_setting("delivery_owner_password")
    if not stored or not hmac_lib.compare_digest(stored, _hash_pw(old_pw)):
        return {"success": False, "message": "Senha atual incorreta."}
    if len(new_pw) < 4:
        return {"success": False, "message": "Nova senha deve ter ao menos 4 caracteres."}
    set_setting("delivery_owner_password", _hash_pw(new_pw))
    return {"success": True}


def _make_token() -> str:
    payload = json.dumps({"role": "owner", "day": date.today().isoformat()})
    p64 = base64.b64encode(payload.encode()).decode()
    sig = hmac_lib.new(_SECRET.encode(), p64.encode(), "sha256").hexdigest()
    return f"{p64}.{sig}"


def verify_owner_token(token: str) -> bool:
    try:
        p64, sig = token.split(".", 1)
        expected = hmac_lib.new(_SECRET.encode(), p64.encode(), "sha256").hexdigest()
        if not hmac_lib.compare_digest(sig, expected):
            return False
        payload = json.loads(base64.b64decode(p64).decode())
        token_day = datetime.strptime(payload["day"], "%Y-%m-%d").date()
        return (date.today() - token_day).days < 7
    except Exception:
        return False


# ── Motoboys ───────────────────────────────────────────────────────────────────

def _gen_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))


def create_motoboy(name: str, phone: str = "") -> dict:
    conn = get_connection()
    code = _gen_code()
    while conn.execute("SELECT id FROM motoboys WHERE access_code=?", (code,)).fetchone():
        code = _gen_code()
    conn.execute(
        "INSERT INTO motoboys (name, phone, access_code, created_at) VALUES (?,?,?,?)",
        (name.strip(), phone.strip(), code, datetime.utcnow().isoformat()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM motoboys WHERE access_code=?", (code,)).fetchone()
    result = dict(row)
    conn.close()
    return result


def get_motoboys(active_only: bool = True) -> list:
    conn = get_connection()
    q = "SELECT * FROM motoboys"
    params = ()
    if active_only:
        q += " WHERE active=1"
    q += " ORDER BY name"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def deactivate_motoboy(motoboy_id: int) -> dict:
    conn = get_connection()
    conn.execute("UPDATE motoboys SET active=0 WHERE id=?", (motoboy_id,))
    conn.commit()
    conn.close()
    return {"success": True}


def get_motoboy_by_code(code: str) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM motoboys WHERE access_code=? AND active=1", (code.upper(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ── Deliveries ─────────────────────────────────────────────────────────────────

def create_delivery(
    client_name: str,
    address: str,
    product: str,
    delivery_fee: float,
    motoboy_id: Optional[int] = None,
    client_phone: str = "",
    payment_method: str = "dinheiro",
    notes: str = "",
    target_date: Optional[str] = None,
) -> dict:
    today = target_date or date.today().isoformat()
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO deliveries
           (motoboy_id, client_name, client_phone, address, product,
            payment_method, delivery_fee, notes, created_at, date)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            motoboy_id, client_name.strip(), client_phone.strip(),
            address.strip(), product.strip(), payment_method.strip(),
            delivery_fee, notes.strip(), datetime.utcnow().isoformat(), today,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM deliveries WHERE id=?", (cur.lastrowid,)).fetchone()
    result = _enrich_delivery(dict(row), conn)
    conn.close()
    return result


def get_deliveries(
    filter_date: Optional[str] = None,
    motoboy_id: Optional[int] = None,
    status: Optional[str] = None,
) -> list:
    today = filter_date or date.today().isoformat()
    conn = get_connection()
    conditions = ["d.date=?"]
    params: list = [today]
    if motoboy_id:
        conditions.append("d.motoboy_id=?")
        params.append(motoboy_id)
    if status:
        conditions.append("d.status=?")
        params.append(status)
    q = f"""
        SELECT d.*, m.name as motoboy_name, m.access_code as motoboy_code
        FROM deliveries d
        LEFT JOIN motoboys m ON d.motoboy_id = m.id
        WHERE {' AND '.join(conditions)}
        ORDER BY d.created_at DESC
    """
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_delivery(delivery_id: int) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute(
        """SELECT d.*, m.name as motoboy_name, m.access_code as motoboy_code
           FROM deliveries d LEFT JOIN motoboys m ON d.motoboy_id=m.id
           WHERE d.id=?""",
        (delivery_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def _enrich_delivery(d: dict, conn) -> dict:
    if d.get("motoboy_id"):
        row = conn.execute(
            "SELECT name, access_code FROM motoboys WHERE id=?", (d["motoboy_id"],)
        ).fetchone()
        if row:
            d["motoboy_name"] = row["name"]
            d["motoboy_code"] = row["access_code"]
    return d


def update_delivery(delivery_id: int, **kwargs) -> Optional[dict]:
    allowed = {
        "client_name", "client_phone", "address", "product",
        "payment_method", "delivery_fee", "status", "notes", "motoboy_id",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        return get_delivery(delivery_id)

    if "status" in fields and fields["status"] == "entregue":
        fields["delivered_at"] = datetime.utcnow().isoformat()

    set_clause = ", ".join(f"{k}=?" for k in fields)
    params = list(fields.values()) + [delivery_id]
    conn = get_connection()
    conn.execute(f"UPDATE deliveries SET {set_clause} WHERE id=?", params)
    conn.commit()
    conn.close()
    return get_delivery(delivery_id)


def delete_delivery(delivery_id: int) -> dict:
    conn = get_connection()
    conn.execute("DELETE FROM deliveries WHERE id=?", (delivery_id,))
    conn.commit()
    conn.close()
    return {"success": True}


def get_summary(filter_date: Optional[str] = None) -> dict:
    today = filter_date or date.today().isoformat()
    conn = get_connection()

    rows = conn.execute(
        """SELECT d.*, m.name as motoboy_name
           FROM deliveries d LEFT JOIN motoboys m ON d.motoboy_id=m.id
           WHERE d.date=?""",
        (today,),
    ).fetchall()
    conn.close()

    deliveries = [dict(r) for r in rows]
    total = len(deliveries)
    delivered = sum(1 for d in deliveries if d["status"] == "entregue")
    pending = sum(1 for d in deliveries if d["status"] == "pendente")
    in_transit = sum(1 for d in deliveries if d["status"] == "em_entrega")
    cancelled = sum(1 for d in deliveries if d["status"] == "cancelado")
    total_fees = sum(d["delivery_fee"] for d in deliveries if d["status"] != "cancelado")

    by_payment: dict = {}
    for d in deliveries:
        if d["status"] == "cancelado":
            continue
        pm = d["payment_method"] or "dinheiro"
        by_payment[pm] = by_payment.get(pm, 0) + 1

    by_motoboy: dict = {}
    for d in deliveries:
        if d["status"] == "cancelado":
            continue
        name = d["motoboy_name"] or "Sem motoboy"
        if name not in by_motoboy:
            by_motoboy[name] = {"deliveries": 0, "total_fee": 0.0}
        by_motoboy[name]["deliveries"] += 1
        by_motoboy[name]["total_fee"] += d["delivery_fee"]

    return {
        "date": today,
        "total": total,
        "delivered": delivered,
        "pending": pending,
        "in_transit": in_transit,
        "cancelled": cancelled,
        "total_fees": round(total_fees, 2),
        "by_payment": by_payment,
        "by_motoboy": by_motoboy,
    }


# ── Motoboy delivery view ──────────────────────────────────────────────────────

def get_motoboy_deliveries(code: str, filter_date: Optional[str] = None) -> Optional[dict]:
    motoboy = get_motoboy_by_code(code)
    if not motoboy:
        return None
    today = filter_date or date.today().isoformat()
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM deliveries WHERE motoboy_id=? AND date=? ORDER BY created_at DESC",
        (motoboy["id"], today),
    ).fetchall()
    conn.close()
    deliveries = [dict(r) for r in rows]
    active = [d for d in deliveries if d["status"] != "cancelado"]
    total_fee = sum(d["delivery_fee"] for d in active)
    delivered_count = sum(1 for d in active if d["status"] == "entregue")
    return {
        "motoboy": motoboy,
        "date": today,
        "deliveries": deliveries,
        "total_fee": round(total_fee, 2),
        "delivered_count": delivered_count,
        "total_count": len(active),
    }


def motoboy_update_status(code: str, delivery_id: int, status: str) -> Optional[dict]:
    motoboy = get_motoboy_by_code(code)
    if not motoboy:
        return None
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM deliveries WHERE id=? AND motoboy_id=?",
        (delivery_id, motoboy["id"]),
    ).fetchone()
    conn.close()
    if not row:
        return None
    valid_statuses = {"em_entrega", "entregue", "pendente"}
    if status not in valid_statuses:
        return None
    return update_delivery(delivery_id, status=status)


# ── WhatsApp parser ────────────────────────────────────────────────────────────

def parse_whatsapp(text: str) -> dict:
    result = {
        "client_name": "",
        "client_phone": "",
        "address": "",
        "product": "",
        "payment_method": "",
        "delivery_fee": "",
        "notes": "",
    }

    # Strip WhatsApp chat timestamps: [14:32, 23/04/2026] Name:
    text = re.sub(r"\[\d{1,2}:\d{2}(?::\d{2})?,?\s*\d{1,2}/\d{1,2}/\d{2,4}\]\s*[^:]+:\s*", "\n", text)
    # Strip WhatsApp export format timestamps: 23/04/2026 14:32 - Name:
    text = re.sub(r"\d{1,2}/\d{1,2}/\d{2,4},?\s*\d{1,2}:\d{2}\s*-?\s*[^:]+:\s*", "\n", text)

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    def find_labeled(patterns: list[str]) -> str:
        for line in lines:
            for pat in patterns:
                m = re.search(pat, line, re.IGNORECASE)
                if m:
                    val = m.group(1).strip() if m.lastindex else line[m.end():].strip()
                    if val:
                        return val
        return ""

    # Phone (Brazilian format)
    for line in lines:
        m = re.search(r"(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}", line)
        if m:
            digits = re.sub(r"\D", "", m.group())
            if len(digits) >= 10:
                result["client_phone"] = digits
                break

    # Named fields
    result["client_name"] = find_labeled([
        r"(?:nome|cliente|comprador)\s*[:\-]\s*(.+)",
    ])
    result["address"] = find_labeled([
        r"(?:endere[çc]o|local|entregar?\s+(?:em|para))\s*[:\-]\s*(.+)",
        r"(?:^|\s)(rua|av\.?|avenida|alameda|trav\.?|travessa|estr\.?|estrada|rod\.?)\s+.+",
    ])
    result["product"] = find_labeled([
        r"(?:produto|pedido|item|compra|quero|pedi[iu])\s*[:\-]\s*(.+)",
    ])
    result["delivery_fee"] = find_labeled([
        r"(?:taxa|frete|motoboy|cobrar)\s*[:\-]?\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)",
    ])

    # Payment method
    pm_raw = find_labeled([
        r"(?:pagamento|pagar|forma\s+de\s+pag\.?)\s*[:\-]\s*(.+)",
    ])
    pm_lower = (pm_raw or text).lower()
    if "pix" in pm_lower:
        result["payment_method"] = "PIX"
    elif any(w in pm_lower for w in ["dinheiro", "espécie", "especie", "cash"]):
        result["payment_method"] = "dinheiro"
    elif any(w in pm_lower for w in ["cartão", "cartao", "crédito", "credito", "débito", "debito", "card"]):
        result["payment_method"] = "cartão"
    elif pm_raw:
        result["payment_method"] = pm_raw

    # Fallback: if no name, try first line that looks like a full name
    if not result["client_name"] and lines:
        for line in lines[:3]:
            if re.match(r"^[A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})+$", line):
                result["client_name"] = line
                break

    # Delivery fee: normalize decimal
    if result["delivery_fee"]:
        result["delivery_fee"] = result["delivery_fee"].replace(",", ".")

    return result
