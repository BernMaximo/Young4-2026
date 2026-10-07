# API Young4-2026

## Autenticação

Defina as seguintes variáveis ​​de ambiente antes de iniciar o servidor:

- `JWT_SECRET`: segredo com pelo menos 32 bytes, usado para assinar JWTs.
- `ADMIN_CPF`: CPF do administrador (11 dígitos).
- `ADMIN_PASSWORD`: senha do administrador.

A autenticação de clientes permanece disponível em `POST /api/login`. A autenticação de administrador é realizada em `POST /api/admin/login`. Ambos retornam um `token` (token de acesso, válido por uma hora) e um `refreshToken` (válido por sete dias).

Utilize `POST /api/refresh-token` com `{ "refreshToken": "..." }` para obter um novo par de tokens. Os *refresh tokens* são JWTs assinados e não são armazenados; portanto, não podem ser revogados antes da expiração, e *refresh tokens* emitidos anteriormente permanecem válidos até esse momento.

Todas as operações de gerenciamento de clientes (`POST` e `GET /api/clientes`, bem como `GET`, `PATCH` e `DELETE /api/clientes/:id`) exigem um token de acesso de administrador no cabeçalho `Authorization: Bearer <token>`. Tokens de clientes não podem realizar essas operações. As rotas de transação permanecem restritas a clientes autenticados.