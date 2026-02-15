---
name: aight-bootstrap
description: "Injects AIGHT.md into agent bootstrap context with tool usage instructions"
metadata: { "openclaw": { "emoji": "📱", "events": ["agent:bootstrap"], "requires": {} } }
---

# Aight Bootstrap

Injects `AIGHT.md` into the agent bootstrap context at runtime so agents know
how to use the `aight_item` tool for managing Today view items.

## What It Does

- Listens for `agent:bootstrap` events
- Adds an `AIGHT.md` bootstrap file with tool usage instructions
- No file mutations — content is injected in-memory only

## Requirements

The `@aight/utils` plugin must be enabled.
