export type SummaryProviderId =
  | "openai"
  | "anthropic"
  | "google_generative_ai"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "custom";

export type SummaryProviderDefinition = {
  id: SummaryProviderId;
  label: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  modelPlaceholder: string;
  help: string;
};

export const SUMMARY_PROVIDERS: readonly SummaryProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    modelPlaceholder: "gpt-4.1-mini",
    help: "Use the standard OpenAI chat endpoint with your API key and model name.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresApiKey: true,
    modelPlaceholder: "claude-3-5-sonnet-latest",
    help: "Uses Anthropic's Messages API. Add your API key and a Claude model.",
  },
  {
    id: "google_generative_ai",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresApiKey: true,
    modelPlaceholder: "gemini-2.5-flash",
    help: "Uses the Gemini generateContent API from Google AI Studio.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    modelPlaceholder: "openai/gpt-4.1-mini",
    help: "Route summaries through OpenRouter with any supported chat model.",
  },
  {
    id: "ollama",
    label: "Ollama",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    requiresApiKey: false,
    modelPlaceholder: "llama3.2",
    help: "Ensure `ollama serve` is running and that the model is already pulled locally.",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    requiresApiKey: false,
    modelPlaceholder: "local-model-id",
    help: "Point to LM Studio's local server and use a loaded chat-capable model.",
  },
  {
    id: "custom",
    label: "Custom",
    defaultBaseUrl: "",
    requiresApiKey: false,
    modelPlaceholder: "model-name",
    help: "Use any OpenAI-compatible `/chat/completions` endpoint.",
  },
] as const;

export function getSummaryProviderDefinition(providerId: string) {
  return SUMMARY_PROVIDERS.find((provider) => provider.id === providerId) ?? null;
}
