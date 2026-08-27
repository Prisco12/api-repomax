# Produção segura e simples — PostgreSQL

Este guia parte do cenário em que somente a pasta `api-postgres` foi copiada para um projeto novo. O objetivo é publicar apenas a API por HTTPS e manter banco, Redis e observabilidade fora da internet.

## Como a arquitetura funciona

```text
Internet → Caddy (80/443) → API NestJS (rede Docker)
                              ├── PostgreSQL
                              ├── Redis
                              └── Alloy → Loki/Tempo

Prometheus → /api/v1/metrics pela rede Docker
Grafana → Prometheus, Loki e Tempo pela rede Docker
```

- Caddy é o único serviço público e gera/renova HTTPS.
- A API usa `expose`, sem publicar a porta `3000` no servidor.
- Caddy encaminha rotas da aplicação e retorna `404` para `/api/v1/metrics` e `/docs`.
- Prometheus acessa `/metrics` diretamente por `http://api:3000`, sem passar pelo Caddy.
- PostgreSQL, Redis, Loki, Tempo, Prometheus e Alloy existem somente na rede interna.
- Grafana fica ligado a `127.0.0.1:3001`, acessível localmente ou por túnel SSH.

## Pré-requisitos

1. Servidor Linux com Docker e Docker Compose.
2. Domínio apontando para o IP público do servidor.
3. Portas `80` e `443` liberadas.
4. Credenciais de um SMTP real.

## Primeiro deploy

### 1. Crie o ambiente

```bash
cp .env.production.example .env.production
```

Edite `.env.production` e substitua todos os valores `replace-*`. Configure principalmente:

- `DOMAIN`: domínio da API, por exemplo `api.exemplo.com`;
- `ACME_EMAIL`: contato usado pelo emissor do certificado;
- `CORS_ORIGIN` e `FRONTEND_URL`: endereço HTTPS do frontend;
- `JWT_ACCESS_SECRET`: segredo aleatório com no mínimo 32 caracteres;
- `POSTGRES_USER`, `POSTGRES_PASSWORD` e `REDIS_PASSWORD`;
- configurações `MAIL_*` do provedor real;
- senha inicial do administrador e senha do Grafana.
- retenção de auditoria (`AUDIT_RETENTION_*`); no primeiro deploy mantenha `AUDIT_RETENTION_DRY_RUN=true`.

Use valores aleatórios longos. Como as credenciais são incorporadas em URLs internas, senhas com caracteres reservados de URL, como `@`, `:`, `/`, `?` e `#`, devem ser codificadas ou evitadas.

O arquivo `.env.production` não é versionado.

### 2. Valide antes de subir

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  config --quiet
```

Sem saída significa configuração válida. Variáveis obrigatórias ausentes interrompem o comando antes do deploy.

### 3. Suba a aplicação

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  up --build -d
```

Antes de iniciar a API, o container executa automaticamente `prisma migrate deploy`. Portanto, migrations versionadas são aplicadas no primeiro deploy e nas atualizações.

Na primeira execução da retenção, procure por `Audit retention dry run completed` nos logs da API e confira `candidates`. Depois do backup e da validação do prazo, altere `AUDIT_RETENTION_DRY_RUN=false` e recrie o container da API.

### 4. Crie roles e administrador

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  exec api npm run seed
```

O seed pode ser executado novamente: sincroniza o catálogo de permissões e não troca a senha de um administrador existente.

### 5. Verifique

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  ps
```

Testes externos esperados:

```bash
curl https://api.exemplo.com/api/v1/health/ready
curl -I https://api.exemplo.com/api/v1/metrics
curl -I https://api.exemplo.com/docs
```

- health: `200`;
- metrics: `404`;
- Swagger: `404`.

## Grafana em produção

Grafana não fica público. No seu computador, abra um túnel:

```bash
ssh -L 3001:127.0.0.1:3001 usuario@servidor
```

Enquanto a conexão estiver aberta, acesse `http://localhost:3001` e use `GRAFANA_ADMIN_USER` e `GRAFANA_ADMIN_PASSWORD`.

## Operação diária

Logs da API:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs -f api
```

Atualização:

```bash
git pull
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

Parar sem apagar dados:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml down
```

Não use `down -v` em produção: essa opção remove os volumes de PostgreSQL, Redis, Grafana, Loki, Tempo e Prometheus.

Os logs locais dos containers giram em cinco arquivos de até 20 MB por container. O Loki mantém 30 dias no volume `loki_data`; o PostgreSQL mantém 365 dias de `AuditLog` por padrão. Antes de reduzir qualquer prazo, faça backup e valide requisitos comerciais e de privacidade.

## Por que `TRUST_PROXY=true`

Caddy encaminha o IP real no header `X-Forwarded-For`. A API confia em exatamente um proxy, permitindo que rate limit e auditoria continuem registrando o IP do cliente, e não o IP interno do Caddy. Em desenvolvimento, `TRUST_PROXY=false`.
