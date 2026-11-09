export interface AICredentials {
  provider: "gemini" | "openai";
  model: string;
  apiKey: string;
}
