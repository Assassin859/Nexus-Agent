import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const OPENROUTER_MODEL = process.env.BRAIN_MODEL ?? "openai/gpt-oss-20b:free";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const OPENAI_COMPAT_MODEL = process.env.OPENAI_BRAIN_MODEL ?? "gpt-4o-mini";

export function getActiveBrainProvider(): { provider: string; model: string } {
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: "openrouter", model: OPENROUTER_MODEL };
  }
  if (process.env.GEMINI_API_KEY) {
    return { provider: "gemini", model: GEMINI_MODEL };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: OPENAI_COMPAT_MODEL };
  }
  if (process.env.GITHUB_TOKEN) {
    return { provider: "github-models", model: OPENAI_COMPAT_MODEL };
  }
  return { provider: "none", model: "none" };
}

export function getBrainModel(): any {
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": "NexusAgent",
      },
    });
    return openrouter(OPENROUTER_MODEL);
  }

  if (process.env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    return google(GEMINI_MODEL);
  }

  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    return openai(OPENAI_COMPAT_MODEL);
  }

  if (process.env.GITHUB_TOKEN) {
    const baseURL = process.env.GITHUB_MODELS_URL ?? "https://models.github.ai/inference";
    const github = createOpenAI({
      baseURL,
      apiKey: process.env.GITHUB_TOKEN,
    });
    return github(OPENAI_COMPAT_MODEL);
  }

  throw new Error("No AI provider configured: set OPENROUTER_API_KEY (preferred), GEMINI_API_KEY, or GITHUB_TOKEN/OPENAI_API_KEY");
}

export const githubModels = (model?: string) => getBrainModel();
export const BRAIN_MODEL = OPENROUTER_MODEL;
