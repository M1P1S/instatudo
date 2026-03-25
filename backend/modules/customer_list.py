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


def _slugify(text: str) -> str:
    """Remove acentos e caracteres especiais para usar em hashtags."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", text)
    slug = "".join(c for c in nfkd if not unicodedata.combining(c))
    return "".join(c for c in slug if c.isalnum()).lower()


async def search_customers(hashtags: list = None, limit: int = 50, region: str = None) -> dict:
    """
    Dispara o Apify Instagram Scraper para as hashtags indicadas,
    aguarda a conclusão e retorna lista de perfis prospectados.
    Se 'region' for informado, adiciona hashtags regionais e filtra ESTRITAMENTE por região.
    """
    token = _get_apify_token()
    tags = list(hashtags) if hashtags else DEFAULT_HASHTAGS[:5]

    # Prepara termos regionais para filtragem
    region_slug = _slugify(region) if region else ""
    region_terms = []
    if region:
        # Quebra "GO, Planaltina" em ["go", "planaltina", "goplanaltina"]
        parts = [t.strip() for t in region.replace(",", " ").split() if len(t.strip()) >= 2]
        region_terms = [_slugify(p) for p in parts if _slugify(p)]
        if region_slug:
            region_terms.append(region_slug)
        region_terms = list(set(region_terms))

    # Adiciona hashtags regionais (ex: convitepersonalizadoplanaltina)
    if region_slug:
        regional_tags = [f"{tag}{region_slug}" for tag in tags[:5]]
        # Adiciona a própria cidade/estado como hashtag
        for part in region_terms:
            if len(part) >= 3:
                regional_tags.append(part)
        tags = regional_tags + tags  # regionais primeiro

    direct_urls = [
        f"https://www.instagram.com/explore/tags/{tag.lstrip('#')}/"
        for tag in tags
    ]

    # Quando há filtro regional, busca mais posts pois muitos serão descartados
    fetch_multiplier = 6 if region_terms else 2
    actor_input = {
        "directUrls": direct_urls,
        "resultsType": "posts",
        "resultsLimit": max(limit * fetch_multiplier, 200),
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
            params={"token": token, "limit": limit * fetch_multiplier},
            timeout=30,
        )
        items_resp.raise_for_status()
        posts = items_resp.json()

    def _matches_region(post: dict) -> bool:
        """Checa se o perfil menciona a região na bio, localização ou nome."""
        if not region_terms:
            return True
        bio = _slugify(post.get("biography") or "")
        location = _slugify(post.get("locationName") or post.get("location") or "")
        full_name = _slugify(post.get("ownerFullName") or "")
        username = _slugify(post.get("ownerUsername") or post.get("username") or "")
        caption = _slugify(post.get("caption") or "")
        text = f"{bio} {location} {full_name} {username} {caption}"
        return any(term in text for term in region_terms)

    # 4. Extrair perfis únicos — filtragem ESTRITA por região quando informada
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
        if not _matches_region(post):
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
    """Retorna string CSV com todos os clientes (separador ; para Excel PT-BR, BOM UTF-8)."""
    customers = get_customers(app_user_id)
    sep = ";"

    def esc(v):
        return f'"{str(v).replace(chr(34), chr(39))}"'

    lines = [sep.join([
        "username", "full_name", "followers", "following", "posts",
        "status", "hashtag_source", "profile_url", "notes", "created_at"
    ])]
    for c in customers:
        lines.append(sep.join([
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
    # BOM UTF-8 para o Excel reconhecer acentos automaticamente
    return "\ufeff" + "\n".join(lines)
