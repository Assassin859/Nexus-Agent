const AGENT_URL = "http://localhost:3001";

// 3 test wallet addresses representing different user MetaMask accounts
const WALLETS = [
  "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b", // Lowercase Default Demo Wallet
  "0x89F97Cb35236a1D0190FB25B31C5C0fF4107Ec1b", // Checksum / Mixed-case version of same wallet
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", // User Wallet 2
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", // User Wallet 3
];

async function runDiagnosticTest() {
  console.log("==================================================================");
  console.log("🔍 NEXUS-AGENT DIAGNOSTIC TEST: MULTI-WALLET PAYEES & KEY LOOKUP");
  console.log("==================================================================\n");

  // TEST 1: Check Case Sensitivity on GET /api/payees/:walletAddress
  console.log("--- TEST 1: Case-Sensitivity & Normalization on Payees Read ---");
  for (const wallet of WALLETS.slice(0, 2)) {
    const res = await fetch(`${AGENT_URL}/api/payees/${wallet}`);
    const data = await res.json();
    console.log(`GET /api/payees/${wallet.slice(0, 10)}... -> Status: ${res.status}, Count: ${Array.isArray(data) ? data.length : "ERROR"}`);
  }

  // TEST 2: Creation under Wallet 2 & Wallet 3
  console.log("\n--- TEST 2: Payee Creation for Wallet 2 & Wallet 3 ---");
  for (let i = 2; i < WALLETS.length; i++) {
    const w = WALLETS[i];
    const payeeName = `Team-W${i}`;
    console.log(`Creating team "${payeeName}" for wallet ${w.slice(0, 10)}...`);

    const createRes = await fetch(`${AGENT_URL}/api/payees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userWallet: w,
        name: payeeName,
        type: "team",
        payoutMode: "vault_pool",
        vaultPoolAddress: "0x1111222233334444555566667777888899990000",
        members: [
          { name: `Member-A-${i}`, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
          { name: `Member-B-${i}`, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        ],
      }),
    });
    const createData = await createRes.json();
    console.log(`  Create Response:`, createData.success ? "SUCCESS" : JSON.stringify(createData));
  }

  // TEST 3: Verify Wallet Isolation (Wallet 2 should NOT see Wallet 3 payees)
  console.log("\n--- TEST 3: Wallet Isolation Verification ---");
  for (let i = 2; i < WALLETS.length; i++) {
    const w = WALLETS[i];
    const res = await fetch(`${AGENT_URL}/api/payees/${w}`);
    const list = await res.json();
    console.log(`Wallet ${w.slice(0, 10)}... payees:`);
    if (Array.isArray(list)) {
      list.forEach((p) => console.log(`  - [${p.type.toUpperCase()}] ${p.name} (mode: ${p.payoutMode})`));
    } else {
      console.log("  ERROR:", list);
    }
  }

  // TEST 4: Chat Payroll Command Dispatch Test Across Wallets
  console.log("\n--- TEST 4: AI Chat Resolution for Wallet 2 ---");
  const chatRes = await fetch(`${AGENT_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userMessage: "pay Team-W2 15 USDC",
      conversationHistory: [],
      walletAddress: WALLETS[2],
    }),
  });
  const chatData = await chatRes.json();
  console.log(`Chat Response for Wallet 2 prompt "pay Team-W2 15 USDC":`);
  console.log(`  Reply: ${chatData.reply || chatData.error}`);
  console.log(`  Intents:`, JSON.stringify(chatData.intents));

  console.log("\n==================================================================");
  console.log("✅ DIAGNOSTIC COMPLETE");
  console.log("==================================================================");
}

runDiagnosticTest().catch(console.error);
