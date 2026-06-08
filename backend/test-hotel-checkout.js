const fetch = require('node-fetch');

async function test() {
  const res = await fetch('http://localhost:3000/api/sessions/test-session-id/checkout-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName: 'John', customerPhone: '101' })
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text);
}
test();
