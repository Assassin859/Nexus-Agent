const fs = require('fs');

const token = process.env.GITHUB_TOKEN;
const body = JSON.parse(fs.readFileSync('body.json', 'utf8'));

fetch('https://models.inference.ai.azure.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(body)
})
.then(res => {
  if (!res.ok) {
    return res.text().then(text => { throw new Error(`HTTP ${res.status}: ${text}`); });
  }
  return res.json();
})
.then(json => {
  console.log('\n=== BRAIN DECISION ===');
  console.log(json.choices[0].message.content);
  console.log('\n======================');
  console.log(`Model: ${json.model}`);
  console.log(`Tokens: ${json.usage.total_tokens}`);
})
.catch(err => {
  console.error('Error executing query:', err.message);
});
