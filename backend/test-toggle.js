const jwt = require('jsonwebtoken');

async function testToggle() {
  const token = jwt.sign(
    { restaurantId: 'manual-test-rest', role: 'ADMIN' },
    'tabletop-super-secret-key-change-this-in-production',
    { expiresIn: '1h' }
  );

  console.log('Generated Token:', token);

  const res = await fetch('http://127.0.0.1:3001/api/restaurants/manual-test-rest/mode', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mode: 'SELF_SERVICE' })
  });

  console.log('Status:', res.status);
  const data = await res.json().catch(() => null);
  console.log('Response:', data);
}

testToggle();
