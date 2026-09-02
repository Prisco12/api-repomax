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
- `GET /users/approvals`, `PUT /users/:id/approval` (`users:approve`)
- `GET /audit-logs` (`audit:read`; aceita `actorEmail` por trecho e `actorId` exato)
- `GET /rbac/roles` (`roles:manage` ou `roles:assign`)
- `GET /rbac/permissions`, `POST /rbac/roles`, `PUT /rbac/roles/:name/permissions` (`roles:manage`)
- `PUT /rbac/users/:userId/roles` (`roles:assign`)
- `GET /admin/categories`, `GET /admin/categories/:id` (`categories:read`)
- `POST /admin/categories` (`categories:create`)
- `PUT /admin/categories/:id`, `PATCH /admin/categories/:id/status` (`categories:update`)
- `DELETE /admin/categories/:id` (`categories:delete`)
- `GET /admin/products`, `GET /admin/products/:id` (`products:read`)
- `POST /admin/products` (`products:create`)
- `PUT /admin/products/:id` (`products:update`)
- `PATCH /admin/products/:id/status` (`products:publish`)
- `DELETE /admin/products/:id` (`products:delete`)
- `POST /admin/products/:productId/images` (`products:update`, `multipart/form-data`, campo `file`)
- `PATCH /admin/products/:productId/images/order` (`products:update`)
- `PATCH /admin/products/:productId/images/:imageId` (`products:update`)
- `DELETE /admin/products/:productId/images/:imageId` (`products:update`)

## Catálogo público

- `GET /categories` retorna a árvore de categorias ativas.
- `GET /categories/:slug` retorna uma categoria ativa pelo slug.
- `GET /products` retorna produtos `PUBLISHED` e aceita `category`, `featured`, `search`, `page` e `limit`.
- `GET /products/:slug` retorna um produto publicado pelo slug.

Produtos são criados como `DRAFT`. A publicação exige ao menos uma categoria ativa e preenche `publishedAt` somente na primeira publicação. `DELETE /admin/products/:id` arquiva o produto, sem remoção física. Categorias em uso são desativadas pelo `DELETE`; categorias sem produtos e sem filhas são removidas. A desativação é bloqueada quando a categoria é a última categoria ativa de um produto publicado.

`Product.sortOrder` controla a ordem geral. O `sortOrder` de cada item de `categories` controla a posição do produto naquela categoria específica. Ao filtrar `GET /products?category=slug`, a API usa a ordem da associação e desempata pelo nome. Valores repetidos são permitidos.

Exemplo de criação de categoria:

```json
{
  "name": "Suspensão",
  "description": "Componentes para suspensão automotiva",
  "sortOrder": 1
}
```

Exemplo de criação de produto:

```json
{
  "name": "Amortecedor dianteiro RepoMax",
  "sku": "AM-001",
  "price": "499.90",
  "showPrice": true,
  "specifications": { "aplicacao": "Dianteira" },
  "categories": [
    { "categoryId": "00000000-0000-0000-0000-000000000000", "sortOrder": 0 }
  ]
}
```

O `PUT /admin/products/:id` aceita `name`, `slug`, `sku`, `shortDescription`, `description`, `price`, `showPrice`, `isFeatured`, `sortOrder`, `specifications` e `categories`. Todos são opcionais; campos omitidos mantêm o valor atual. Quando `categories` é enviado, ele substitui a lista completa de categorias do produto. O status editorial é alterado separadamente pelo `PATCH /admin/products/:id/status`.

Imagens são enviadas em `POST /admin/products/:productId/images`. São aceitas JPEG, PNG e WebP de até 5 MB; o multipart também aceita `altText`. A primeira imagem vira principal automaticamente. `PATCH /admin/products/:productId/images/order` recebe todas as imagens na ordem desejada e salva ordem, imagem principal e textos alternativos em uma única transação. Ao excluir a principal, a próxima imagem é promovida automaticamente. O bucket S3 deve permanecer privado: `GET /product-images/:imageId` libera apenas imagens de produtos publicados e redireciona para uma URL temporária assinada.

Exemplo de ordenação completa:

```json
{
  "images": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "altText": "Amortecedor visto de frente"
    },
    {
      "id": "00000000-0000-0000-0000-000000000002",
      "altText": "Amortecedor visto de lado"
    }
  ]
}
```

Preço é recebido e devolvido como string decimal. `showPrice=true` exige `price`. Slug omitido é gerado a partir do nome; alterar o nome depois não altera automaticamente o slug.

Importe a coleção em `postman/api-postgres.postman_collection.json` para exemplos de payloads.

## Exemplos

`POST /auth/login`:

```json
{ "email": "admin@example.com", "password": "ChangeMe123!" }
```

`POST /auth/refresh` não recebe body; o refresh token é lido do cookie HttpOnly.

No fluxo de conta:

- `register` responde `201`, envia a confirmação e cria a conta como `PENDING`;
- login exige e-mail confirmado e conta `APPROVED`; enquanto aguarda aprovação retorna `ACCOUNT_APPROVAL_PENDING`;
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

`PUT /users/:id/approval`:

```json
{ "status": "APPROVED" }
```

O payload também aceita `REJECTED`. A decisão incrementa a versão de autorização, revoga sessões do usuário e gera `USER_APPROVAL_UPDATED` na auditoria.

`GET /users/approvals` aceita `status=PENDING`, `APPROVED` ou `REJECTED`; sem o parâmetro, lista todos. Uma conta rejeitada pode ser reconsiderada enviando `APPROVED`, e uma aprovação pode ser revogada enviando `REJECTED`.

Contas com o papel `admin` nunca participam do fluxo de aprovação. Em `GET /users`, elas são omitidas para operadores comuns e visíveis, com seus papéis, somente para outro administrador.

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

`cadastro pendente → confirmação de e-mail → aprovação por users:approve → login → refresh rotacionado`.

`roles:assign → lista papéis atribuíveis e altera papéis de usuários`.

`roles:manage → cria papéis e configura suas permissões`.

`GET /rbac/roles → com roles:manage retorna também permissions; somente com roles:assign retorna nome e descrição`.

`roles:assign/roles:manage sem papel admin → papel admin omitido da listagem e atribuição/remoção bloqueada`.

`último administrador → remoção do papel admin bloqueada para impedir que o sistema fique sem administração`.
