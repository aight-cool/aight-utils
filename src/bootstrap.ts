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

## Security Fix Commands

When the Aight app requests a security fix, it will send a specific fix prompt.
Apply fixes exactly as described — these are deterministic operations.

### Config-based fixes
For prompts containing "config.patch", use the gateway tool to apply the patch.
Common fixes:
- **DM policy**: \`{"channels": {"<name>": {"dmPolicy": "pairing"}}}\`
- **Group policy**: \`{"channels": {"<name>": {"groupPolicy": "allowlist"}}}\`
- **Blocked commands**: \`{"blocked_commands": ["rm -rf", "curl | sh", "wget | sh", "git push --force", ...]}\`
- **Log redaction**: \`{"logging": {"redactSensitive": "tools"}}\`

### File-based fixes
For SOUL.md hardening: read existing SOUL.md, append the security section at the end
(or replace existing "## Security Hardening" section), write the file back.
`;

export function registerBootstrap(api: OpenClawPluginApi) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require("openclaw/plugin-sdk");
    if (sdk?.registerPluginHooksFromDir) {
      const pluginDir = path.dirname(fileURLToPath(import.meta.url));
      const hooksDir = path.join(pluginDir, "..", "hooks");
      sdk.registerPluginHooksFromDir(api, hooksDir);
    }
  } catch {
    api.logger.info("[aight-utils] Could not register hooks dir, using inline approach");
  }
}

export function getBootstrapContent(): string {
  return AIGHT_MD;
}
