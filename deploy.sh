#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
#  InstaTudo — Script de deploy para Ubuntu 22.04 (Oracle Cloud)
#  Uso: bash deploy.sh
# ══════════════════════════════════════════════════════════════════════
set -e

REPO_DIR="/opt/instatudo"
SERVICE_USER="instatudo"
PYTHON="python3.11"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     📸  InstaTudo — Deploy Server        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Atualizar sistema ──────────────────────────────────────────────
echo "▶ Atualizando sistema..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── 2. Instalar dependências do sistema ───────────────────────────────
echo "▶ Instalando dependências..."
sudo apt-get install -y -qq \
    python3.11 python3.11-venv python3.11-dev \
    python3-pip git nginx certbot python3-certbot-nginx \
    curl wget ufw build-essential

# ── 3. Criar usuário do serviço ───────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "▶ Criando usuário $SERVICE_USER..."
    sudo useradd -m -s /bin/bash "$SERVICE_USER"
fi

# ── 4. Clonar / atualizar repositório ────────────────────────────────
echo "▶ Configurando repositório..."
if [ ! -d "$REPO_DIR" ]; then
    echo ""
    echo "  Informe a URL do repositório Git (ex: https://github.com/usuario/instatudo):"
    read -r REPO_URL
    sudo git clone "$REPO_URL" "$REPO_DIR"
else
    echo "  Repositório já existe — atualizando..."
    sudo git -C "$REPO_DIR" pull
fi
sudo chown -R "$SERVICE_USER":"$SERVICE_USER" "$REPO_DIR"

# ── 5. Criar ambiente virtual e instalar pacotes Python ───────────────
echo "▶ Configurando ambiente Python..."
sudo -u "$SERVICE_USER" bash -c "
    cd $REPO_DIR
    $PYTHON -m venv .venv
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -r requirements.txt
"

# ── 6. Configurar .env ────────────────────────────────────────────────
if [ ! -f "$REPO_DIR/.env" ]; then
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║        Configuração do ambiente          ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""
    echo "  Cole sua ASAAS_API_KEY:"
    read -r ASAAS_KEY
    echo ""
    echo "  ASAAS_ENVIRONMENT (sandbox/production) [production]:"
    read -r ASAAS_ENV
    ASAAS_ENV=${ASAAS_ENV:-production}

    # Gera JWT_SECRET aleatório
    JWT_SECRET=$(openssl rand -hex 64)

    sudo tee "$REPO_DIR/.env" > /dev/null <<EOF
PORT=8000
HOST=127.0.0.1

JWT_SECRET=$JWT_SECRET

ASAAS_API_KEY=$ASAAS_KEY
ASAAS_ENVIRONMENT=$ASAAS_ENV
EOF
    sudo chown "$SERVICE_USER":"$SERVICE_USER" "$REPO_DIR/.env"
    echo "  ✅ .env criado!"
else
    echo "  .env já existe — pulando."
fi

# ── 7. Criar diretório de dados persistentes ─────────────────────────
sudo mkdir -p "$REPO_DIR/backend/db"
sudo chown -R "$SERVICE_USER":"$SERVICE_USER" "$REPO_DIR/backend/db"

# ── 8. Instalar serviço systemd ───────────────────────────────────────
echo "▶ Configurando serviço systemd..."
sudo cp "$REPO_DIR/infra/instatudo.service" /etc/systemd/system/instatudo.service
sudo systemctl daemon-reload
sudo systemctl enable instatudo
sudo systemctl restart instatudo
echo "  ✅ Serviço iniciado!"

# ── 9. Configurar Nginx ───────────────────────────────────────────────
echo ""
echo "  Informe o domínio configurado (ex: instatudo.duckdns.org):"
read -r DOMAIN

sudo cp "$REPO_DIR/infra/nginx.conf" /etc/nginx/sites-available/instatudo
sudo sed -i "s/SEU_DOMINIO/$DOMAIN/g" /etc/nginx/sites-available/instatudo
sudo ln -sf /etc/nginx/sites-available/instatudo /etc/nginx/sites-enabled/instatudo
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
echo "  ✅ Nginx configurado para $DOMAIN"

# ── 10. Configurar Firewall ───────────────────────────────────────────
echo "▶ Configurando firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
echo "  ✅ Firewall ativo (SSH + HTTP/HTTPS)"

# ── 11. SSL com Let's Encrypt ─────────────────────────────────────────
echo ""
echo "  Informe um e-mail para o certificado SSL:"
read -r SSL_EMAIL

echo "▶ Gerando certificado SSL..."
sudo certbot --nginx -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive --redirect
echo "  ✅ HTTPS ativado!"

# ── Renovação automática ──────────────────────────────────────────────
(sudo crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | sudo crontab -

# ── Conclusão ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅  Deploy concluído!                               ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  🌐  https://$DOMAIN"
echo "║  🔗  Webhook Asaas: https://$DOMAIN/api/webhooks/asaas"
echo "║"
echo "║  Comandos úteis:"
echo "║    sudo systemctl status instatudo   → ver status"
echo "║    sudo journalctl -u instatudo -f   → ver logs"
echo "║    sudo systemctl restart instatudo  → reiniciar"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
