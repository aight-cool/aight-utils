# AGENTS.md — Aight Utils Plugin

## What This Is

The `aight-utils` plugin extends the OpenClaw gateway with Aight-specific functionality. It runs as a gateway plugin (not in the iOS app).

## Key Files

| File | Purpose |
|------|---------|
| `src/bootstrap.ts` | Injects `AIGHT.md` into every agent session via `before_agent_start` hook |
| `src/config.ts` | RPC methods for reading/patching gateway config (`aight.config.get`, `aight.config.patch`) |
| `src/items.ts` | RPC methods for Aight Today view items (`aight.items.*`) |
| `src/push.ts` | Push notification support (`aight.push.*`) |
| `src/push-hook.ts` | Hook that sends push notifications on agent replies |
| `src/groups.ts` | Group chat related utilities |
| `src/health.ts` | Health check endpoint |
| `src/version.ts` | Version reporting |
| `src/reminders.ts` | Reminder/trigger support |
| `src/defaults.ts` | Default configuration values |

## AIGHT.md (Bootstrap)

The `AIGHT_MD` string in `bootstrap.ts` is injected into every agent's system prompt. It documents:

- What agents can do via Aight
- Audio/voice behavior (app handles TTS, agents send plain text)
- `aight_item` tool usage (reminders, tasks, processes)
- Group chat message format and the **stubbed own-messages** optimization
- BUGS group chat task protocol (claim → report → close)
- Public figure agent creation flow
- Watchdog/follow-up protocol
- Shortcuts format

**When updating agent-facing documentation about Aight behavior, update the `AIGHT_MD` string in `bootstrap.ts`.** This is the single source of truth for what agents know about Aight.

## Relationship to Aight App

- **Aight app** (`/Users/admin/clawd/apps/aight`): React Native iOS client. Handles UI, group chat orchestration, context building, streaming.
- **This plugin** (`/Users/admin/clawd/apps/aight-plugin`): Gateway plugin. Handles agent bootstrapping, RPC methods, push notifications.

The app and plugin communicate through the OpenClaw gateway — the app sends messages via WebSocket, the gateway routes to agents, and the plugin hooks into the lifecycle.

## Build & Deploy

```bash
npm run build      # Compile TypeScript
npx tsc --noEmit   # Type check only
```

After changes, rebuild and restart the gateway for the plugin to reload.
