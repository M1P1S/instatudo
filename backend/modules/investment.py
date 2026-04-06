"""
Investment Portfolio Module
Supports: Ações (B3), FIIs, Crypto, Renda Fixa, ETF, BDR
Market data: brapi.dev (B3) + CoinGecko (crypto)
"""
import httpx
from datetime import datetime
from ..db.database import get_connection

# ── Crypto ticker → CoinGecko ID mapping ──────────────────────────────────────
CRYPTO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "BNB": "binancecoin",
    "ADA": "cardano",
    "XRP": "ripple",
    "DOGE": "dogecoin",
    "DOT": "polkadot",
    "AVAX": "avalanche-2",
    "MATIC": "matic-network",
    "LINK": "chainlink",
    "UNI": "uniswap",
    "ATOM": "cosmos",
    "LTC": "litecoin",
    "ALGO": "algorand",
    "NEAR": "near",
    "FTM": "fantom",
    "USDT": "tether",
    "USDC": "usd-coin",
    "SHIB": "shiba-inu",
    "TRX": "tron",
    "ETC": "ethereum-classic",
    "SAND": "the-sandbox",
    "MANA": "decentraland",
    "CRO": "crypto-com-chain",
}

TYPE_LABELS = {
    "acao": "Ações",
    "fii": "FIIs",
    "crypto": "Cripto",
    "renda_fixa": "Renda Fixa",
    "etf": "ETF",
    "bdr": "BDR",
}


# ── Market data ────────────────────────────────────────────────────────────────

def _fetch_b3_quote(ticker: str) -> dict | None:
    """Fetch B3 stock/FII/ETF/BDR price from brapi.dev."""
    try:
        r = httpx.get(
            f"https://brapi.dev/api/quote/{ticker.upper()}",
            timeout=8,
        )
        data = r.json()
        results = data.get("results", [])
        if results and results[0].get("regularMarketPrice"):
            res = results[0]
            return {
                "ticker": ticker.upper(),
                "price": res["regularMarketPrice"],
                "name": res.get("shortName") or res.get("longName") or ticker,
                "change_pct": round(res.get("regularMarketChangePercent") or 0, 2),
                "prev_close": res.get("regularMarketPreviousClose"),
            }
    except Exception:
        pass
    return None


def _fetch_crypto_quote(ticker: str) -> dict | None:
    """Fetch crypto price from CoinGecko in BRL."""
    coin_id = CRYPTO_IDS.get(ticker.upper())
    if not coin_id:
        return None
    try:
        r = httpx.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={
                "ids": coin_id,
                "vs_currencies": "brl",
                "include_24hr_change": "true",
            },
            timeout=8,
        )
        data = r.json()
        if coin_id in data:
            cd = data[coin_id]
            return {
                "ticker": ticker.upper(),
                "price": cd.get("brl", 0),
                "name": ticker.upper(),
                "change_pct": round(cd.get("brl_24h_change") or 0, 2),
                "prev_close": None,
            }
    except Exception:
        pass
    return None


def get_quote(ticker: str, asset_type: str) -> dict | None:
    if asset_type == "crypto":
        return _fetch_crypto_quote(ticker)
    return _fetch_b3_quote(ticker)


def search_b3(query: str) -> list:
    """Search B3 tickers via brapi.dev."""
    try:
        r = httpx.get(
            "https://brapi.dev/api/available",
            params={"search": query.upper()},
            timeout=6,
        )
        data = r.json()
        stocks = data.get("stocks", [])
        return [{"ticker": s, "type": "b3"} for s in stocks[:10]]
    except Exception:
        pass
    return []


# ── Assets CRUD ────────────────────────────────────────────────────────────────

def add_asset(
    app_user_id: int,
    ticker: str,
    name: str,
    asset_type: str,
    sector: str = "",
    notes: str = "",
    manual_price: float = None,
) -> dict:
    conn = get_connection()
    conn.execute(
        """INSERT INTO investment_assets
           (app_user_id, ticker, name, asset_type, sector, notes, manual_price, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            app_user_id,
            ticker.upper(),
            name,
            asset_type,
            sector,
            notes,
            manual_price,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Ativo adicionado com sucesso"}


def get_assets(app_user_id: int) -> list:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM investment_assets WHERE app_user_id=? ORDER BY asset_type, ticker",
        (app_user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_asset_manual_price(asset_id: int, app_user_id: int, price: float) -> dict:
    conn = get_connection()
    conn.execute(
        "UPDATE investment_assets SET manual_price=? WHERE id=? AND app_user_id=?",
        (price, asset_id, app_user_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Preço atualizado"}


def delete_asset(asset_id: int, app_user_id: int) -> dict:
    conn = get_connection()
    conn.execute(
        "DELETE FROM investment_dividends WHERE asset_id=? AND app_user_id=?",
        (asset_id, app_user_id),
    )
    conn.execute(
        "DELETE FROM portfolio_transactions WHERE asset_id=? AND app_user_id=?",
        (asset_id, app_user_id),
    )
    conn.execute(
        "DELETE FROM investment_assets WHERE id=? AND app_user_id=?",
        (asset_id, app_user_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Ativo e histórico removidos"}


# ── Transactions CRUD ─────────────────────────────────────────────────────────

def add_transaction(
    app_user_id: int,
    asset_id: int,
    transaction_type: str,
    quantity: float,
    price: float,
    fees: float = 0.0,
    transaction_date: str = None,
    notes: str = "",
) -> dict:
    total_value = round(quantity * price + (fees if transaction_type == "buy" else -fees), 2)
    if not transaction_date:
        transaction_date = datetime.utcnow().date().isoformat()
    conn = get_connection()
    conn.execute(
        """INSERT INTO portfolio_transactions
           (app_user_id, asset_id, transaction_type, quantity, price,
            total_value, fees, transaction_date, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            app_user_id,
            asset_id,
            transaction_type,
            quantity,
            price,
            total_value,
            fees,
            transaction_date,
            notes,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Transação registrada"}


def get_transactions(app_user_id: int) -> list:
    conn = get_connection()
    rows = conn.execute(
        """SELECT pt.*, ia.ticker, ia.name, ia.asset_type
           FROM portfolio_transactions pt
           JOIN investment_assets ia ON pt.asset_id = ia.id
           WHERE pt.app_user_id=?
           ORDER BY pt.transaction_date DESC, pt.id DESC""",
        (app_user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_transaction(tx_id: int, app_user_id: int) -> dict:
    conn = get_connection()
    conn.execute(
        "DELETE FROM portfolio_transactions WHERE id=? AND app_user_id=?",
        (tx_id, app_user_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Transação removida"}


# ── Dividends CRUD ────────────────────────────────────────────────────────────

def add_dividend(
    app_user_id: int,
    asset_id: int,
    amount: float,
    dividend_date: str,
    notes: str = "",
) -> dict:
    conn = get_connection()
    conn.execute(
        """INSERT INTO investment_dividends
           (app_user_id, asset_id, amount, dividend_date, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            app_user_id,
            asset_id,
            amount,
            dividend_date,
            notes,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Dividendo/rendimento registrado"}


def get_dividends(app_user_id: int) -> list:
    conn = get_connection()
    rows = conn.execute(
        """SELECT d.*, ia.ticker, ia.name, ia.asset_type
           FROM investment_dividends d
           JOIN investment_assets ia ON d.asset_id = ia.id
           WHERE d.app_user_id=?
           ORDER BY d.dividend_date DESC, d.id DESC""",
        (app_user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_dividend(div_id: int, app_user_id: int) -> dict:
    conn = get_connection()
    conn.execute(
        "DELETE FROM investment_dividends WHERE id=? AND app_user_id=?",
        (div_id, app_user_id),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Registro removido"}


# ── Portfolio summary ─────────────────────────────────────────────────────────

def get_portfolio_summary(app_user_id: int) -> dict:
    """Build full portfolio with live prices and calculated metrics."""
    conn = get_connection()
    assets = conn.execute(
        "SELECT * FROM investment_assets WHERE app_user_id=?",
        (app_user_id,),
    ).fetchall()

    holdings = []
    total_invested = 0.0
    total_current = 0.0
    total_dividends = 0.0
    by_type: dict = {}

    for asset in assets:
        asset = dict(asset)

        txs = conn.execute(
            """SELECT transaction_type, quantity, price, total_value, fees
               FROM portfolio_transactions
               WHERE asset_id=? AND app_user_id=?""",
            (asset["id"], app_user_id),
        ).fetchall()

        buy_qty = 0.0
        buy_invested = 0.0
        sell_qty = 0.0

        for tx in txs:
            tx = dict(tx)
            if tx["transaction_type"] == "buy":
                buy_qty += tx["quantity"]
                buy_invested += tx["total_value"]
            else:
                sell_qty += tx["quantity"]

        net_qty = round(buy_qty - sell_qty, 8)
        if net_qty <= 0:
            continue  # position fully sold

        # Proportional cost basis
        net_invested = buy_invested * (net_qty / buy_qty) if buy_qty > 0 else 0.0
        avg_cost = net_invested / net_qty if net_qty > 0 else 0.0

        # Fetch current price
        change_pct = 0.0
        if asset["asset_type"] == "renda_fixa":
            # For fixed income use manual_price (current value per unit) or avg_cost
            current_price = asset.get("manual_price") or avg_cost
        else:
            quote = get_quote(asset["ticker"], asset["asset_type"])
            if quote:
                current_price = quote["price"]
                change_pct = quote.get("change_pct", 0.0) or 0.0
            elif asset.get("manual_price"):
                current_price = asset["manual_price"]
            else:
                current_price = avg_cost  # fallback — no P&L shown

        current_value = round(net_qty * current_price, 2)
        pnl = round(current_value - net_invested, 2)
        pnl_pct = round((pnl / net_invested) * 100, 2) if net_invested > 0 else 0.0

        # Dividends / rendimentos for this asset
        div_row = conn.execute(
            """SELECT COALESCE(SUM(amount), 0) as total
               FROM investment_dividends
               WHERE asset_id=? AND app_user_id=?""",
            (asset["id"], app_user_id),
        ).fetchone()
        div_total = div_row["total"] if div_row else 0.0

        dy = round((div_total / net_invested) * 100, 2) if net_invested > 0 else 0.0

        holding = {
            "asset_id": asset["id"],
            "ticker": asset["ticker"],
            "name": asset["name"],
            "asset_type": asset["asset_type"],
            "asset_type_label": TYPE_LABELS.get(asset["asset_type"], asset["asset_type"]),
            "sector": asset["sector"] or "",
            "quantity": round(net_qty, 6),
            "avg_cost": round(avg_cost, 4),
            "current_price": round(current_price, 4),
            "net_invested": round(net_invested, 2),
            "current_value": current_value,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "dividends_received": round(div_total, 2),
            "dividend_yield": dy,
            "change_pct": change_pct,
            "manual_price": asset.get("manual_price"),
        }
        holdings.append(holding)

        total_invested += net_invested
        total_current += current_value
        total_dividends += div_total

        at = asset["asset_type"]
        if at not in by_type:
            by_type[at] = {
                "label": TYPE_LABELS.get(at, at),
                "invested": 0.0,
                "current": 0.0,
            }
        by_type[at]["invested"] += net_invested
        by_type[at]["current"] += current_value

    conn.close()

    # Sort holdings by current value desc
    holdings.sort(key=lambda h: h["current_value"], reverse=True)

    total_pnl = round(total_current - total_invested, 2)
    total_pnl_pct = (
        round((total_pnl / total_invested) * 100, 2) if total_invested > 0 else 0.0
    )

    # Allocation percentages
    for at, info in by_type.items():
        info["pct"] = round((info["current"] / total_current) * 100, 1) if total_current > 0 else 0.0
        info["invested"] = round(info["invested"], 2)
        info["current"] = round(info["current"], 2)

    return {
        "holdings": holdings,
        "summary": {
            "total_invested": round(total_invested, 2),
            "total_current": round(total_current, 2),
            "total_pnl": total_pnl,
            "total_pnl_pct": total_pnl_pct,
            "total_dividends": round(total_dividends, 2),
            "total_return": round(total_pnl + total_dividends, 2),
        },
        "by_type": by_type,
    }
