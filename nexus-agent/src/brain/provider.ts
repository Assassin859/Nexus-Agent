import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const GEMINI_MODEL = process.env.BRAIN_MODEL ?? "gemini-flash-latest";
const OPENAI_COMPAT_MODEL = process.env.OPENAI_BRAIN_MODEL ?? "gpt-4o-mini";

export function getActiveBrainProvider(): { provider: string; model: string } {
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

  throw new Error("No AI provider configured: set GEMINI_API_KEY (preferred) or GITHUB_TOKEN/OPENAI_API_KEY");
}

// Deprecated wrapper for backwards compatibility during migration
export const githubModels = (model?: string) => getBrainModel();
export const BRAIN_MODEL = GEMINI_MODEL;
