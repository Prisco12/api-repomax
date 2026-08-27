# Documentação — template PostgreSQL

## Stack

NestJS, PostgreSQL, Prisma, JWT, Argon2, Pino, Swagger, Docker e Postman.

Para logs centralizados, métricas, traces e Grafana, consulte o [guia de observabilidade](observability.md). Para publicar com HTTPS e serviços internos protegidos, consulte o [guia de produção](production.md).

## Configuração local

1. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, segredos JWT e credenciais de seed.
2. Instale dependências: `npm install`.
3. Aplique as migrations: `npm run migrate:dev`.
4. Crie ou sincronize roles e permissões: `npm run seed:rbac`.
5. Crie o administrador inicial: `npm run seed:admin`.
6. Inicie: `npm run start:dev`.

`npm run seed` é um atalho para executar os dois comandos acima. O `seed:admin` nunca troca a senha de um administrador já existente. Ao adicionar permissões ao catálogo, execute somente `npm run seed:rbac`.

Após esta alteração, quem se cadastra em `POST /api/v1/auth/register` recebe automaticamente a role `user`. Isso exige que o seed tenha sido executado.

## Verificação de e-mail e recuperação de senha

O cadastro cria o usuário com `emailVerifiedAt = null`, gera um token válido por 24 horas e envia o link por SMTP. O login só é liberado depois de `POST /api/v1/auth/verify-email`. Apenas o hash do token é persistido, e seu uso é único.

- `POST /api/v1/auth/verify-email`: confirma o token recebido por e-mail;
- `POST /api/v1/auth/resend-verification`: substitui o token anterior e reenvia o e-mail;
- `POST /api/v1/auth/forgot-password`: sempre responde `204`, evitando enumeração de contas;
- `POST /api/v1/auth/reset-password`: usa token válido por uma hora, altera a senha e revoga todas as sessões.

Cadastro e reset exigem de 12 a 128 caracteres, com maiúscula, minúscula, número e símbolo. A política fica centralizada em `src/modules/auth/validation/password-policy.ts`; erros retornam `field`, `code` e uma mensagem com os requisitos ausentes. No Docker, abra o Mailpit em `http://localhost:8025` e copie do link o valor após `token=` para a variável correspondente da coleção Postman.

Em produção, configure `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM`, `MAIL_SECURE` e, quando o provedor exigir autenticação, `MAIL_USER` e `MAIL_PASSWORD`. `FRONTEND_URL` deve apontar para a URL pública do frontend que receberá os links. O frontend lê o token da URL e chama o endpoint `POST` correspondente da API.

O arquivo `.env.example` usa Mailpit (`mailpit:1025`, sem TLS) e nunca deve conter credenciais reais. Para SMTP externo, altere somente o `.env`, que não é versionado. O Compose respeita `MAIL_HOST` e usa Mailpit apenas como padrão. `npm run seed` não envia e-mails. Nos logs da API, `email accepted by SMTP` confirma que o servidor SMTP aceitou a mensagem; `Unable to send` contém a causa técnica. `ECONNREFUSED` para um IP público nas portas 465/587 indica bloqueio ou recusa de rede antes da autenticação, exigindo liberação da porta ou um provedor por API HTTPS.

## Administração de roles e permissões

Todos os endpoints abaixo exigem um access token com `roles:manage`. O administrador criado pelo seed recebe essa permissão após executar o seed e fazer login novamente.

- `GET /api/v1/rbac/permissions`: lista as permissões permitidas pelo template;
- `GET /api/v1/rbac/roles`: lista roles e suas permissões;
- `POST /api/v1/rbac/roles`: cria uma role;
- `PUT /api/v1/rbac/roles/:name/permissions`: substitui as permissões da role;
- `PUT /api/v1/rbac/users/:userId/roles`: substitui as roles do usuário.

As permissões continuam declaradas em `src/modules/authorization/permission-catalog.ts`; a API não aceita strings de permissão arbitrárias. Depois de alterar roles/permissões de um usuário, ele deve fazer login novamente (ou usar o refresh token) para receber o JWT atualizado.

## Refresh tokens

Cada login cria uma sessão. Tokens expirados do usuário são removidos no login e uma tarefa diária às 03:00 remove tokens expirados globalmente. A migration inclui o índice `userId + expiresAt` para essa consulta.

## Refresh token em cookie HttpOnly

`POST /auth/login` e `POST /auth/refresh` retornam somente `accessToken` e `user` no JSON. O refresh token é enviado no cookie `refresh_token`, com `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth` e `Secure` em produção. `POST /auth/refresh` e `POST /auth/logout` não recebem body: o navegador ou cookie jar do Postman envia o cookie automaticamente.

No frontend, use `credentials: 'include'` em login, refresh e logout. Mantenha o access token apenas em memória e envie-o no header `Authorization`. Se frontend e API estiverem em sites diferentes, use `SameSite=None; Secure` e proteção CSRF para operações que alteram dados.

## Rate limiting

Todas as rotas são limitadas por IP a `RATE_LIMIT_MAX` requisições a cada `RATE_LIMIT_TTL_MS` milissegundos; o padrão é 100 requisições por minuto. Redis mantém os contadores compartilhados entre instâncias. As rotas públicas de autenticação possuem limites mais restritivos:

- `POST /api/v1/auth/register`: 10 tentativas a cada 15 minutos e, além disso, no máximo 3 contas criadas por hora e 5 por dia, por IP;
- `POST /api/v1/auth/login`: 20 requisições a cada 15 minutos, mais bloqueio gradual após falhas;
- `POST /api/v1/auth/refresh`: 20 requisições por minuto.

Após 5 credenciais inválidas para a combinação e-mail + IP, login aplica espera gradual: 5 minutos, 15 minutos e 1 hora. Um login válido zera o contador. Ao exceder um limite, a API responde `429 Too Many Requests` no formato padrão de erro. Configure `REDIS_URL` para execução local; no Docker ela é definida automaticamente.

## Testes automatizados

Execute a suíte unitária sem depender de PostgreSQL, Redis ou Docker:

```bash
npm test
npm run test:cov
```

A cobertura atual valida regras de Auth, Rate Limit, Users e RBAC: e-mail duplicado, login inválido, bloqueio após cinco falhas, quota de cadastro, role padrão `user` e erros de role inexistente/duplicada. Use `npm run test:watch` durante o desenvolvimento.

## Auditoria

`GET /api/v1/audit-logs` exige `audit:read` e aceita `page`, `limit`, `actorId`, `action`, `resource`, `resourceId`, `status`, `from` e `to`. Datas devem estar em ISO 8601. A resposta inclui `meta.page`, `meta.limit`, `meta.totalItems`, `meta.totalPages`, `meta.hasNextPage` e `meta.hasPreviousPage`. Alterações de RBAC e eventos de autenticação são registrados com contexto da requisição. Confirmação de e-mail, reenvio da confirmação, solicitação e conclusão da redefinição de senha também geram auditoria. Nos eventos administrativos de RBAC, `before` e `after` guardam um snapshot seguro das roles/permissões antes e depois da alteração; senhas, hashes e tokens nunca são registrados.

`GET /api/v1/users` também usa a mesma paginação. Esta é a convenção para endpoints de listagem novos: o controller recebe `@PaginationParams()`, a service retorna `createPaginatedResult(items, page, limit, totalItems)` e o interceptor coloca os dados de paginação em `meta`.

## CI e integração

O workflow `.github/workflows/ci.yml` compila, executa lint e testes unitários em cada push e Pull Request. Depois sobe Docker, aplica migrations, executa seed e roda `npm run test:integration`. O cenário cria uma conta, obtém os tokens de confirmação/reset pela API do Mailpit e valida login, rotação e revogação do refresh cookie, troca de senha, `/users/me`, RBAC, auditoria, logout e rate limit. Localmente, com a API Docker em execução, migrations aplicadas e seed executado, use `docker compose exec -T api npm run test:integration`. A verificação curta anterior continua disponível em `npm run test:integration:smoke`.

Ao copiar somente este template para um repositório novo, mantenha a pasta `.github/` que já está dentro dele. A CI standalone funciona sem os demais diretórios deste monorepo.

## API e testes manuais

Importe `postman/api-postgres.postman_collection.json` no Postman. A coleção salva o access token e `userId` após login/refresh; o cookie jar mantém o refresh token HttpOnly. Depois de Register ou Forgot password, execute a requisição seguinte de captura do Mailpit para preencher `verificationToken` ou `passwordResetToken` automaticamente.

## Docker

Use `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/nest_api?schema=public` no `.env` e execute `docker compose up --build`. Redis e Mailpit também sobem automaticamente. Depois aplique as migrations com `docker compose exec api npx prisma migrate deploy` e execute `docker compose exec api npm run seed`.

Modos disponíveis:

- desenvolvimento: `docker compose up --build -d`;
- desenvolvimento com observabilidade: `docker compose -f docker-compose.yml -f docker-compose.observability.yml up --build -d`;
- produção: `docker compose --env-file .env.production -f docker-compose.production.yml up --build -d`.
