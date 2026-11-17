import "server-only";

/**
 * Minimal LLM helper. Uses Anthropic's Messages API when ANTHROPIC_API_KEY is set;
 * otherwise returns null so callers drop to the heuristic path. Never throws.
 */
export function llmEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function llmJson<T>(system: string, user: string, maxTokens = 400): Promise<T | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "claude-haiku-5-5",
        max_tokens: maxTokens,
        system: `${system}\nRespond with a single JSON object and nothing else.`,
        messages: [{ role: "user", content: user }],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[llm] ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as T) : null;
  } catch (err) {
    console.warn("[llm] failed, using heuristic fallback:", (err as Error).message);
    return null;
  }
}
