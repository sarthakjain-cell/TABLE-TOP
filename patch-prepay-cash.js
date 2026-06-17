const fs = require('fs');

// Patch backend
const backendFile = 'backend/src/routes/billing.ts';
let backendContent = fs.readFileSync(backendFile, 'utf8');

backendContent = backendContent.replace(
  `interface CheckoutCartBody {
  customerName?: string;
  customerPhone?: string;
}`,
  `interface CheckoutCartBody {
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: 'CASH' | 'CARD' | 'UPI' | 'ROOM';
}`
);

backendContent = backendContent.replace(
  `  fastify.post<{ Params: { sessionId: string }; Body: CheckoutCartBody }>('/api/sessions/:sessionId/checkout-cart', async (request, reply) => {
    const { sessionId } = request.params;
    const { customerName, customerPhone } = request.body;`,
  `  fastify.post<{ Params: { sessionId: string }; Body: CheckoutCartBody }>('/api/sessions/:sessionId/checkout-cart', async (request, reply) => {
    const { sessionId } = request.params;
    const { customerName, customerPhone, paymentMethod } = request.body;`
);

backendContent = backendContent.replace(
  `        const createdTx = await tx.transaction.create({
          data: {
            sessionId,
            amount: totalGrand,
            taxPaid: transactionTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
            status: 'COMPLETED',
            customerName,
            customerPhone,
            deliveryFeeApplied: roomServiceFee,
            paymentItems: {`,
  `        const createdTx = await tx.transaction.create({
          data: {
            sessionId,
            amount: totalGrand,
            taxPaid: transactionTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
            status: paymentMethod === 'CASH' || paymentMethod === 'CARD' ? 'PENDING' : 'COMPLETED',
            paymentMethod: paymentMethod || 'UPI',
            customerName,
            customerPhone,
            deliveryFeeApplied: roomServiceFee,
            paymentItems: {`
);

fs.writeFileSync(backendFile, backendContent);
console.log('Backend patched.');

// Patch frontend
const frontendFile = 'frontend/app/table/[tableToken]/page.tsx';
let frontendContent = fs.readFileSync(frontendFile, 'utf8');

frontendContent = frontendContent.replace(
  `      if (isCartCheckout || checkoutMode === 'CHARGE_ROOM') {
        addDebugLog('Attempting cart/room checkout');
        const response = await fetch(\`/api/sessions/\${tableSession?.sessionId}/checkout-cart\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName, customerPhone })
        });`,
  `      if (isCartCheckout || checkoutMode === 'CHARGE_ROOM') {
        addDebugLog('Attempting cart/room checkout');
        const response = await fetch(\`/api/sessions/\${tableSession?.sessionId}/checkout-cart\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName, customerPhone, paymentMethod })
        });`
);

fs.writeFileSync(frontendFile, frontendContent);
console.log('Frontend patched.');
