import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolves to repo root .env file: nexus-agent/src/lib/env.ts -> ../../../.env
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath, override: true });
