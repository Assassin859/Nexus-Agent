import "../lib/env.js";
import { registerDcaWorkflow } from "../modules/dca-schedule.js";
import { generateAuthToken } from "../middleware/auth.js";

const wallet = "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";

console.log("DCA re-register:", await registerDcaWorkflow({
  userWallet: wallet,
  amount: 10,
  cronSchedule: "0 9 * * 5",
  message: "every Friday",
}));

const token = generateAuthToken(wallet);
await fetch("http://localhost:3001/api/trigger/guardian", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
console.log("Guardian triggered");
