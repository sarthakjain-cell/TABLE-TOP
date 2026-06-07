-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_idx" ON "MenuItem"("restaurantId");

-- CreateIndex
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItemPayment_transactionId_idx" ON "OrderItemPayment"("transactionId");

-- CreateIndex
CREATE INDEX "OrderItemPayment_orderItemId_idx" ON "OrderItemPayment"("orderItemId");

-- CreateIndex
CREATE INDEX "Session_tableId_idx" ON "Session"("tableId");

-- CreateIndex
CREATE INDEX "Session_restaurantId_status_idx" ON "Session"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Table_restaurantId_idx" ON "Table"("restaurantId");

-- CreateIndex
CREATE INDEX "Transaction_sessionId_idx" ON "Transaction"("sessionId");
