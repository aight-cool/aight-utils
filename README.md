# @aight-cool/aight-utils

Open-source [OpenClaw](https://openclaw.ai) gateway plugin for the [Aight](https://aight.cool) app.

This is the code that runs on **your** gateway when you use Aight.

## Architecture

```
┌─────────────┐         ┌──────────────────────────────────┐
│  Aight App  │◄──WS───►│       Your OpenClaw Gateway       │
│  (iOS/RN)   │         │                                    │
└──────┬──────┘         │  ┌──────────────────────────────┐  │
       │                │  │       @aight-cool/aight-utils plugin     │  │
       │                │  │                                │  │
       │                │  │  ┌─────────┐  ┌────────────┐  │  │
       │                │  │  │ Config  │  │   Items    │  │  │
       │                │  │  │  RPC    │  │   Store    │  │  │
       │                │  │  └─────────┘  └────────────┘  │  │
       │                │  │  ┌─────────┐  ┌────────────┐  │  │
       │                │  │  │  Push   │  │  Health    │  │  │
       │                │  │  │ Manager │  │   RPC     │  │  │
       │                │  │  └────┬────┘  └────────────┘  │  │
       │                │  │  ┌────┴────┐  ┌────────────┐  │  │
       │                │  │  │Reminder │  │  Bootstrap │  │  │
       │                │  │  │ Service │  │   Hook     │  │  │
       │                │  │  └─────────┘  └────────────┘  │  │
       │                │  └──────────────────────────────┘  │
       │                └──────────────────┬─────────────────┘
       │                                   │
       │                                   │ HTTP POST
       │                                   ▼
       │                ┌──────────────────────────────────┐
       │                │    push-relay (CF Worker)         │
       │                │    push.aight.cool │
       │                │    (open source, stateless)       │
       └────────────────┤                                    │
          APNs / FCM    │  ┌────────────┐  ┌─────────────┐  │
              ◄─────────│  │ APNs relay │  │  FCM relay  │  │
                        │  └────────────┘  └─────────────┘  │
                        └──────────────────────────────────┘
```

## What it does

Aight is a mobile app for OpenClaw. This plugin runs on the gateway side and handles:

| Module                 | What                                         | Cost          |
| ---------------------- | -------------------------------------------- | ------------- |
| **Config RPC**         | Instant settings changes                     | Free (no LLM) |
| **Items Store**        | Tasks, reminders, events — proper data store | Free (no LLM) |
| **Push Notifications** | Wake your phone when agents respond          | Free (no LLM) |
| **System Health**      | Memory, CPU, disk stats                      | Free (no LLM) |
| **Reminders Service**  | Background scheduler for triggers            | Free (no LLM) |
| **Agent Bootstrap**    | Injects tool context at agent start          | Free (no LLM) |

## Install

```bash
openclaw plugins install @aight-cool/aight-utils
```

Or from the Aight app: tap **Enable Notifications** during onboarding.

## Configuration

```json5
{
  plugins: {
    entries: {
      "aight-utils": {
        enabled: true,
        config: {
          push: {
            mode: "rich", // "private" (silent) or "rich" (with preview)
            relayUrl: "https://push.aight.cool",
          },
          today: {
            enabled: true,
          },
        },
      },
    },
  },
}
```

## RPC Methods

### Config

Direct gateway RPC — no LLM calls, instant response, zero cost.

| Method               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `aight.config.get`   | Read current plugin config                         |
| `aight.config.patch` | Update plugin config (persists to `openclaw.json`) |
| `aight.status`       | Plugin health check                                |

### Items Store

A proper data store for Today view items. Replaces storing JSON in chat messages.

| Method               | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| `aight.items.list`   | List items (filterable by type, labels, status, date range) |
| `aight.items.upsert` | Create or update an item (deduplicated by ID)               |
| `aight.items.delete` | Soft-delete an item                                         |

**Agent tool:** `aight_item` — only invoked when natural language parsing is needed (e.g., "remind me tomorrow at 3pm"). Direct CRUD from the app uses the RPC methods above.

### Push Notifications

| Method                  | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `aight.push.register`   | Register device token + obtain sendKey                     |
| `aight.push.unregister` | Remove a device token                                      |
| `aight.push.test`       | Send a test push (always rich, regardless of mode setting) |

### System Health

| Method         | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `aight.health` | Memory, CPU, disk stats — runs shell commands directly, no LLM |

## Push Notification Flow

```
Agent completes turn
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌─────────┐     ┌──────────┐
  │ agent_end   │────►│ Push Manager │────►│  Relay  │────►│  APNs /  │
  │   hook      │     │ (plugin)     │     │  (CF)   │     │   FCM    │
  └─────────────┘     └──────────────┘     └─────────┘     └──────────┘
                             │                                    │
                             │ Filters:                           ▼
                             │ • NO_REPLY                   ┌──────────┐
                             │ • REPLY_SKIP                 │  Phone   │
                             │ • ANNOUNCE_SKIP              │  (Aight) │
                             │ • HEARTBEAT_OK               └──────────┘
                             │ • Empty messages
                             │
                        Suppressed (no push sent)
```

### Notification modes

- 🔔 **Rich** (default) — visible push with sender name and message preview

### Foreground suppression

When the app is in the foreground viewing the same agent's chat, push notifications are automatically suppressed — no duplicate alerts.

### Per-device auth (HMAC sendKey)

```
Device registers push token
        │
        ▼
  ┌─────────────┐     ┌──────────────┐
  │   Plugin    │────►│    Relay     │  POST /register
  │  (gateway)  │     │    (CF)      │  { token }
  └─────────────┘     └──────┬───────┘
                             │
                    sendKey = HMAC-SHA256(
                      masterSecret,
                      "v1:" + deviceToken
                    )
                             │
                             ▼
                    Returned to plugin,
                    stored in devices.json
```

No shared secret in plugin code. Each device gets a unique sendKey derived from the relay's master secret. Zero state on the relay — sendKey is re-derivable.

## Item Types

| Type      | Use for                        | Statuses                               |
| --------- | ------------------------------ | -------------------------------------- |
| `trigger` | Reminders, events, deadlines   | active → fired → completed / cancelled |
| `item`    | Tasks, PRs, issues, projects   | active → done / cancelled              |
| `process` | Subagent runs, builds, deploys | active → done / cancelled              |

### Reminders Service

Background service checks for scheduled trigger items every 30 seconds. When a trigger fires:

1. Updates item status to `"fired"`
2. Sends push notification to all registered devices

## Agent Bootstrap

Injects `AIGHT.md` into agent context via the `agent:bootstrap` hook — no workspace file mutations. Automatically removed when the plugin is disabled.

Tells agents about:

- **`aight_item` tool** — how to create reminders, tasks, events
- **Shortcuts** — when the app sends `shortcut: <text>`, reply with `{"short_name": "...", "emoji": "..."}`
- **Security fixes** — when the app sends `Harden your soul`, add security hardening rules to SOUL.md
- **Config patches** — how to apply config changes via gateway tools

All agent instructions are in this open-source plugin. The app sends simple trigger phrases; the bootstrap teaches the agent what to do. Fully auditable.

## Data Storage

| File                             | Contents                                 |
| -------------------------------- | ---------------------------------------- |
| `~/.openclaw/aight/items.json`   | Today view items                         |
| `~/.openclaw/aight/devices.json` | Registered push device tokens + sendKeys |

Directory permissions: `0o700` (owner-only access).

## Why open source?

Aight itself is not open source, but the code that runs on **your gateway** is. You can:

- Read every line that executes on your machine
- See exactly what gets injected into agent prompts
- Audit what data flows through the push relay
- Fork and customize if you want

## Development

```bash
npm install
npx vitest run
```

## Related

- [push-relay](https://github.com/aight-cool/aight-push-relay) — open-source push notification relay (Cloudflare Workers)
- [expo-openclaw-chat](https://github.com/aight-cool/expo-openclaw-chat) — open-source gateway client library
- [OpenClaw](https://openclaw.ai) — the AI gateway platform

## License

MIT
