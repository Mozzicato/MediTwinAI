import "server-only";

// Server-side configuration. None of these values may be exposed through NEXT_PUBLIC_* (PRD 45).

type LlmProvider = "claude" | "groq" | "none";

function llmConfig(): { provider: LlmProvider; model: string; label: string; groqKey: string } {
  const groqKey = process.env.GROQ_API_KEY ?? "";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    return { provider: "claude", model: process.env.MEDITWIN_CLAUDE_MODEL ?? "claude-opus-5", label: "Claude", groqKey };
  }
  if (groqKey) return { provider: "groq", model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b", label: "Groq", groqKey };
  return { provider: "none", model: "", label: "No AI", groqKey };
}

export const config = {
  // DTP_LIVE_PERSONAL is accepted as an alias so an existing .env works unchanged.
  ontomorphApiKey: process.env.ONTOMORPH_API_KEY ?? process.env.DTP_LIVE_PERSONAL ?? "",
  ontomorphSandboxUrl: process.env.ONTOMORPH_SANDBOX_URL ?? "https://sandbox-api.ontomorph.com",
  holonApiKey: process.env.HOLON_API_KEY ?? "",
  holonBaseUrl: process.env.HOLON_BASE_URL ?? "https://holon-api.ontomorph.com",
  llm: llmConfig(),
  requestTimeoutMs: 12_000,
};

export function integrationStatus() {
  return {
    dtp: Boolean(config.ontomorphApiKey),
    holon: Boolean(config.holonApiKey),
    ai: config.llm.provider === "none" ? null : `${config.llm.label} · ${config.llm.model}`,
  };
}
