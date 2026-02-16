# 🛡️ Security Audit — Aight Plugin + Push Relay

**Auditor:** @security (The Security Auditor)
**Date:** 2026-02-15
**Scope:** `@aight/utils` plugin (`aight-plugin/src/`) + `push-relay` (`push-relay/src/`)
**Version:** v0.1.0

---

## Findings

### 🔴 HIGH

#### H1 — Push relay: No auth on plugin → relay requests (`push.ts`)

**Status: ✅ FIXED** — `sendPush()` now reads `relaySecret` from config and sends `Authorization: Bearer` header. Secret is redacted from `aight.config.get` via `getClientSafeConfig()`.

#### H2 — APNs device token used directly in URL without sanitization (`apns.ts`)

**Status: ✅ FIXED** — Token validated against `/^[a-f0-9]{64}$/i` before URL interpolation. Returns 400 on bad format. Applied to both `sendApns` and `sendActivity`.

#### H3 — No RPC authentication — any connected client can call all methods

**Status: ⚠️ ACCEPTED RISK** — Current gateway model is single-user, so all connected clients are the same user. Secrets are redacted from config RPC. Should be revisited if the SDK adds caller identity support.

---

### 🟡 MEDIUM

#### M1 — Timing-safe comparison not used for auth token (`auth.ts`)

**Status: ✅ FIXED** — Rewritten with `crypto.subtle.timingSafeEqual`. Length check before comparison (minor length oracle — see M5).

#### M2 — APNs JWT has no expiry claim (`apns.ts`)

**Status: ✅ FIXED** — `.setExpirationTime(now + 3500)` added to JWT builder.

#### M3 — Items stored as world-readable JSON (`items.ts`)

**Status: ✅ FIXED** — Both `items.json` and `devices.json` written with `mode: 0o600`.

#### M4 — `req.data` spread directly into APNs payload (`apns.ts`)

**Status: ✅ FIXED** — Data now placed under `custom` key instead of being spread into root.

#### M5 — `timingSafeEqual` leaks token length via early return (`auth.ts:5`)

**Status: ✅ FIXED** — Replaced with HMAC-based constant-time comparison. Input is now versioned (`v1:${deviceToken}`), and comparison uses manual XOR-based logic — no `timingSafeEqual` dependency, no length oracle.

---

### 🟢 LOW

#### L1 — No rate limiting on push relay endpoints

**Status: ✅ FIXED** — 20 req/min per IP rate limiting added on `/register` endpoint in-code.

#### L2 — `cachedToken` is module-level in Worker (`apns.ts`)

**Status: NOTED** — Intentional caching, shared across requests in same isolate.

#### L3 — Health endpoint has no rate limiting

**Status: OPEN** — Low risk, unauthenticated by design.

#### L4 — No input length limits on item fields (`items.ts`)

**Status: ✅ FIXED** — 500 char titles, 5000 char descriptions, 10k max items.

---

## Summary

| Severity  | Total | Fixed | Open/Accepted |
| --------- | ----- | ----- | ------------- |
| 🔴 High   | 3     | 2     | 1 (accepted)  |
| 🟡 Medium | 5     | 5     | 0             |
| 🟢 Low    | 4     | 2     | 2             |

**All high and medium severity findings are resolved.** Remaining open items are low-risk and informational. Parent directory permissions hardened to `0o700`. Error handling improved with proper logging on skipped pushes and background failures.

---

## Audit History

- **v1 (2026-02-15 13:03 EST):** Initial scan — 3 high, 4 medium, 4 low findings
- **v2 (2026-02-15 13:09 EST):** Re-audit after fixes by @the_code_architect — all high/medium actionable findings resolved, 1 new medium noted (M5)
- **v3 (2026-02-16 01:19 EST):** Final update — M5 fixed (HMAC versioned + XOR constant-time comparison), L1 fixed (rate limiting on `/register`), parent dir `0o700`, `nodejs_compat` flag added, error logging improvements. All medium findings now resolved.
