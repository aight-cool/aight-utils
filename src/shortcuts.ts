/**
 * Shortcuts RPC — aight.shortcuts.parse
 *
 * Uses a cheap LLM call to extract a short name and emoji from user text.
 */

import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

const PARSE_PROMPT = `You extract a short name and emoji for a chat shortcut.
Given the user's text, return JSON: {"name": "Short Name", "emoji": "🎯"}
- name: 2-4 words max, title case
- emoji: single relevant emoji
Return ONLY valid JSON, nothing else.`;

export function registerShortcuts(api: OpenClawPluginApi) {
  api.registerGatewayMethod(
    "aight.shortcuts.parse",
    async ({ params, respond }: GatewayRequestHandlerOptions) => {
      const text = typeof params?.text === "string" ? params.text.trim() : "";
      if (!text) {
        respond(false, { error: "text is required" });
        return;
      }

      // Get API key from config
      const apiKey = (api.config as any)?.env?.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        respond(false, { error: "No Anthropic API key configured" });
        return;
      }

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-3-5-20241022",
            max_tokens: 100,
            messages: [{ role: "user", content: `${PARSE_PROMPT}\n\nText: ${text}` }],
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          respond(false, { error: `Anthropic API error ${res.status}: ${body}` });
          return;
        }

        const data = (await res.json()) as {
          content: Array<{ type: string; text: string }>;
        };
        const reply = data.content?.[0]?.text ?? "";
        const parsed = JSON.parse(reply);

        if (!parsed.name || !parsed.emoji) {
          respond(false, { error: "Failed to parse response", raw: reply });
          return;
        }

        respond(true, { name: parsed.name, emoji: parsed.emoji });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        respond(false, { error: msg });
      }
    },
  );
}
