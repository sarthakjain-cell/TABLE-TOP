const http = require('http');

async function test() {
  const data = JSON.stringify({ customerName: 'John', customerPhone: '101' });

  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/sessions/test-session/checkout-cart',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Body:', body);
    });
  });

  req.on('error', (e) => {
    console.error('Problem with request:', e.message);
  });

  req.write(data);
  req.end();
}

test();
