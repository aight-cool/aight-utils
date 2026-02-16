/**
 * Shortcuts RPC — aight.shortcuts.parse
 *
 * Uses the cheapest available model to extract a short name and emoji.
 * Reads provider config from the gateway — works with any configured model.
 */

import type { OpenClawPluginApi, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";

const PROMPT = `Extract a short name (2-4 words, title case) and a single relevant emoji for this chat shortcut. Reply with ONLY valid JSON: {"short_name": "...", "emoji": "..."}`;

interface ProviderConfig {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: Array<{ id: string }>;
}

/** Resolve API key for a provider — check provider config, then env */
function resolveApiKey(
  providerId: string,
  provider: ProviderConfig,
  env: Record<string, string>,
): string | undefined {
  if (provider.apiKey) return provider.apiKey;
  // Standard env var names
  const envKeys: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    ollama: "OLLAMA_API_KEY",
  };
  return env[envKeys[providerId] ?? ""] ?? undefined;
}

/** Call Anthropic Messages API */
async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  text: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 100,
      messages: [{ role: "user", content: `${PROMPT}\n\nText: ${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = (await res.json()) as {
    content: Array<{ text: string }>;
  };
  return data.content?.[0]?.text ?? "";
}

/** Call OpenAI-compatible API */
async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  text: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 100,
      messages: [{ role: "user", content: `${PROMPT}\n\nText: ${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI-compat ${res.status}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Pick cheapest model — prefer haiku/mini, fall back to first available */
function pickModel(
  providers: Record<string, ProviderConfig>,
  env: Record<string, string>,
): { providerId: string; provider: ProviderConfig; model: string; apiKey: string } | null {
  // Priority: anthropic haiku > openai mini > any anthropic > any openai-compat > ollama
  const priority = ["anthropic", "openai", ...Object.keys(providers)];
  const cheapModels = ["haiku", "mini", "flash"];

  for (const pid of priority) {
    const p = providers[pid];
    if (!p?.models?.length) continue;
    const apiKey = resolveApiKey(pid, p, env);
    if (!apiKey && pid !== "ollama") continue;

    // Try cheap model first
    const cheap = p.models.find((m) => cheapModels.some((c) => m.id.toLowerCase().includes(c)));
    if (cheap) {
      return { providerId: pid, provider: p, model: cheap.id, apiKey: apiKey ?? "" };
    }
  }

  // Fall back to first provider with a key
  for (const pid of priority) {
    const p = providers[pid];
    if (!p?.models?.length) continue;
    const apiKey = resolveApiKey(pid, p, env);
    if (!apiKey && pid !== "ollama") continue;
    return { providerId: pid, provider: p, model: p.models[0].id, apiKey: apiKey ?? "" };
  }

  return null;
}

export function registerShortcuts(api: OpenClawPluginApi) {
  api.registerGatewayMethod(
    "aight.shortcuts.parse",
    async ({ params, respond }: GatewayRequestHandlerOptions) => {
      const text = typeof params?.text === "string" ? params.text.trim() : "";
      if (!text) {
        respond(false, { error: "text is required" });
        return;
      }

      const providers =
        ((api.config as any)?.models?.providers as Record<string, ProviderConfig>) ?? {};
      const env = ((api.config as any)?.env as Record<string, string>) ?? {};

      const picked = pickModel(providers, env);
      if (!picked) {
        respond(false, { error: "No model provider available" });
        return;
      }

      try {
        const isAnthropic = picked.provider.api === "anthropic-messages";
        const baseUrl = picked.provider.baseUrl ?? "";

        const reply = isAnthropic
          ? await callAnthropic(baseUrl, picked.apiKey, picked.model, text)
          : await callOpenAI(baseUrl, picked.apiKey, picked.model, text);

        // Extract JSON from response
        const match = reply.match(
          /\{[^{}]*"short_name"\s*:\s*"[^"]*"[^{}]*"emoji"\s*:\s*"[^"]*"[^{}]*\}/,
        );
        if (!match) {
          respond(false, { error: "Failed to parse model response", raw: reply });
          return;
        }

        const parsed = JSON.parse(match[0]);
        respond(true, { name: parsed.short_name, emoji: parsed.emoji });
      } catch (err) {
        respond(false, { error: err instanceof Error ? err.message : String(err) });
      }
    },
  );
}
