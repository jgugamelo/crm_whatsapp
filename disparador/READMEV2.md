# 🤖 Chatwoot DDM — Documentação Técnica

> Stack de atendimento via WhatsApp do Grupo DDM, baseado em Chatwoot self-hosted + WAHA (MeuChatIA).

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Infraestrutura](#infraestrutura)
- [Chatwoot](#chatwoot)
- [WAHA / MeuChatIA](#waha--meuchatia)
- [Fluxos Principais](#fluxos-principais)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Repositório](#repositório)
- [Troubleshooting](#troubleshooting)

---

## Visão Geral

```
WhatsApp ↔ WAHA (MeuChatIA) ↔ Chatwoot (atendimento)
```

Mensagens recebidas no WhatsApp chegam ao Chatwoot via webhook customizado. Respostas dos agentes são enviadas de volta ao WhatsApp via webhook do MeuChatIA.

---

## Infraestrutura

**Plataforma:** Easypanel (`xzz0ed.easypanel.host`)  
**Projeto:** `chatwoot_n8n`

| Container | Tipo | Descrição |
|---|---|---|
| `chatwoot` | App Rails + Sidekiq | Aplicação principal via Foreman |
| `postgres` | PostgreSQL | Banco de dados |
| `redis` | Redis | Cache e filas Sidekiq |

> O Sidekiq roda dentro do container `chatwoot` via `Procfile.prod` usando Foreman — não há container separado de worker.

---

## Chatwoot

**URL:** `https://chatwoot-n8n-chatwoot.xzz0ed.easypanel.host`  
**Login:** `admin@ddm.ia.br`  
**Versão:** 4.14.0 (fork do Fazer.ai)  
**Repositório:** `github.com/Caio-Rodrigues-V/chatwoot` (branch `sync/fazer-ai`)

### Inbox principal

| Campo | Valor |
|---|---|
| Nome | `Comercial - DDM` |
| Tipo | `Channel::Api` |
| Inbox ID | `5` |
| Identifier | `APtfkzcStHRyzX7N8AZ3Lhnr` |
| Account ID | `2` |
| API Token | `uzyPh18QkaW1PKqfcNskSzAF` |

### Customizações no fork

O Chatwoot v4 removeu a rota `POST /api/v1/accounts/:id/inboxes/:id/messages` que o WAHA usa para entregar mensagens. As seguintes customizações foram adicionadas para restaurar compatibilidade:

**`app/controllers/api/v1/accounts/inbox_messages_controller.rb`**  
Controller customizado que recebe o payload do WAHA, extrai telefone e nome do remetente, cria/encontra o contato e conversa, e salva a mensagem como `incoming`.

**`config/routes.rb`**  
Adicionada a rota:
```ruby
resources :inboxes, only: [...] do
  resources :messages, only: [:create], controller: 'inbox_messages'
end
```

**`Procfile.prod`**  
```
web: bundle exec rails server -b 0.0.0.0 -p 3000 -e production
worker: bundle exec sidekiq -C config/sidekiq.yml
```

**`Dockerfile`**  
CMD aponta para o `Procfile.prod` via Foreman:
```dockerfile
CMD ["/app/docker/entrypoints/rails.sh", "bundle", "exec", "foreman", "start", "-f", "Procfile.prod"]
```

### Banco de dados

Banco: `chatwoot_production`

**Comandos úteis:**
```sql
-- Listar inboxes ativas
SELECT id, name FROM inboxes;

-- Verificar webhook de saída
SELECT webhook_url FROM channel_api WHERE id = 4;

-- Verificar source_id dos contatos
SELECT ci.source_id, c.phone_number, c.name
FROM contact_inboxes ci
JOIN contacts c ON c.id = ci.contact_id
WHERE ci.inbox_id = 5;

-- Resetar senha de admin (gerar hash no terminal do container primeiro)
UPDATE users SET encrypted_password = 'HASH' WHERE email = 'admin@ddm.ia.br';
```

**Gerar hash de senha:**
```bash
# No terminal do container chatwoot (Easypanel)
bundle exec rails runner "puts BCrypt::Password.create('sua_senha')"
```

---

## WAHA / MeuChatIA

Provedor gerenciado de WhatsApp via protocolo Baileys (GOWS).

**Dashboard:** `https://api.meuchatia.com.br/dashboard/`  
**Sessão:** `Comercialddm`  
**Número:** `5521999018751` (DDM COMERCIAL)

### App Chatwoot configurado na sessão

| Campo | Valor |
|---|---|
| App ID | `app_e1014ff34e8f42f6a30ab266e45c78c5` |
| ChatWoot URL | `https://chatwoot-n8n-chatwoot.xzz0ed.easypanel.host/` |
| Account ID | `2` |
| Account Token | `uzyPh18QkaW1PKqfcNskSzAF` |
| Inbox ID | `5` |
| Inbox Identifier | `APtfkzcStHRyzX7N8AZ3Lhnr` |

### Webhook de entrada (WAHA → Chatwoot)

Configurado na sessão `Comercialddm` → **Webhooks**:

```
URL: https://chatwoot-n8n-chatwoot.xzz0ed.easypanel.host/api/v1/accounts/2/inboxes/5/messages
Header: api_access_token = uzyPh18QkaW1PKqfcNskSzAF
Eventos: message, session.status
```

### Webhook de saída (Chatwoot → WAHA)

Configurado no banco (`channel_api.webhook_url`, id=4):

```
https://api.meuchatia.com.br/webhooks/chatwoot/Comercialddm/app_e1014ff34e8f42f6a30ab266e45c78c5
```

Para atualizar se o app for recriado:
```sql
UPDATE channel_api SET webhook_url = 'NOVA_URL' WHERE id = 4;
```

---

## Fluxos Principais

### Recebimento (WhatsApp → Chatwoot)

```
1. Usuário envia mensagem no WhatsApp
2. WAHA captura e faz POST para /api/v1/accounts/2/inboxes/5/messages
3. InboxMessagesController processa o payload:
   - Extrai telefone de payload._data.Info.SenderAlt
   - Cria/encontra Contact (phone_number)
   - Cria/encontra ContactInbox (source_id = "número@c.us")
   - Cria/encontra Conversation aberta
   - Salva Message como :incoming
4. Mensagem aparece na inbox "Comercial - DDM"
```

### Envio (Chatwoot → WhatsApp)

```
1. Agente envia mensagem pelo Chatwoot
2. Sidekiq enfileira WebhookJob
3. WebhookJob faz POST para a URL do MeuChatIA
4. MeuChatIA envia via WAHA usando o source_id do contato ("número@c.us")
5. Mensagem chega no WhatsApp do cliente
```

---

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL |
| `REDIS_URL` | URL do Redis |
| `SECRET_KEY_BASE` | Chave secreta Rails |
| `RAILS_ENV` | `production` |
| `PORT` | Porta do servidor (padrão: 3000) |

---

## Repositório

| Campo | Valor |
|---|---|
| Fork base | `fazer-ai/chatwoot` → `grupo-ddm/chatwoot` → `Caio-Rodrigues-V/chatwoot` |
| Branch de deploy | `sync/fazer-ai` |
| Deploy | Easypanel → build via Dockerfile do repositório |

Para fazer deploy de uma alteração:
```bash
git add .
git commit -m "descrição"
git push origin sync/fazer-ai
# Depois clicar em "Implantar" no Easypanel
```

---

## Troubleshooting

### Inboxes duplicadas aparecem na UI

Deletar direto no banco e reiniciar o container:
```sql
DELETE FROM inboxes WHERE id != 5;
```

### Mensagens do WhatsApp não chegam no Chatwoot

1. Verificar se a sessão `Comercialddm` está `WORKING` no MeuChatIA
2. Verificar se o webhook aponta para a URL correta com o header `api_access_token`
3. Verificar logs do container `chatwoot` no Easypanel

### Mensagens do agente não chegam no WhatsApp

1. Verificar `channel_api.webhook_url` no banco — deve ser a URL do MeuChatIA com o app ID correto
2. Verificar se o `source_id` do `ContactInbox` está no formato `número@c.us`
3. Verificar se o app Chatwoot está `ENABLED` na sessão do MeuChatIA
4. Se o app foi recriado, atualizar a `webhook_url` no banco

### Container em loop de restart

Verificar o `Procfile.prod` — deve ter apenas `web` e `worker`, sem a entrada `release`.

### Login inválido

```bash
# Terminal do container chatwoot
bundle exec rails runner "puts BCrypt::Password.create('nova_senha')"

# Postgres
UPDATE users SET encrypted_password = 'HASH_GERADO' WHERE email = 'admin@ddm.ia.br';
```

---

*Grupo DDM — Time de IA — Junho/2026*