import { createOpenAI } from "@ai-sdk/openai";

// Initialize the OpenAI-compatible GitHub Models provider dynamically
export function getGithubModels() {
  if (process.env.OPENAI_API_KEY) {
    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  const baseURL = process.env.GITHUB_MODELS_URL || "https://models.github.ai/inference";
  return createOpenAI({
    baseURL,
    apiKey: process.env.GITHUB_TOKEN,
  });
}

export const githubModels = (model: string) => getGithubModels()(model);

// Primary model for zero local RAM overhead and free inference
export const BRAIN_MODEL = "gpt-4o-mini";

