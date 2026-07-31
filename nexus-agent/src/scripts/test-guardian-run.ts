import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { run } from "../modules/guardian.js";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

async function main() {
  const wallet = "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";
  console.log(`🛡️ Running Guardian position evaluation for: ${wallet}\n`);
  try {
    await run(wallet);
    console.log("\n✅ Guardian execution evaluation finished successfully!");
  } catch (err) {
    console.error("Guardian evaluation error:", err);
  }
}

main();
