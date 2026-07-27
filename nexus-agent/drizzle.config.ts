import type { Config } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString!,
  },
} satisfies Config;
