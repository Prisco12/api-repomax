# Referência da API

Prefixo: `/api/v1`. Respostas de sucesso usam `success`, `data` e `meta`.

## Públicos

- `GET /health`
- `GET /health/ready`
- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/login`
- `POST /auth/refresh`

## Autenticados

- `POST /auth/logout`
- `GET /users/me`

## Administrativos

- `GET /users` (`users:read`)
- `GET /audit-logs` (`audit:read`)
- `GET /rbac/permissions`, `GET /rbac/roles`, `POST /rbac/roles`, `PUT /rbac/roles/:name/permissions`, `PUT /rbac/users/:userId/roles` (`roles:manage`)

Importe a coleção em `postman/api-postgres.postman_collection.json` para exemplos de payloads.

## Exemplos

`POST /auth/login`:

```json
{ "email": "admin@example.com", "password": "ChangeMe123!" }
```

`POST /auth/refresh` não recebe body; o refresh token é lido do cookie HttpOnly.

No fluxo de conta:

- `register` responde `201` e envia a confirmação; login antes da confirmação responde `403`;
- `verify-email` responde `204`; reutilizar o mesmo token responde `400`;
- `forgot-password` sempre responde `204`, inclusive para e-mail inexistente;
- `reset-password` responde `204`, consome o token e revoga todas as sessões anteriores;
- cada `refresh` bem-sucedido rotaciona o cookie; reutilizar o cookie anterior responde `401`;
- `logout` responde `204`, remove o cookie no cliente e revoga a sessão no servidor.

No Postman, as requisições `Capture ... token from Mailpit` consultam `{{mailpitUrl}}` e preenchem as variáveis de token automaticamente.

`PUT /rbac/roles/manager/permissions`:

```json
{ "permissions": ["users:read"] }
```

Erros seguem `{ "success": false, "error": { "code", "message" }, "meta": { "requestId", "timestamp", "path" } }`. Os principais códigos são `VALIDATION_ERROR`/`BAD_REQUEST` (payload inválido), `UNAUTHORIZED` (token ausente, expirado ou desatualizado), `FORBIDDEN` (permissão ausente), `NOT_FOUND` e `CONFLICT`.

### Validação de senha

Cadastro e redefinição usam a mesma política centralizada: de 12 a 128 caracteres, pelo menos uma letra minúscula, uma maiúscula, um número e um caractere especial. Para `"123123"`, a resposta informa exatamente o que falta:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "password",
        "code": "PASSWORD_TOO_WEAK",
        "message": "Password must contain at least 12 characters, one lowercase letter, one uppercase letter, one special character."
      }
    ]
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-08-26T17:09:19.447Z",
    "path": "/api/v1/auth/register"
  }
}
```

O frontend deve usar `field` para destacar o input, `code` para tradução/regra de negócio e `message` como fallback legível.

## Fluxos

`login → access JWT + refresh token → rota protegida → guard valida assinatura e authorizationVersion`.

`alteração de role/permissão → authorizationVersion incrementada → JWT anterior retorna 401 → refresh/login emite JWT novo`.

`ação RBAC → AuditLog com executor, recurso e resultado`.

`cadastro → e-mail no Mailpit → confirmação → login → refresh rotacionado → recuperação de senha → sessões anteriores revogadas`.
