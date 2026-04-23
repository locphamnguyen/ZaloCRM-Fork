# Phase 04 — Public REST API + API Key Auth

**Status:** pending | **Priority:** P1 | **Effort:** 6h | **Blocks:** 01, 03

## Context
Expose contacts + custom attrs to external systems (n8n, Zapier, Make, custom webhooks). Separate auth (API key, not user JWT). OpenAPI spec for self-service onboarding.

## Files to Create
- `backend/src/modules/public-api/api-key-service.ts` — generate/hash/verify/list/revoke
- `backend/src/modules/public-api/api-key-routes.ts` — admin endpoints to manage keys (JWT auth)
- `backend/src/modules/public-api/api-key-middleware.ts` — Fastify preHandler validating `X-API-Key`
- `backend/src/modules/public-api/v1-routes.ts` — public endpoints under `/api/v1/*`
- `backend/src/modules/public-api/rate-limiter.ts` — per-key + per-org limits
- `backend/src/modules/public-api/openapi-spec.ts` — generated spec object

## Auth Design
- Generate: random 32 bytes → base64url → `zcrm_<base64>`
- Store: `keyPrefix` = first 8 chars (display), `keyHash` = sha256(full key)
- Verify: hash incoming → lookup by hash → check revoked/expired
- Header: `X-API-Key: zcrm_xxx`
- Returned ONCE on creation; never retrievable again

## Admin Endpoints (JWT)
| Method | Path |
|--------|------|
| GET | `/api/api-keys` — list (no secrets) |
| POST | `/api/api-keys` — create, returns full key once |
| DELETE | `/api/api-keys/:id` — revoke |

## Public Endpoints (X-API-Key) under `/api/v1`

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| GET | `/api/v1/contacts` | read | filters: `?phone=&tag=&status=&page=&limit=` (max 100) |
| GET | `/api/v1/contacts/:id` | read | includes system + zalo + custom attrs |
| POST | `/api/v1/contacts` | write | create; validates custom attrs |
| PATCH | `/api/v1/contacts/:id` | write | update incl. custom_attrs |
| GET | `/api/v1/custom-attrs` | read | list definitions (schema discovery) |
| POST | `/api/v1/contacts/:id/messages` | write | send block or raw text to contact's primary conversation |
| GET | `/api/v1/docs` | none | OpenAPI JSON |
| GET | `/api/v1/docs/ui` | none | Swagger UI |

Response envelope: `{data: ..., pagination?: {page, limit, total}}`. Errors: `{error: {code, message, details?}}`.

## Rate Limiting
- Bucket: per-minute (truncate `now` to minute, upsert `ApiKeyUsage`)
- Per-key: 600/min (10 RPS sustained)
- Per-org (sum across keys): 6000/min
- 429 with `Retry-After` header
- Plug-in approach: Fastify `preHandler` after auth middleware

## Implementation Steps
1. Implement `api-key-service.ts` with generate/hash/verify
2. Implement admin routes (list/create/revoke) under JWT
3. Implement `api-key-middleware.ts`:
   - Read `X-API-Key`, hash, lookup ApiKey row
   - Reject if missing/revoked/expired
   - Set `req.publicApiContext = {orgId, scopes, apiKeyId}`
   - Update `lastUsedAt` async (don't block)
4. Implement rate-limit middleware (preHandler chain after auth)
5. Build v1 routes; reuse contact-service + attr-resolver from P03
6. Generate OpenAPI spec from route schemas (use `@fastify/swagger` already in deps if present, else inline)
7. Mount Swagger UI at `/api/v1/docs/ui`
8. Tests:
   - Unit: key gen + hash + verify roundtrip
   - Integration: full request with valid/invalid/revoked key; rate-limit triggers; cross-org access denied (orgA key can't read orgB contacts)
   - Integration: custom-attr write via PATCH validates
9. Add env flag `PUBLIC_API_ENABLED`

## Security
- Key hashed with sha256 (no salt needed — keys are high-entropy random; salt adds little)
- Rate limit prevents brute force (impossible anyway with 256-bit entropy)
- HTTPS-only (assumed at infra layer; document)
- CORS: disabled by default for `/api/v1` (server-to-server use case); allow per-key whitelist later
- Audit log: every write op logs to `ActivityLog` with `apiKeyId` source
- Scope check: `read` cannot write; missing scope → 403

## Success Criteria
- [ ] curl with valid key → 200 contacts list
- [ ] curl with missing/wrong key → 401
- [ ] curl with revoked key → 401
- [ ] Rate limit triggers 429 after threshold
- [ ] Cross-org isolation: orgA key returns ONLY orgA data (test with seeded orgs)
- [ ] OpenAPI accessible; n8n imports it successfully (manual smoke test)
- [ ] Custom-attr write enforces validation
- [ ] Audit log records writes with key id

## Risks
- Plain `crypto.timingSafeEqual` not needed (we lookup by hash, not compare per-key) — but verify no early-exit timing leak in lookup
- `ApiKeyUsage` table grows unbounded — schedule daily cleanup job (delete >7 days old)
- Swagger UI may expose internal route schemas — only expose v1 routes, not internal `/api/*`

## Rollback
- Disable env flag → 404 on all `/api/v1/*`
- Revoke all keys via SQL `UPDATE api_keys SET revoked_at = now()`
- Drop module dir; ApiKey rows persist (harmless if unused)
