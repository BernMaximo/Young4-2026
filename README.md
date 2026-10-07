# Young4-2026 API

## Authentication

Set these environment variables before starting the server:

- `JWT_SECRET`: secret with at least 32 bytes, used to sign JWTs.
- `ADMIN_CPF`: administrator CPF (11 digits).
- `ADMIN_PASSWORD`: administrator password.

Customer authentication remains available at `POST /api/login`. Administrator authentication is at `POST /api/admin/login`. Both return `token` (access token, valid for one hour) and `refreshToken` (valid for seven days).

Use `POST /api/refresh-token` with `{ "refreshToken": "..." }` to receive a new token pair. Refresh tokens are signed JWTs and are not stored, so they cannot be revoked before expiration; previously issued refresh tokens remain valid until then.

All client management operations (`POST` and `GET /api/clientes`, and `GET`, `PATCH`, and `DELETE /api/clientes/:id`) require an administrator access token in the `Authorization: Bearer <token>` header. Customer tokens cannot perform these operations. Transaction routes remain restricted to authenticated customers.
