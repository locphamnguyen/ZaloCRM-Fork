# Debugger Report: Anthropic Proxy Auth Failure

**Date:** 2026-03-31
**Status:** Root cause confirmed ✅

---

## Summary

Anthropic calls fail because the backend sends `x-api-key` header, but the proxy `https://aisieure.com` requires `Authorization: Bearer <token>`. This is **the sole root cause**.

---

## Investigation Findings

### 1. How Anthropic calls are made

**Raw HTTP** (no Anthropic SDK).
File: `backend/src/modules/ai/providers/anthropic.ts`

```
Line 6:  fetch(url, { method: 'POST', headers: { ... } })
```

No SDK dependency — pure `fetch()`.

---

### 2. URL construction — CORRECT ✅

`config/index.ts` line 22:
```ts
anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
```

`providers/anthropic.ts` line 2:
```ts
const url = `${baseUrl}/v1/messages`;
```

With `ANTHROPIC_BASE_URL=https://aisieure.com`, the resolved URL is:
`https://aisieure.com/v1/messages` — **correct, no trailing slash issue**.

---

### 3. Auth header — **ROOT CAUSE ❌**

`providers/anthropic.ts` lines 9–11:
```ts
'x-api-key': apiKey,
'anthropic-version': '2023-06-01',
```

The code sends `x-api-key` (official Anthropic SDK format).
**The proxy rejects this with HTTP 401:**

```json
{"type":"error","error":{"type":"authentication_error","message":"Missing or invalid Authorization header"}}
```

**Verified:** `Authorization: Bearer <token>` → HTTP 200 ✅
**Verified:** `x-api-key: <token>` → HTTP 401 ❌

---

### 4. Auth token loading — CORRECT ✅

`config/index.ts` line 23:
```ts
anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '',
```

`provider-registry.ts` line 30:
```ts
authToken: config.anthropicAuthToken,
```

`ai-service.ts` line 39:
```ts
if (providerDef?.authToken) return providerDef.authToken;
```

Token is read correctly from `ANTHROPIC_AUTH_TOKEN` env var and passed through to the provider.

---

### 5. Error handling — ADEQUATE but opaque

`providers/anthropic.ts` lines 22–25:
```ts
if (!response.ok) {
  const status = response.status;
  throw new Error(`Anthropic request failed with status ${status}`);
}
```

Error only captures HTTP status (401), **not the response body**. The proxy's descriptive error message (`"Missing or invalid Authorization header"`) is silently discarded, making it hard to diagnose from logs alone.

`ai-routes.ts` line 33–37: `getStatusFromError` maps the generic `500` to a sanitized client message.

---

### 6. `.env.example` — OUTDATED ⚠️

`backend/.env.example` only documents legacy keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`).
None of the new provider vars (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, model vars) are documented there.
No actual `.env` file found on disk — env vars must be injected at runtime (Docker/system env).

---

## Files & Lines Affected

| File | Lines | Issue |
|------|-------|-------|
| `backend/src/modules/ai/providers/anthropic.ts` | 9–11 | Sends `x-api-key` instead of `Authorization: Bearer` |
| `backend/src/modules/ai/providers/anthropic.ts` | 22–25 | Swallows proxy error body, logs only status code |
| `backend/.env.example` | all | Missing all new ANTHROPIC_* env var docs |

---

## Fix Required

In `providers/anthropic.ts`, change the auth header from:
```ts
'x-api-key': apiKey,
```
to:
```ts
'authorization': `Bearer ${apiKey}`,
```

> Note: The `anthropic-version` header may also be ignorable for this proxy (it returned 200 with `Authorization: Bearer` in testing, including that header didn't cause issues).

---

## Unresolved Questions

- None — root cause fully confirmed via live HTTP probe.
