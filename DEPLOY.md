# Deploy InstaTudo — Oracle Cloud Always Free + DuckDNS

## Visão geral

```
Internet → DuckDNS (DNS grátis) → IP Oracle Cloud → Nginx (HTTPS) → FastAPI :8000
```

---

## Passo 1 — Criar conta Oracle Cloud

1. Acesse: https://www.oracle.com/cloud/free/
2. Clique em **"Start for free"**
3. Preencha com nome, e-mail e país (**Brasil**)
4. Informe cartão de crédito (só para verificação — **não cobra nada**)
5. Aguarde o e-mail de confirmação

> O Oracle Cloud Always Free inclui **2 VMs AMD** (1 GB RAM cada) ou até **4 VMs ARM** (24 GB RAM no total). Use a opção AMD para simplicidade.

---

## Passo 2 — Criar a VM (servidor)

1. No painel Oracle, vá em **Compute → Instances → Create Instance**
2. Configure:
   - **Name:** `instatudo`
   - **Image:** Ubuntu 22.04 (Canonical)
   - **Shape:** VM.Standard.E2.1.Micro (Always Free)
   - **Networking:** Deixe o padrão (cria VCN automaticamente)
   - **SSH Keys:** Clique em **"Generate a key pair"** e faça download das duas chaves
3. Clique em **Create**
4. Aguarde ~2 minutos e anote o **IP Público** da VM

---

## Passo 3 — Abrir portas no Oracle Cloud

Por padrão o Oracle bloqueia as portas. É necessário abrir HTTP e HTTPS:

1. Na VM, clique na **VCN (rede)** → **Security Lists** → **Default Security List**
2. Clique em **Add Ingress Rules** e adicione:

| Source CIDR | IP Protocol | Dest. Port |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

3. Salve as regras

---

## Passo 4 — Domínio grátis com DuckDNS

1. Acesse: https://www.duckdns.org
2. Faça login com Google ou GitHub
3. Escolha um subdomínio (ex: `instatudo`) → clique **add domain**
4. No campo **current ip**, cole o **IP Público** da sua VM Oracle
5. Clique em **update ip**

Seu site ficará em: **`https://instatudo.duckdns.org`**

---

## Passo 5 — Conectar via SSH na VM

No terminal do seu computador (ou use o **Cloud Shell** do Oracle):

```bash
# Linux/Mac:
chmod 400 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@SEU_IP_ORACLE

# Windows: use o PuTTY ou o terminal do VS Code
```

---

## Passo 6 — Executar o deploy

Dentro da VM, execute:

```bash
# Clonar o repositório
git clone https://github.com/SEU_USUARIO/instatudo.git /tmp/instatudo-setup
cd /tmp/instatudo-setup

# Executar o script de deploy
bash deploy.sh
```

O script vai pedir:
1. URL do repositório Git
2. ASAAS_API_KEY (sua chave de produção)
3. Domínio (ex: `instatudo.duckdns.org`)
4. E-mail para o certificado SSL

---

## Passo 7 — Configurar Webhook no Asaas

Após o deploy, volte ao painel Asaas e configure:

- **URL do Webhook:** `https://instatudo.duckdns.org/api/webhooks/asaas`
- **Eventos:** `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `SUBSCRIPTION_INACTIVATED`
- **Token:** Gere e me passe para configurar no servidor

---

## Comandos úteis no servidor

```bash
# Ver status do serviço
sudo systemctl status instatudo

# Ver logs em tempo real
sudo journalctl -u instatudo -f

# Reiniciar após atualização
sudo systemctl restart instatudo

# Atualizar o código
cd /opt/instatudo && sudo git pull && sudo systemctl restart instatudo

# Ver logs do Nginx
sudo tail -f /var/log/nginx/instatudo_error.log
```

---

## Atualizar o sistema depois

Sempre que houver mudanças no código:

```bash
cd /opt/instatudo
sudo git pull origin main
sudo .venv/bin/pip install -r requirements.txt  # se houver novos pacotes
sudo systemctl restart instatudo
```

---

## Estrutura no servidor

```
/opt/instatudo/          ← código da aplicação
  .env                   ← variáveis de ambiente (não vai ao Git)
  backend/db/
    instatudo.db         ← banco de dados SQLite (persistente)
    session_*.json       ← sessões Instagram por usuário

/etc/systemd/system/instatudo.service   ← serviço
/etc/nginx/sites-available/instatudo    ← configuração Nginx
```
