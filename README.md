# @aight/utils

Open-source [OpenClaw](https://openclaw.ai) gateway plugin for the [Aight](https://aight.app) app.

This is the code that runs on **your** gateway when you use Aight. Every line is auditable.

## What it does

Aight is a mobile app for OpenClaw. This plugin runs on the gateway side and handles:

- **Push notifications** — wake your phone when the agent has something to say
- **Today items** — tasks, reminders, events stored properly (not in chat messages)
- **Config** — instant settings changes without burning LLM tokens
- **Agent context** — tells agents about Aight's tools at bootstrap time

## Install

```bash
openclaw plugins install @aight/utils
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
            mode: "private",          // "private" (silent) or "rich" (with preview)
            relayUrl: "https://push.aight.app",
            relaySecret: "your-shared-secret"
          },
          today: {
            enabled: true
          }
        }
      }
    }
  }
}
```

## Modules

### 1. Config RPC

Direct gateway RPC — no LLM calls, instant response, zero cost.

| Method | Description |
|--------|-------------|
| `aight.config.get` | Read current plugin config |
| `aight.config.patch` | Update plugin config |
| `aight.status` | Plugin health check |

### 2. Items Store

A proper data store for Today view items. Replaces storing JSON in chat messages.

| Method | Description |
|--------|-------------|
| `aight.items.list` | List items (filterable by type, labels, status, date range) |
| `aight.items.upsert` | Create or update an item (deduplicated by ID) |
| `aight.items.delete` | Soft-delete an item |

**Agent tool:** `aight_item` — only invoked when natural language parsing is needed (e.g., "remind me tomorrow at 3pm"). Direct CRUD from the app uses the RPC methods above (free, instant).

#### Item types

| Type | Use for | Statuses |
|------|---------|----------|
| `trigger` | Reminders, events, deadlines | active → fired → completed / cancelled |
| `item` | Tasks, PRs, issues, projects | todo → in-progress → done / blocked |
| `process` | Subagent runs, builds, deploys | pending → running → done / failed |

### 3. Push Notifications

| Method | Description |
|--------|-------------|
| `aight.push.register` | Register a device push token |
| `aight.push.unregister` | Remove a device token |

**Notification modes** (user's choice in Aight settings):

- 🔒 **Private** (default) — silent push, content-free. App wakes and fetches from gateway. The [push relay](https://github.com/aight-app/push-relay) sees nothing but "wake device X."
- 🔔 **Rich** (opt-in) — visible push with message preview. Text passes through the relay in-transit only (HTTPS), never stored.

### 4. Reminders Service

Background service that checks for scheduled trigger items every 30 seconds. When a trigger fires:
1. Updates item status to `"fired"`
2. Sends push notification to all registered devices

### 5. Agent Bootstrap

Injects `AIGHT.md` into agent context via the `agent:bootstrap` hook — no workspace file mutations. Automatically removed when the plugin is disabled.

Tells agents about:
- The `aight_item` tool and how to use it
- Structured item format reference

## Data storage

| File | Contents |
|------|----------|
| `~/.openclaw/aight/items.json` | Today view items |
| `~/.openclaw/aight/devices.json` | Registered push device tokens |

## Why open source?

Aight itself is not open source, but the code that runs on **your gateway** is. You can:

- Read every line that executes on your machine
- See exactly what gets injected into agent prompts
- Audit what data flows through the push relay
- Fork and customize if you want

The closed-source parts of Aight are purely UI — they consume this plugin's RPC API.

## Development

```bash
npm install
npx vitest run     # 34 tests
```

## Related

- [push-relay](https://github.com/aight-app/push-relay) — the open-source push notification relay
- [expo-openclaw-chat](https://github.com/aight-app/expo-openclaw-chat) — the open-source gateway client library
- [OpenClaw Plugin Docs](https://docs.openclaw.ai/tools/plugin)

## License

MIT
