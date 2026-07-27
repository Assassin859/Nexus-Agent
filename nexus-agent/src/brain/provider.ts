import { createOpenAI } from "@ai-sdk/openai";

// Initialize the OpenAI-compatible GitHub Models provider
export const githubModels = createOpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN!,
});

// Primary model for zero local RAM overhead and free inference
export const BRAIN_MODEL = "meta-llama-3.3-70b-instruct";
