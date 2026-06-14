const phone = "919050634840"; // Make sure this is your Exact Test Number
const token = "EAAfYFEw0RYsBRuCASpbZAHc26mrdwa9CZBIC0gr2KRY6MPZBAJ8XY3gWHNqINtT8Wtpryq24ZBP1aK8dsSDcw53upK929vZBduqIO6IPlIOvsfNga8XIn8m0ljfW4plyqQG1xcfMXpWxb8ZAljrumQSORXwqt5GHm9Icco4tHeF348LUnIPxYlkwh0D7tr2ySuzDhBZBtkZCJW7wyJBR3ZAZB4WmpJy0XZBZBUsUnZAapkuwjmjkR97Clj70xSRScB0i0c2M3dHx5gkfispvgTFB8pRceSAZDZD";
const phoneId = "1121426661062570";

async function test() {
  const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'digital_receipt',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: "Table Top" },
              { type: 'text', text: "150.00" },
              { type: 'text', text: "Check your email" }
            ]
          }
        ]
      }
    })
  });
  console.log(JSON.stringify(await response.json(), null, 2));
}
test();
