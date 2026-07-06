# 💬 DDM Disparador — WhatsApp IA

Plataforma de disparo inteligente de mensagens via WhatsApp com **WAHA API** + **OpenAI**.  
Fork interno do Grupo DDM — frontend adaptado ao design system proprietário (laranja #FF5706 · Poppins + Inter).

---

## Stack

| Camada   | Tecnologia                |
| -------- | ------------------------- |
| Frontend | Next.js 14 + Tailwind CSS |
| Backend  | NestJS + Swagger          |
| Banco    | Supabase (PostgreSQL)     |
| Fila     | Redis + BullMQ            |
| WhatsApp | WAHA API                  |
| IA       | OpenAI GPT-4o-mini        |

---

## Setup

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env`:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

OPENAI_API_KEY=sk-...

WAHA_BASE_URL=http://api.meuchatia.com.br   # WAHA DDM já existente
WAHA_API_KEY=...

JWT_SECRET=troque-por-algo-seguro
WEBHOOK_SECRET=troque-por-algo-seguro

BACKEND_URL=https://ddm-disparador-backend.up.railway.app
FRONTEND_URL=https://ddm-disparador-frontend.up.railway.app
```

### 2. Schema no Supabase

No SQL Editor do Supabase, execute em ordem:

```
database/001_schema.sql    ← Tabelas, índices e RLS
database/002_functions.sql ← Funções auxiliares
```

### 3. Redis local (para desenvolvimento)

```bash
docker-compose up redis -d
```

### 4. Backend

```bash
cd backend
npm install
npm run start:dev
# http://localhost:3001
# Swagger: http://localhost:3001/api/docs
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev
# http://localhost:3000
```

---

## Deploy Railway

Cada serviço sobe separado no Railway:

| Serviço  | Root Dir   | Start Command          |
| -------- | ---------- | ---------------------- |
| frontend | `frontend` | `npm run build && npm start` |
| backend  | `backend`  | `npm run start:prod`   |
| redis    | —          | imagem `redis:7-alpine`|

Variáveis de ambiente: configurar em cada serviço via Railway dashboard.

---

## Primeiro usuário (Admin)

1. Crie o usuário no Supabase → Authentication → Users
2. Execute no SQL Editor:

```sql
INSERT INTO public.users (id, nome, email, role)
VALUES ('<uuid-do-usuario>', 'Seu Nome', 'seu@ddm.adv.br', 'admin');
```

---

## Fluxo de uso

```
1. /auth/login → faça login
2. Sessões WAHA → crie sessão → escaneie QR Code
3. Contatos → importe CSV (colunas: nome, telefone, email, origem)
4. Campanhas → crie campanha → selecione sessão e base de contatos
5. "Gerar variações com IA" → aprove as variações
6. Aprove a campanha → Iniciar
7. Dashboard → métricas em tempo real
8. Atendimento → respostas classificadas como interesse
```

---

## Estrutura do projeto

```
ddm-disparador/
├── backend/
│   └── src/
│       ├── auth/                    # JWT login
│       ├── contacts/                # Importação CSV/XLSX
│       ├── campaigns/               # CRUD + aprovação + início
│       ├── message-variations/      # Geração OpenAI
│       ├── message-queue/           # BullMQ worker
│       ├── waha/                    # Integração WAHA API
│       ├── webhooks/                # Eventos WAHA
│       ├── blacklist/               # Bloqueios
│       ├── risk/                    # Motor de risco
│       ├── followup/                # Follow-ups automáticos
│       ├── response-classification/ # Classificação de intenção
│       ├── attendance/              # Cards atendimento humano
│       └── dashboard/               # Métricas
├── frontend/
│   └── src/app/
│       ├── auth/login/              # Login DDM
│       ├── dashboard/               # Dashboard principal
│       ├── campaigns/               # Campanhas
│       ├── contacts/                # Contatos
│       ├── sessions/                # Sessões WAHA
│       ├── attendance/              # Atendimento
│       └── blacklist/               # Blacklist
└── database/
    ├── 001_schema.sql
    └── 002_functions.sql
```

---

## Limites de segurança (defaults)

| Parâmetro                     | Valor         |
| ----------------------------- | ------------- |
| Limite diário por sessão      | 50 msg/dia    |
| Intervalo mínimo entre envios | 90s           |
| Intervalo máximo entre envios | 300s          |
| Pausa a cada 20 mensagens     | 10 min        |
| Pausa a cada 100 mensagens    | 60 min        |
| Opt-out > 3%                  | Reduz vel.    |
| Opt-out > 5%                  | Pausa campanha|
| Erro > 10%                    | Pausa sessão  |
| Follow-ups máximos            | 2             |
