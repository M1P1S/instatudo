"""
customer_list.py — Busca potenciais clientes de papelaria personalizada via Apify.

Usa o Instagram Scraper do Apify para vasculhar hashtags relacionadas a
papelaria, presentes personalizados e decoração, extraindo perfis de usuários
que podem se tornar clientes.
"""

import os
import asyncio
import httpx
from datetime import datetime
from ..db.database import get_connection

APIFY_BASE = "https://api.apify.com/v2"

# Hashtags padrão para prospecção de clientes de papelaria personalizada
DEFAULT_HASHTAGS = [
    "papelariacriativa",
    "papelariaonline",
    "papelariacustomizada",
    "papelariapersonalizada",
    "convitepersonalizado",
    "kitescolar",
    "decoracaoescolar",
    "presenteromantico",
    "lembrancapersonalizada",
    "cadernoescolarpersonalizado",
]


def _get_apify_token() -> str:
    token = os.getenv("APIFY_TOKEN", "")
    if not token:
        raise ValueError("APIFY_TOKEN não configurado. Adicione ao arquivo .env.")
    return token


async def search_customers(hashtags: list = None, limit: int = 50) -> dict:
    """
    Dispara o Apify Instagram Scraper para as hashtags indicadas,
    aguarda a conclusão e retorna lista de perfis prospectados.
    """
    token = _get_apify_token()
    tags = hashtags or DEFAULT_HASHTAGS[:5]

    direct_urls = [
        f"https://www.instagram.com/explore/tags/{tag.lstrip('#')}/"
        for tag in tags
    ]

    actor_input = {
        "directUrls": direct_urls,
        "resultsType": "posts",
        "resultsLimit": max(limit * 2, 100),  # pega mais posts para ter perfis únicos
        "addParentData": False,
    }

    async with httpx.AsyncClient() as client:
        # 1. Iniciar o run
        resp = await client.post(
            f"{APIFY_BASE}/acts/apify~instagram-scraper/runs",
            params={"token": token},
            json=actor_input,
            timeout=30,
        )
        resp.raise_for_status()
        run_data = resp.json().get("data", {})
        run_id = run_data.get("id")
        if not run_id:
            raise RuntimeError("Falha ao iniciar o run do Apify.")

        # 2. Aguardar conclusão (máx. 5 min)
        status = "RUNNING"
        for _ in range(60):
            await asyncio.sleep(5)
            status_resp = await client.get(
                f"{APIFY_BASE}/actor-runs/{run_id}",
                params={"token": token},
                timeout=15,
            )
            status_resp.raise_for_status()
            run_info = status_resp.json().get("data", {})
            status = run_info.get("status", "RUNNING")
            if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                break

        if status != "SUCCEEDED":
            raise RuntimeError(f"Run do Apify encerrou com status: {status}")

        # 3. Buscar itens do dataset
        items_resp = await client.get(
            f"{APIFY_BASE}/actor-runs/{run_id}/dataset/items",
            params={"token": token, "limit": limit * 3},
            timeout=30,
        )
        items_resp.raise_for_status()
        posts = items_resp.json()

    # 4. Extrair perfis únicos
    seen: set = set()
    customers = []
    for post in posts:
        username = (
            post.get("ownerUsername")
            or post.get("username")
            or ""
        ).strip().lower()
        if not username or username in seen:
            continue
        seen.add(username)

        url = post.get("url", "")
        source_tag = ""
        for tag in tags:
            if tag.lower() in url.lower():
                source_tag = f"#{tag}"
                break

        customers.append({
            "username": username,
            "full_name": post.get("ownerFullName", "") or "",
            "bio": post.get("biography", "") or "",
            "followers": int(post.get("followersCount") or 0),
            "following": int(post.get("followingCount") or 0),
            "posts": int(post.get("postsCount") or 0),
            "profile_url": f"https://www.instagram.com/{username}/",
            "profile_pic": post.get("profilePicUrl", "") or "",
            "hashtag_source": source_tag or ", ".join(f"#{t}" for t in tags[:3]),
        })

        if len(customers) >= limit:
            break

    return {
        "run_id": run_id,
        "hashtags_searched": tags,
        "total_found": len(customers),
        "customers": customers,
    }


def save_customers(customers: list, app_user_id: int) -> int:
    """Salva clientes prospectados no banco. Ignora duplicatas. Retorna qtd inserida."""
    conn = get_connection()
    inserted = 0
    now = datetime.utcnow().isoformat()
    for c in customers:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO customer_list
                   (app_user_id, username, full_name, bio, followers, following,
                    posts, profile_url, profile_pic, hashtag_source, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    app_user_id,
                    c["username"],
                    c.get("full_name", ""),
                    c.get("bio", ""),
                    c.get("followers", 0),
                    c.get("following", 0),
                    c.get("posts", 0),
                    c.get("profile_url", ""),
                    c.get("profile_pic", ""),
                    c.get("hashtag_source", ""),
                    now,
                ),
            )
            if conn.execute("SELECT changes()").fetchone()[0]:
                inserted += 1
        except Exception:
            pass
    conn.commit()
    conn.close()
    return inserted


def get_customers(app_user_id: int, status: str = None) -> list:
    conn = get_connection()
    if status:
        rows = conn.execute(
            "SELECT * FROM customer_list WHERE app_user_id=? AND status=? ORDER BY followers DESC",
            (app_user_id, status),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM customer_list WHERE app_user_id=? ORDER BY followers DESC",
            (app_user_id,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_customer_status(customer_id: int, status: str, notes: str, app_user_id: int) -> bool:
    conn = get_connection()
    conn.execute(
        "UPDATE customer_list SET status=?, notes=? WHERE id=? AND app_user_id=?",
        (status, notes, customer_id, app_user_id),
    )
    conn.commit()
    changed = conn.execute("SELECT changes()").fetchone()[0]
    conn.close()
    return changed > 0


def delete_customer(customer_id: int, app_user_id: int) -> bool:
    conn = get_connection()
    conn.execute(
        "DELETE FROM customer_list WHERE id=? AND app_user_id=?",
        (customer_id, app_user_id),
    )
    conn.commit()
    changed = conn.execute("SELECT changes()").fetchone()[0]
    conn.close()
    return changed > 0


def export_customers_csv(app_user_id: int) -> str:
    """Retorna string CSV com todos os clientes do usuário."""
    customers = get_customers(app_user_id)
    lines = ["username,full_name,followers,following,posts,status,hashtag_source,profile_url,notes,created_at"]
    for c in customers:
        def esc(v):
            return f'"{str(v).replace(chr(34), chr(39))}"'
        lines.append(",".join([
            esc(c["username"]),
            esc(c["full_name"]),
            str(c["followers"]),
            str(c["following"]),
            str(c["posts"]),
            esc(c["status"]),
            esc(c["hashtag_source"]),
            esc(c["profile_url"]),
            esc(c.get("notes", "")),
            esc(c["created_at"]),
        ]))
    return "\n".join(lines)
