"""
Content suggestion module — template-based (no external AI cost).
"""
from datetime import datetime
import random
from ..db.database import get_connection

CONTENT_TEMPLATES = {
    "reels": [
        "🎬 {topic} em {duration} segundos – mostre o processo do zero ao resultado",
        "💡 {number} dicas rápidas sobre {topic} que ninguém te contou",
        "Antes vs Depois: como {topic} transformou minha rotina",
        "POV: você descobriu {topic} pela primeira vez",
        "Rotina de {period} | {topic} explicado",
    ],
    "carrossel": [
        "📊 {number} erros comuns em {topic} (e como evitá-los)",
        "Guia completo de {topic} – salva para não esquecer!",
        "Passo a passo: comece {topic} do zero",
        "Mitos vs Verdades sobre {topic}",
        "{number} ferramentas gratuitas para {topic}",
    ],
    "foto": [
        "Citação motivacional sobre {topic}",
        "Bastidores: um dia trabalhando com {topic}",
        "Resultado final de {topic} – o que você acha?",
        "Pergunta do dia: qual é o seu maior desafio com {topic}?",
    ],
    "stories": [
        "Enquete: você prefere A ou B sobre {topic}?",
        "Curiosidade do dia sobre {topic}",
        "Compartilhe sua experiência com {topic}",
        "Quiz: quanto você sabe sobre {topic}?",
    ],
}

BEST_TIMES = {
    "monday": ["08:00", "12:00", "19:00"],
    "tuesday": ["09:00", "13:00", "20:00"],
    "wednesday": ["08:00", "11:00", "18:00"],
    "thursday": ["09:00", "12:00", "19:00"],
    "friday": ["08:00", "12:00", "17:00"],
    "saturday": ["10:00", "14:00", "20:00"],
    "sunday": ["11:00", "15:00", "18:00"],
}


def generate_ideas(topic: str, niche: str = "", count: int = 8) -> list:
    variables = {
        "topic": topic,
        "number": random.choice(["3", "5", "7", "10"]),
        "duration": random.choice(["30", "60", "90"]),
        "period": random.choice(["manhã", "semana", "trabalho"]),
    }
    ideas = []
    for content_type, templates in CONTENT_TEMPLATES.items():
        for tpl in templates:
            ideas.append({
                "title": tpl.format(**variables),
                "content_type": content_type,
                "description": _generate_description(tpl.format(**variables), topic),
                "hashtags": _generate_hashtags(topic, niche, content_type),
                "best_times": _get_best_times(),
            })
    random.shuffle(ideas)
    return ideas[:count]


def _generate_description(title: str, topic: str) -> str:
    intros = [
        f"Crie um conteúdo sobre: {title}. ",
        f"Aborde o tema {topic} de forma prática. ",
        f"Conteúdo focado em engajamento sobre {title}. ",
    ]
    ctas = [
        "Finalize com uma chamada para ação pedindo comentários.",
        "Peça para salvar e compartilhar.",
        "Encerre com uma pergunta para engajar a audiência.",
        "Convide a seguir para mais conteúdos.",
    ]
    return random.choice(intros) + random.choice(ctas)


def _generate_hashtags(topic: str, niche: str, content_type: str) -> str:
    base = ["#conteudo", "#instagram", "#dicas", "#viral", "#trending"]
    topic_tags = [f"#{w}" for w in topic.lower().split() if len(w) > 2]
    niche_tags = [f"#{w}" for w in niche.lower().split() if len(w) > 2] if niche else []
    type_tags = {
        "reels": ["#reels", "#reelsbrasil", "#videosdicas"],
        "carrossel": ["#carrossel", "#aprenda", "#salva"],
        "foto": ["#foto", "#instagood"],
        "stories": ["#stories", "#storiesdicas"],
    }.get(content_type, [])
    all_tags = list(set(base + topic_tags + niche_tags + type_tags))
    random.shuffle(all_tags)
    return " ".join(all_tags[:20])


def _get_best_times() -> list:
    day = datetime.now().strftime("%A").lower()
    return BEST_TIMES.get(day, ["09:00", "12:00", "18:00"])


def save_idea(title: str, description: str, hashtags: str, content_type: str, app_user_id: int = 0) -> dict:
    conn = get_connection()
    conn.execute(
        """INSERT INTO content_ideas (app_user_id, title, description, hashtags, content_type, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)""",
        (app_user_id, title, description, hashtags, content_type, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Ideia salva com sucesso!"}


def get_saved_ideas(app_user_id: int = 0) -> list:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM content_ideas WHERE app_user_id=? ORDER BY created_at DESC", (app_user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_idea_status(idea_id: int, status: str, app_user_id: int = 0) -> dict:
    conn = get_connection()
    conn.execute(
        "UPDATE content_ideas SET status=? WHERE id=? AND app_user_id=?",
        (status, idea_id, app_user_id)
    )
    conn.commit()
    conn.close()
    return {"success": True}
