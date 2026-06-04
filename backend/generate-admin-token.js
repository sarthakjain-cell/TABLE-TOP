const crypto = require('crypto');

const SECRET_KEY = process.env.JWT_SECRET || 'tabletop-super-secret-key';

function signUserToken(userId, role) {
  const payloadStr = JSON.stringify({
    userId,
    role,
    createdAt: Date.now()
  });

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadStr)
    .digest('hex');

  return Buffer.from(
    JSON.stringify({
      payload: payloadStr,
      signature
    })
  ).toString('base64url');
}

const adminToken = signUserToken('admin-123', 'ADMIN');

console.log('-----------------------------------------');
console.log('ADMIN ACCESS TOKEN (FRESH):');
console.log(adminToken);
console.log('-----------------------------------------');
