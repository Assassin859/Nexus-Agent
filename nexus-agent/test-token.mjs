import { readFileSync } from "fs";
import { resolve } from "path";

const env = readFileSync(resolve("../.env"), "utf8");
const token = env.match(/GITHUB_TOKEN="([^"]+)"/)?.[1];
console.log("Token length:", token?.length);
console.log("First 25:", token?.slice(0, 25));
console.log("Last 10:", token?.slice(-10));

const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
  body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "say ok" }], max_tokens: 5 })
});
const data = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(data));
