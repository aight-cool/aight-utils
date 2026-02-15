/**
 * Agent Bootstrap — injects AIGHT.md at runtime via agent:bootstrap hook
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AIGHT_MD = `# Aight Integration

You have the \`aight_item\` tool for managing structured items in the Aight Today view.

## When to Use \`aight_item\`

- User asks to **set a reminder**: create a trigger with \`scheduledFor\` (ISO 8601)
- User asks to **create a task**: create an item with labels
- User mentions a **deadline or event**: create a trigger with appropriate type
- User wants to **track a PR/issue**: create an item with a URL
- User says **"done"** or **"cancel"**: update status to "done" or "cancelled"

## Item Types

| Type | Use For | Examples |
|------|---------|---------|
| \`trigger\` | Time-based, fire-once | Reminders, events, deadlines |
| \`item\` | Stateful, lifecycle | Tasks, PRs, issues, projects |
| \`process\` | Background work | Subagent runs, builds, deploys |

## Rules

- Always generate a unique \`id\` (use a short slug like \`remind-groceries-1708012800\`)
- Parse natural language dates to ISO 8601 before calling the tool
- Set \`labels\` for categorization (e.g. \`["work", "urgent"]\`)
- Default status is \`"active"\` — don't set it unless changing state
- For reminders: set \`type: "trigger"\` and include \`scheduledFor\`
- For tasks: set \`type: "item"\`
`;

export function registerBootstrap(api: OpenClawPluginApi) {
  try {
    const { registerPluginHooksFromDir } = require("openclaw/plugin-sdk");
    const pluginDir = path.dirname(fileURLToPath(import.meta.url));
    const hooksDir = path.join(pluginDir, "..", "hooks");
    registerPluginHooksFromDir(api, hooksDir);
  } catch {
    api.logger.debug("[aight-utils] Could not register hooks dir, using inline approach");
  }
}

export function getBootstrapContent(): string {
  return AIGHT_MD;
}
