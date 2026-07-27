import { createOpenAI } from "@ai-sdk/openai";

// Initialize the OpenAI-compatible GitHub Models provider dynamically
export function getGithubModels() {
  return createOpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: process.env.GITHUB_TOKEN,
  });
}

export const githubModels = (model: string) => getGithubModels()(model);

// Primary model for zero local RAM overhead and free inference
export const BRAIN_MODEL = "gpt-4o-mini";

