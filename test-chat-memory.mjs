async function testConversationMemory() {
  const agentUrl = 'http://localhost:3000';
  console.log('--- Step 1: Initial payroll prompt ---');
  const res1 = await fetch(agentUrl + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Pay 200 USDC to 0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b every Friday',
      conversationHistory: []
    })
  }).then(r => r.json());
  console.log('Reply 1:', res1.reply);

  console.log('--- Step 2: Follow up "do it anyway" ---');
  const res2 = await fetch(agentUrl + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'do it anyway',
      conversationHistory: [
        { sender: 'user', text: 'Pay 200 USDC to 0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b every Friday' },
        { sender: 'agent', text: res1.reply }
      ]
    })
  }).then(r => r.json());
  console.log('Reply 2:', res2.reply);
}

testConversationMemory().catch(console.error);
