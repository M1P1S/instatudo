#!/bin/bash
# ── InstaTudo – Script de inicialização ──────────────────────────────────────
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║          📸  InstaTudo               ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3 não encontrado. Instale com: sudo apt install python3"
  exit 1
fi

# Create virtualenv if needed
if [ ! -d ".venv" ]; then
  echo "📦 Criando ambiente virtual..."
  python3 -m venv .venv
fi

source .venv/bin/activate

# Install deps
echo "📦 Instalando dependências..."
pip install -q -r requirements.txt

# Start server
echo ""
echo "✅ Iniciando servidor em http://localhost:8000"
echo "   Pressione Ctrl+C para parar"
echo ""
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
