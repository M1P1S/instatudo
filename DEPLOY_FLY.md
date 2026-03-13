# Deploy InstaTudo — Fly.io (gratuito)

## Por que Fly.io?
- Plano grátis: ~$5 de crédito/mês (suficiente para 1 app sempre ligado)
- Sem configurar VM, sem abrir portas, sem Nginx
- HTTPS automático, URL `.fly.dev` grátis
- Deploy em 5 minutos

---

## Passo 1 — Criar conta

Acesse: https://fly.io → **Sign up**

Cadastre com e-mail + Google. **Não precisa colocar cartão no início.**

---

## Passo 2 — Instalar o CLI `flyctl`

**Windows (PowerShell como Administrador):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

**Mac/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

Após instalar, faça login:
```bash
flyctl auth login
```
(Abre o navegador para autenticar)

---

## Passo 3 — Clonar o repositório

```bash
git clone https://github.com/SEU_USUARIO/instatudo.git
cd instatudo
```

---

## Passo 4 — Criar o app no Fly.io

```bash
flyctl apps create instatudo
```

> Se o nome `instatudo` já estiver ocupado, use outro (ex: `instatudo-app`, `meu-instatudo`).
> O nome define a URL: `https://instatudo.fly.dev`

---

## Passo 5 — Criar o volume de dados persistente

O banco de dados SQLite e as sessões do Instagram ficam aqui:

```bash
flyctl volumes create instatudo_data --region gru --size 1
```

---

## Passo 6 — Configurar as variáveis de ambiente (secrets)

```bash
flyctl secrets set \
  JWT_SECRET=$(openssl rand -hex 64) \
  ASAAS_API_KEY=sua_chave_aqui \
  ASAAS_ENVIRONMENT=production
```

> No Windows (PowerShell), rode cada um separado:
> ```powershell
> flyctl secrets set JWT_SECRET="chave-longa-aleatoria-aqui"
> flyctl secrets set ASAAS_API_KEY="sua_chave_asaas"
> flyctl secrets set ASAAS_ENVIRONMENT="production"
> ```

---

## Passo 7 — Deploy!

```bash
flyctl deploy
```

Aguarde ~3 minutos. Ao final você verá:
```
✅ v1 deployed successfully
```

---

## Passo 8 — Ver a URL do app

```bash
flyctl status
```

Sua URL será: **`https://instatudo.fly.dev`**

---

## Passo 9 — Configurar Webhook no Asaas

No painel Asaas → Configurações → Notificações → Webhook:

- **URL:** `https://instatudo.fly.dev/api/webhooks/asaas`
- **Eventos:** `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `SUBSCRIPTION_INACTIVATED`

---

## Comandos úteis

```bash
# Ver logs em tempo real
flyctl logs

# Reiniciar o app
flyctl restart

# Atualizar após mudanças no código
flyctl deploy

# Ver variáveis de ambiente configuradas
flyctl secrets list

# Acessar o shell dentro do container
flyctl ssh console
```

---

## Atualizar o código no futuro

```bash
git pull origin main
flyctl deploy
```

Pronto! Fly.io faz o build e o deploy automaticamente.
