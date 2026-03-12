# 📸 InstaTudo

Sistema gratuito de gestão e automação para Instagram.

## Funcionalidades

| # | Módulo | Descrição |
|---|--------|-----------|
| 1 | **Auto-Follow** | Segue usuários da lista de seguidores/seguindo de qualquer perfil alvo, com delay aleatório configurável |
| 2 | **Auto-Unfollow** | Remove seguidos que não seguem de volta (ou todos os seguidos pelo bot) |
| 3 | **Analytics** | Captura snapshots de seguidores, following, posts + métricas de curtidas, comentários e visualizações |
| 4 | **Sugestão de conteúdo** | Gera ideias de Reels, carrosséis, fotos e Stories com hashtags e melhores horários |
| 5 | **Teleprompter** | Leitor de roteiros com velocidade, tamanho de fonte, modo espelho e tela cheia |

## Instalação e uso

```bash
# Clone o repositório
git clone <repo-url>
cd instatudo

# Inicie com o script (cria venv e instala tudo automaticamente)
./start.sh
```

Acesse: **http://localhost:8000**

### Requisitos
- Python 3.9+
- Conexão com internet

## Segurança e limites recomendados

| Configuração | Valor seguro |
|---|---|
| Delay mínimo entre follows | 30–60 s |
| Delay máximo | 90–180 s |
| Follows por dia | ≤ 50 |
| Unfollows por dia | ≤ 50 |

> **Aviso:** A automação de contas viola os Termos de Uso do Instagram. Use com responsabilidade e em volume moderado. Sessões salvas localmente em `backend/db/session.json`.

## Estrutura do projeto

```
instatudo/
├── backend/
│   ├── main.py              # FastAPI – rotas da API
│   ├── db/
│   │   └── database.py      # SQLite – banco de dados local
│   └── modules/
│       ├── instagram_client.py  # Login/sessão
│       ├── follower.py          # Auto-follow
│       ├── unfollower.py        # Auto-unfollow
│       ├── analytics.py         # Métricas do perfil
│       ├── content.py           # Sugestão de conteúdo
│       └── teleprompter.py      # Gestão de roteiros
├── frontend/
│   ├── static/
│   │   ├── css/style.css    # Estilos dark mode
│   │   └── js/app.js        # Frontend SPA
│   └── templates/
│       ├── index.html        # Dashboard principal
│       └── teleprompter.html # Leitor de teleprompter
├── requirements.txt
├── start.sh
└── .env.example
```

## Teclas do Teleprompter

| Tecla | Ação |
|---|---|
| `Space` | Play / Pausar |
| `F` | Tela cheia |
| `H` | Ocultar/mostrar controles |
| `R` | Reiniciar |
| `↑ / ↓` | Aumentar/diminuir velocidade |
