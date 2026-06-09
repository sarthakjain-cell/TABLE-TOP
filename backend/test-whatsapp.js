async function testWhatsApp() {
  const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error("Missing credentials in .env!");
    return;
  }

  const phone = "919050634840"; // The user's whitelisted number

  console.log(`Sending to ${phone} using Phone ID ${WHATSAPP_PHONE_NUMBER_ID}...`);

  const response = await fetch(`https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'digital_receipt',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: "Demo Diner" },
              { type: 'text', text: "150.00" },
              { type: 'text', text: "https://tabletop.com/receipt/123" }
            ]
          }
        ]
      }
    })
  });

  const responseData = await response.json();
  
  if (!response.ok) {
    console.error("Meta API Error:", JSON.stringify(responseData, null, 2));
  } else {
    console.log("SUCCESS! Meta response:", JSON.stringify(responseData, null, 2));
  }
}

testWhatsApp();
