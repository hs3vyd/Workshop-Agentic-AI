export interface Env {
  APP_KV?: KVNamespace;
  ASSETS?: Fetcher;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_COMPAT_BASE_URL?: string;
  OPENAI_COMPAT_MODEL?: string;
  OPENAI_COMPAT_API_KEY?: string;
  DEFAULT_CHAT_PROVIDER?: string;
}