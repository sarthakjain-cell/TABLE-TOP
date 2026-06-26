export async function sendWhatsAppReceipt(
  phone: string,
  amount: string | number,
  restaurantName: string,
  receiptId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn("WhatsApp credentials not configured. Skipping receipt.");
      return { success: true, message: 'Simulated WhatsApp (credentials missing)' };
    }

    // Format phone number to start with 91 if it doesn't already
    let formattedPhone = phone.replace(/\D/g, ''); // strip non digits
    if (formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    } else if (formattedPhone.startsWith('0')) {
      formattedPhone = '91' + formattedPhone.substring(1);
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://table-top-frontend-pi.vercel.app';
    const receiptUrl = `${FRONTEND_URL}/receipt/${receiptId}`;

    const response = await fetch(`https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: 'ontable_receipt',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: restaurantName },
                { type: 'text', text: Number(amount).toFixed(2) },
                { type: 'text', text: receiptUrl }
              ]
            }
          ]
        }
      })
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      console.error("Meta API Error:", JSON.stringify(responseData, null, 2));
      throw new Error(`WhatsApp API Error: ${(responseData as any).error?.message || 'Unknown error'}`);
    }
    
    console.log("Successfully sent automated WhatsApp receipt to", formattedPhone);
    return { success: true, message: 'Receipt sent successfully via WhatsApp' };
  } catch (err: any) {
    console.error("Error sending WhatsApp receipt:", err);
    throw err;
  }
}
