/**
 * Shortcuts RPC — aight.shortcuts.parse
 *
 * Uses the cheapest available model to extract a short name and emoji.
 * Reads provider config from the gateway — works with any configured provider.
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
  const data = (await res.json()) as { content: Array<{ text: string }> };
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

/** Well-known cheap models per provider — used even if not in user's model list */
const CHEAP_DEFAULTS: Record<string, string> = {
  anthropic: "claude-haiku-3-5-20241022",
  openai: "gpt-4o-mini",
};

/** Pick cheapest model for a simple extraction task */
function pickModel(
  providers: Record<string, ProviderConfig>,
  env: Record<string, string>,
): {
  providerId: string;
  provider: ProviderConfig;
  model: string;
  apiKey: string;
} | null {
  const priority = ["anthropic", "openai", ...Object.keys(providers)];
  const cheapPatterns = ["haiku", "mini", "flash", "nano"];

  // First: use known cheap defaults for available providers (even if not in model list)
  for (const pid of priority) {
    const p = providers[pid];
    if (!p) continue;
    const apiKey = resolveApiKey(pid, p, env);
    if (!apiKey && pid !== "ollama") continue;
    if (CHEAP_DEFAULTS[pid]) {
      return {
        providerId: pid,
        provider: p,
        model: CHEAP_DEFAULTS[pid],
        apiKey: apiKey ?? "",
      };
    }
  }

  // Second: find any cheap model in configured models
  for (const pid of priority) {
    const p = providers[pid];
    if (!p?.models?.length) continue;
    const apiKey = resolveApiKey(pid, p, env);
    if (!apiKey && pid !== "ollama") continue;
    const cheap = p.models.find((m) => cheapPatterns.some((c) => m.id.toLowerCase().includes(c)));
    if (cheap) {
      return { providerId: pid, provider: p, model: cheap.id, apiKey: apiKey ?? "" };
    }
  }

  // Last resort: first provider with any model
  for (const pid of priority) {
    const p = providers[pid];
    if (!p?.models?.length) continue;
    const apiKey = resolveApiKey(pid, p, env);
    if (!apiKey && pid !== "ollama") continue;
    return {
      providerId: pid,
      provider: p,
      model: p.models[0].id,
      apiKey: apiKey ?? "",
    };
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

      api.logger.info(`[aight-utils] shortcuts.parse using ${picked.providerId}/${picked.model}`);

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
        respond(false, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
