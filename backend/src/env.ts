export interface Env {
  SESSIONS: DurableObjectNamespace;
  QUOTAS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  GITHUB_TOKEN?: string;
  DAILY_SESSIONS?: string;
  DAILY_AI_REQUESTS?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAME?: string;
}
