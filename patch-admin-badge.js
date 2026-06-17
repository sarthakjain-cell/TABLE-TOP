const fs = require('fs');

const frontendFile = 'frontend/app/admin/page.tsx';
let frontendContent = fs.readFileSync(frontendFile, 'utf8');

// Fix: Make sure the Orange Payment Pending Badge shows up EVEN IF Waiter is requested
frontendContent = frontendContent.replace(
  `                      {/* Payment Pending Badge */}
                      {(hasPendingTransaction || pendingPaymentOrderId) && !isWaiterRequested && (
                        <div className="absolute -top-3 -right-3 bg-orange-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-10 animate-pulse">
                          Pending Payment
                        </div>
                      )}`,
  `                      {/* Payment Pending Badge */}
                      {(hasPendingTransaction || pendingPaymentOrderId) && (
                        <div className={\`absolute -top-3 \${isWaiterRequested ? 'right-20' : '-right-3'} bg-orange-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-10 animate-pulse\`}>
                          Pending Payment
                        </div>
                      )}`
);

fs.writeFileSync(frontendFile, frontendContent);
console.log('Frontend admin badge patched.');
