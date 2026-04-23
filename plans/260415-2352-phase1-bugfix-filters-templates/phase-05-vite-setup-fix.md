# Phase 05 — Vite Setup Fix (Blocker)

**Priority:** Blocker
**Status:** Pending
**Depends on:** Nothing — do this first

---

## Overview

`bin/dev-setup` fails because `vite-plugin-pwa@1.2.0` doesn't support `vite@^8.0.1`. Peer dependency conflict blocks `npm install` in frontend.

## Error

```
npm error While resolving: vite-plugin-pwa@1.2.0
npm error Found: vite@8.0.2
npm error Could not resolve dependency:
npm error peer vite@"^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0" from vite-plugin-pwa@1.2.0
```

## Root Cause

`vite-plugin-pwa@1.2.0` (latest) only supports vite up to v7. Project uses `vite@^8.0.1`.

## Fix Options

**Option A:** Move `vite-plugin-pwa` to dependencies with `--legacy-peer-deps` in setup script.
**Option B:** Update `vite-plugin-pwa` if a vite 8 compatible version exists.
**Option C (recommended):** Remove `vite-plugin-pwa` from dependencies (it's in `dependencies` not `devDependencies` — likely misplaced), or pin to a compat version.

Since `vite-plugin-pwa@1.2.0` is the latest and doesn't support vite 8, and no newer version exists, the cleanest fix is to add `--legacy-peer-deps` to the frontend npm install in `bin/dev-setup`.

## Implementation

### Step 1: Fix dev-setup script

```bash
# In bin/dev-setup, change:
(cd "$REPO_ROOT/frontend" && npm install)
# To:
(cd "$REPO_ROOT/frontend" && npm install --legacy-peer-deps)
```

### Step 2: Also move vite-plugin-pwa to devDependencies

It's a build-time plugin, not a runtime dependency:

```json
// frontend/package.json — move from dependencies to devDependencies:
"devDependencies": {
  "vite-plugin-pwa": "^1.2.0",
  // ... existing devDeps
}
```

## Related Code Files

- `bin/dev-setup` — line 40
- `frontend/package.json` — line 17

## Todo List

- [ ] Add `--legacy-peer-deps` to frontend npm install in bin/dev-setup
- [ ] Move `vite-plugin-pwa` from dependencies to devDependencies
- [ ] Test: `bin/dev-setup` completes with exit code 0
- [ ] Test: `cd frontend && npm run build` succeeds
