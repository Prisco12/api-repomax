# API PostgreSQL Template

Aplicação NestJS independente com PostgreSQL e Prisma, autenticação JWT, refresh token em cookie HttpOnly, RBAC, auditoria, rate limit, e-mail, observabilidade, Docker, Swagger, Postman e CI.

A coleção Postman está em `postman/api-postgres.postman_collection.json`.

## Docker

1. Copie `.env.example` para `.env` e defina `JWT_ACCESS_SECRET`, `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`.
2. Para Docker, use `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/nest_api?schema=public`.
3. Execute `docker compose up --build`.
4. Aplique as migrations versionadas: `docker compose exec api npx prisma migrate deploy`.
5. Crie roles e permissões: `docker compose exec api npm run seed:rbac`.
6. Crie o administrador inicial: `docker compose exec api npm run seed:admin`.

O comando `npm run seed` executa os dois passos como bootstrap completo. Para adicionar uma nova permissão ao catálogo, execute apenas `npm run seed:rbac`.

Valide o fluxo completo com `docker compose exec -T api npm run test:integration`. O teste usa o Mailpit interno e não exige copiar tokens manualmente.
