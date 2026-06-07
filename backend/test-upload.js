const tokenUtil = require('./dist/utils/token');

// 1. Generate an Admin Token
const adminToken = tokenUtil.signUserToken('admin-test-123', 'ADMIN', 'test-rest-123');

// 2. Make a multipart request
async function testUpload() {
  const formData = new FormData();
  const blob = new Blob(['dummy image content'], { type: 'image/jpeg' });
  formData.append('file', blob, 'test.jpg');

  try {
    const res = await fetch('https://backend-production-9a38.up.railway.app/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      },
      body: formData
    });
    const text = await res.text();
    console.log(res.status, text);
  } catch(e) {
    console.error(e);
  }
}
testUpload();
