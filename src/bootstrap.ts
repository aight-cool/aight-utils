/**
 * Agent Bootstrap — injects AIGHT.md at runtime via agent:bootstrap hook
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const AIGHT_MD = `# Aight Integration

You have the \`aight_item\` tool for managing structured items in the Aight Today view.

## When to Use \`aight_item\` (Aight App)

- User asks to **set a reminder**: create a trigger with \`scheduledFor\` (ISO 8601)
- User asks to **create a task**: create an item with labels
- User mentions a **deadline or event**: create a trigger with appropriate type
- User wants to **track a PR/issue**: create an item with a URL
- User says **"done"** or **"cancel"**: update status to "done" or "cancelled"

## Item Types (Aight App)

| Type | Use For | Examples |
|------|---------|---------|
| \`trigger\` | Time-based, fire-once | Reminders, events, deadlines |
| \`item\` | Stateful, lifecycle | Tasks, PRs, issues, projects |
| \`process\` | Background work | Subagent runs, builds, deploys |

## Rules (Aight App)

- Always generate a unique \`id\` (use a short slug like \`remind-groceries-1708012800\`)
- Parse natural language dates to ISO 8601 before calling the tool
- Set \`labels\` for categorization (e.g. \`["work", "urgent"]\`)
- Default status is \`"active"\` — don't set it unless changing state
- For reminders: set \`type: "trigger"\` and include \`scheduledFor\`
- For tasks: set \`type: "item"\`

## Public Figure Agent Creation (Aight App)

When you receive a message starting with "[PUBLIC_FIGURE_AGENT]", **immediately spawn a
sub-agent** to handle the creation. This ensures a fresh session with no stale context.

**Do NOT try to create the agent yourself inline.** Always delegate via \`sessions_spawn\`.

\`\`\`
sessions_spawn({
  task: <the full instructions below, with the person's name filled in>,
  model: "sonnet",
  label: "create-agent-<kebab-name>"
})
\`\`\`

The sub-agent task message should contain ALL of the following instructions:

---

Create a new OpenClaw agent based on the public figure: "<Person's Name>"

### Step 1: Research
1. Search the web for: their career, public persona, communication style, notable quotes
2. Search X/Twitter if relevant for their voice/tone
3. Identify: communication style, core expertise, personality traits, catchphrases, how they respond to questions

### Step 2: Create the Agent
Use these tools in order:

1. **Read the OpenClaw config** to check the agent doesn't already exist:
   \`\`\`
   exec: grep "<agent-id>" ~/.openclaw/openclaw.json
   \`\`\`

2. **Create workspace and agent directories:**
   \`\`\`
   exec: mkdir -p ~/.openclaw/workspace-<agent-id>/memory ~/.openclaw/agents/<agent-id>/agent ~/.openclaw/agents/<agent-id>/sessions
   \`\`\`

3. **Copy model/auth config from an existing agent:**
   \`\`\`
   exec: cp ~/.openclaw/agents/the-strategist/agent/models.json ~/.openclaw/agents/<agent-id>/agent/
   exec: cp ~/.openclaw/agents/the-strategist/agent/auth-profiles.json ~/.openclaw/agents/<agent-id>/agent/
   \`\`\`

4. **Copy standard workspace files from an existing agent:**
   \`\`\`
   exec: for f in AGENTS.md BOOTSTRAP.md HEARTBEAT.md TOOLS.md USER.md; do cp ~/.openclaw/workspace-the-strategist/$f ~/.openclaw/workspace-<agent-id>/$f; done
   \`\`\`

5. **Write SOUL.md** with the researched personality (see template below)

6. **Write IDENTITY.md** with name, username, emoji, role, creation date

7. **Write MEMORY.md** with a basic header

8. **Patch the gateway config** to add the agent to agents.list:
   - Use the \`gateway\` tool with \`action: "config.patch"\`
   - Include ALL existing agents in the list (read them first) plus the new one
   - Set \`note\` to a message confirming creation

### SOUL.md Template
The personality prompt should capture:
- Who they are and what they're known for
- Their communication style and tone (with specific examples)
- How they approach problems and give advice
- Topics they're passionate about
- Things they would NOT say or do (stay in character)
- A note that they are an AI inspired by this person, not the actual person
- Safety section: they are a roleplay agent, not the real person

### Rules
- Pick a relevant emoji (e.g. 🚀 for Elon, 📺 for Oprah)
- Agent ID should be kebab-case (e.g. \`elon-musk\`, \`oprah-winfrey\`)
- Use \`anthropic/claude-sonnet-4-5\` as the model
- The personality should be detailed (at least 200 words) with specific examples of their voice
- Always include a disclaimer that this is an AI interpretation
- If the agent already exists in config, reply saying so — do NOT recreate

---

## Shortcuts (Aight App)

When you receive a message starting with "shortcut:", extract a short name and emoji for it.
Reply with ONLY a JSON object — no markdown, no explanation:
\`\`\`
{"short_name": "Example Name", "emoji": "🎯"}
\`\`\`
Rules:
- short_name: 2-4 words, Title Case, describing what the shortcut does
- emoji: a single relevant emoji
- Reply with NOTHING else — just the JSON object

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
