const { io } = require('socket.io-client');
const fetch = require('node-fetch');

(async () => {
  // 1. First get a valid session and table from the backend
  const baseUrl = 'http://localhost:5000'; // fastify runs on 5000
  
  console.log('Fetching active tables...');
  const res = await fetch(`${baseUrl}/api/tables?restaurantId=cmw-hotel-1`);
  if (!res.ok) {
    console.log('Failed to fetch tables');
    process.exit(1);
  }
  
  console.log('Done.');
})();
