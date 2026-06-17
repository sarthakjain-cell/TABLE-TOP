import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface ServerToClientEvents {
  operationalModeChanged: (data: { restaurantId: string; mode: 'FULL_SERVICE' | 'SELF_SERVICE' }) => void;
  modeToggled: (data: { restaurantId: string; mode: 'FULL_SERVICE' | 'SELF_SERVICE' }) => void;
  cartUpdated: (data: { sessionId: string; cart: any }) => void;
  orderStatusUpdated: (data: {
    orderId: string;
    status: string;
    tableNumber?: string;
    restaurantId?: string;
    paymentMethod?: string;
    totalAmount?: string;
    items?: Array<{ name: string; quantity: number; modifications: string[] }>;
    createdAt?: Date;
    guestClaim?: { name: string; room: string };
  }) => void;
  helpRequested: (data: { tableNumber: string; requestType: string }) => void;
  pickupReady: (data: { orderId: string; tableNumber: string }) => void;
  menuItemAvailabilityChanged: (data: { menuItemId: string; isAvailable: boolean }) => void;
  sessionSynced: (data: any) => void; // Exclusive synchronization payload on reconnect
  error: (data: { message: string }) => void;
  menuUpdated: (data: { restaurantId: string }) => void;
  establishmentSettingsChanged: (data: any) => void;
  newOrderReceived: (data: { order: any }) => void;
  newOrderSubmitted: (data: { order: any }) => void;
  orderCreated: (data: { order: any }) => void;
  sessionUpdated: (data: any) => void;
  adminStateSynced: () => void;
  splitPaymentSync: (data: { lobby: any | null }) => void;
}

export interface ClientToServerEvents {
  joinTable: (data: { tableId: string; sessionId: string }, callback?: (res: any) => void) => void;
  joinSession: (data: { tableId: string; sessionId: string }, callback?: (res: any) => void) => void;
  addItemToCart: (
    data: { menuItemId: string; quantity: number; modifications?: string[] },
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;
  submitCart: (
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;
  requestHelp: (data: { tableId: string; requestType: string }) => void;
  initiateSplitPayment: (data: { splits: { id: string; name: string; amount: number }[] }) => void;
  claimSplitPayment: (data: { splitId: string }) => void;
  confirmSplitPayment: (data: { splitId: string }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  tableId: string;
  sessionId: string;
}

let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

export interface SplitPortion {
  id: string;
  name: string;
  amount: number;
  status: 'PENDING' | 'CLAIMED' | 'PAID';
}

export interface SplitLobby {
  sessionId: string;
  splits: SplitPortion[];
  isComplete: boolean;
}

const activeSplitLobbies = new Map<string, SplitLobby>();

/**
 * Calculates high-precision aggregated cart state for a table session.
 */
async function getAggregatedCart(sessionId: string) {
  const pendingOrder = await prisma.order.findFirst({
    where: { sessionId, status: 'PENDING' },
    include: {
      items: {
        include: {
          menuItem: true
        }
      }
    }
  });

  if (!pendingOrder) {
    return { sessionId, items: [], subtotal: '0.00' };
  }

  let subtotal = new Decimal(0);
  const items = pendingOrder.items.map(item => {
    const itemPrice = new Decimal(item.price.toString());
    const qty = new Decimal(item.quantity.toString());
    const itemSubtotal = itemPrice.mul(qty);
    subtotal = subtotal.add(itemSubtotal);

    return {
      orderItemId: item.id,
      menuItemId: item.menuItemId,
      name: item.menuItem.name,
      price: item.price.toString(),
      quantity: qty.toNumber(),
      modifications: item.modifications,
      subtotal: itemSubtotal.toFixed(2)
    };
  });

  return {
    sessionId,
    orderId: pendingOrder.id,
    items,
    subtotal: subtotal.toFixed(2)
  };
}

/**
 * Queries database for the complete un-compromised table state.
 * Syncs cart, ordered tickets, and split billing details to reconnecting clients.
 */
export async function getTableSessionSyncData(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      table: {
        include: {
          restaurant: true
        }
      },
      orders: {
        include: {
          items: {
            include: {
              menuItem: true
            }
          }
        }
      },
      transactions: {
        where: { status: 'COMPLETED' },
        include: {
          paymentItems: true
        }
      }
    }
  });

  if (!session) return null;

  // 1. Current collaborative cart
  const pendingOrder = session.orders.find(o => o.status === 'PENDING');
  let cartSubtotal = new Decimal(0);
  const cartItems = pendingOrder
    ? pendingOrder.items.map(item => {
        const itemPrice = new Decimal(item.price.toString());
        const qty = new Decimal(item.quantity.toString());
        const itemSubtotal = itemPrice.mul(qty);
        cartSubtotal = cartSubtotal.add(itemSubtotal);
        return {
          orderItemId: item.id,
          menuItemId: item.menuItemId,
          name: item.menuItem.name,
          price: item.price.toString(),
          quantity: qty.toNumber(),
          modifications: item.modifications,
          subtotal: itemSubtotal.toFixed(2)
        };
      })
    : [];

  // 2. Map of completed payments to determine unpaid item offsets
  const taxRate = new Decimal(session.table.restaurant.taxRate.toString());
  const paidQuantityMap = new Map<string, Decimal>();
  session.transactions.forEach(tx => {
    tx.paymentItems.forEach(pi => {
      const currentPaid = paidQuantityMap.get(pi.orderItemId) || new Decimal(0);
      paidQuantityMap.set(pi.orderItemId, currentPaid.add(new Decimal(pi.quantityPaid.toString())));
    });
  });

  let totalSessionSubtotal = new Decimal(0);
  let totalSessionTax = new Decimal(0);
  const ordersList: any[] = [];

  session.orders.forEach(order => {
    if (order.status === 'PENDING') return; // Skip cart state

    const orderItemsList = order.items.map(item => {
      const itemPrice = new Decimal(item.price.toString());
      const qty = new Decimal(item.quantity.toString());
      const paidQty = paidQuantityMap.get(item.id) || new Decimal(0);
      const unpaidQty = Decimal.max(0, qty.sub(paidQty));

      const itemSubtotal = itemPrice.mul(qty);
      const itemTax = itemSubtotal.mul(taxRate);

      totalSessionSubtotal = totalSessionSubtotal.add(itemSubtotal);
      totalSessionTax = totalSessionTax.add(itemTax);

      return {
        orderItemId: item.id,
        menuItemId: item.menuItemId,
        name: item.menuItem.name,
        price: item.price.toString(),
        orderedQuantity: qty.toNumber(),
        paidQuantity: paidQty.toNumber(),
        unpaidQuantity: unpaidQty.toNumber(),
        modifications: item.modifications
      };
    });

    ordersList.push({
      orderId: order.id,
      status: order.status,
      createdAt: order.createdAt,
      items: orderItemsList
    });
  });

  const totalSessionGrand = totalSessionSubtotal.add(totalSessionTax);

  let totalPaidSubtotal = new Decimal(0);
  let totalPaidTax = new Decimal(0);
  session.transactions.forEach(tx => {
    tx.paymentItems.forEach(pi => {
      totalPaidSubtotal = totalPaidSubtotal.add(new Decimal(pi.amount.toString()));
      totalPaidTax = totalPaidTax.add(new Decimal(pi.taxFraction.toString()));
    });
  });

  const remainingSubtotal = Decimal.max(0, totalSessionSubtotal.sub(totalPaidSubtotal));
  const remainingTax = Decimal.max(0, totalSessionTax.sub(totalPaidTax));
  const remainingGrand = remainingSubtotal.add(remainingTax);

  return {
    sessionId: session.id,
    tableId: session.tableId,
    tableNumber: session.table.number,
    restaurantMode: session.table.restaurant.operationalMode,
    paymentMode: session.table.restaurant.paymentMode,
    cart: {
      items: cartItems,
      subtotal: cartSubtotal.toFixed(2)
    },
    orders: ordersList,
    billing: {
      totals: {
        subtotal: totalSessionSubtotal.toFixed(2),
        tax: totalSessionTax.toFixed(2),
        grandTotal: totalSessionGrand.toFixed(2)
      },
      paid: {
        subtotal: totalPaidSubtotal.toFixed(2),
        tax: totalPaidTax.toFixed(2),
        grandTotal: totalPaidSubtotal.add(totalPaidTax).toFixed(2)
      },
      remaining: {
        subtotal: remainingSubtotal.toFixed(2),
        tax: remainingTax.toFixed(2),
        grandTotal: remainingGrand.toFixed(2)
      }
    }
  };
}

export function initSocketIO(server: HttpServer, fastify: FastifyInstance) {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    perMessageDeflate: {
      threshold: 1024, // Only compress messages larger than 1KB
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3 // Tradeoff between CPU usage and compression ratio
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      }
    }
  });

  io.on('connection', (socket: Socket) => {
    fastify.log.info(`Socket connected: ${socket.id}`);

    // Join room associated with the active table session (or reconnect state sync)
    const handleJoinSession = async (
      { tableId, sessionId }: { tableId: string; sessionId: string },
      callback?: (res: any) => void
    ) => {
      socket.data.tableId = tableId;
      socket.data.sessionId = sessionId;

      const roomName = `session:${sessionId}`;
      socket.join(roomName);
      fastify.log.info(`Socket ${socket.id} joined room ${roomName} (resync triggered)`);

      try {
        const tableSyncData = await getTableSessionSyncData(sessionId);
        if (tableSyncData) {
          socket.emit('sessionSynced', tableSyncData);
        }
        
        const lobby = activeSplitLobbies.get(sessionId);
        if (lobby) {
          socket.emit('splitPaymentSync', { lobby });
        }

        if (callback) callback({ success: true, sessionId, state: tableSyncData });
      } catch (err: any) {
        fastify.log.error(err);
        if (callback) callback({ success: false, error: err.message });
      }
    };

    socket.on('joinTable', handleJoinSession);
    socket.on('joinSession', handleJoinSession);

    // Handle adding/removing items from table cart collaboratively
    socket.on('addItemToCart', async ({ menuItemId, quantity, modifications }, callback) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) {
        const errMsg = 'No active session joined';
        socket.emit('error', { message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }

      try {
        let restaurantId = '';
        await prisma.$transaction(async (tx) => {
          // Validate dining session status
          const session = await tx.session.findUnique({
            where: { id: sessionId }
          });
          if (!session || session.status === 'CLOSED') {
            throw new Error('Active dining session is invalid or closed.');
          }
          restaurantId = session.restaurantId;

          // Validate item existence and availability
          const menuItem = await tx.menuItem.findUnique({
            where: { id: menuItemId }
          });
          if (!menuItem) {
            throw new Error('Menu item not found.');
          }
          if (!menuItem.isAvailable) {
            throw new Error(`"${menuItem.name}" is currently out of stock ("86ed")`);
          }

          // Fetch or initialize cart (PENDING order)
          let order = await tx.order.findFirst({
            where: { sessionId, status: 'PENDING' }
          });
          if (!order) {
            order = await tx.order.create({
              data: { sessionId, status: 'PENDING' }
            });
          }

          // Find duplicate order items with matching modifications
          const existingItems = await tx.orderItem.findMany({
            where: { orderId: order.id, menuItemId }
          });

          const sortedReqMods = (modifications || []).slice().sort();
          const match = existingItems.find(item => {
            const sortedItemMods = item.modifications.slice().sort();
            return (
              sortedItemMods.length === sortedReqMods.length &&
              sortedItemMods.every((mod, idx) => mod === sortedReqMods[idx])
            );
          });

          const qtyToAdd = new Decimal(quantity);

          if (match) {
            const currentQty = new Decimal(match.quantity.toString());
            const newQty = currentQty.add(qtyToAdd);

            if (newQty.lte(0)) {
              await tx.orderItem.delete({
                where: { id: match.id }
              });
            } else {
              await tx.orderItem.update({
                where: { id: match.id },
                data: { quantity: newQty }
              });
            }
          } else {
            if (qtyToAdd.gt(0)) {
              const isHalfPortion = (modifications || []).includes('Half Portion');
              if (isHalfPortion && !menuItem.hasHalfPortion) {
                throw new Error(`"${menuItem.name}" does not offer a half portion`);
              }
              const basePrice = isHalfPortion && menuItem.halfPrice ? menuItem.halfPrice : menuItem.price;
              let modifierPriceAdd = 0;
              if (menuItem.modifierGroups && modifications) {
                try {
                  const groups = typeof menuItem.modifierGroups === 'string' ? JSON.parse(menuItem.modifierGroups) : menuItem.modifierGroups;
                  if (Array.isArray(groups)) {
                    if (groups.length > 0 && groups[0].options !== undefined) {
                      for (const group of groups) {
                        if (Array.isArray(group.options)) {
                          for (const option of group.options) {
                            if (modifications.includes(option.name) && option.price) {
                              modifierPriceAdd += Number(option.price);
                            }
                          }
                        }
                      }
                    } else {
                      // Flat array of modifier tags
                      for (const mod of groups) {
                        if (modifications.includes(mod.name) && mod.price) {
                          modifierPriceAdd += Number(mod.price);
                        }
                      }
                    }
                  }
                } catch(e) { console.error('Error parsing modifier groups for price', e); }
              }
              const itemPrice = new Prisma.Decimal(basePrice).plus(modifierPriceAdd);

              await tx.orderItem.create({
                data: {
                  orderId: order.id,
                  menuItemId,
                  quantity: qtyToAdd,
                  price: itemPrice,
                  modifications: modifications || []
                }
              });
            }
          }
        });

        // Broadcast updated cart to the table room
        const updatedCart = await getAggregatedCart(sessionId);
        io?.to(`session:${sessionId}`).emit('cartUpdated', { sessionId, cart: updatedCart });
        
        // Broadcast to admin dashboard
        if (restaurantId) {
          io?.to(`restaurant:${restaurantId}`).emit('adminStateSynced');
        }

        if (callback) callback({ success: true });
      } catch (err: any) {
        fastify.log.error(err);
        socket.emit('error', { message: err.message });
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // Customer cart submission (sends cart to kitchen line as an order ticket)
    socket.on('submitCart', async (callback) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) {
        const errMsg = 'No active session joined';
        socket.emit('error', { message: errMsg });
        if (callback) callback({ success: false, error: errMsg });
        return;
      }

      try {
        const order = await prisma.$transaction(async (tx) => {
          const pendingOrder = await tx.order.findFirst({
            where: { sessionId, status: 'PENDING' },
            include: {
              items: {
                include: {
                  menuItem: true
                }
              },
              session: {
                include: {
                  table: {
                    include: {
                      restaurant: true
                    }
                  }
                }
              }
            }
          });

          if (!pendingOrder || pendingOrder.items.length === 0) {
            throw new Error('Your cart is empty');
          }

          // Verify everything is still available
          for (const item of pendingOrder.items) {
            if (!item.menuItem.isAvailable) {
              throw new Error(`"${item.menuItem.name}" is no longer available`);
            }
          }

          const isPrePay = pendingOrder.session.table.restaurant.paymentMode === 'PRE_PAY';
          const targetStatus = isPrePay ? 'PAYMENT_PENDING' : 'NEW';

          // Transition order state
          const updatedOrder = await tx.order.update({
            where: { id: pendingOrder.id },
            data: { status: targetStatus },
            include: {
              items: {
                include: {
                  menuItem: true
                }
              }
            }
          });

          return {
            updatedOrder,
            tableNumber: pendingOrder.session.table.number,
            restaurantId: pendingOrder.session.restaurantId
          };
        });

        const ioInstance = getIO();
        const sessionRoom = `session:${sessionId}`;

        // Broadcast empty cart for next round, and the active order status update
        const emptyCart = { sessionId, items: [], subtotal: '0.00' };
        ioInstance.to(sessionRoom).emit('cartUpdated', { sessionId, cart: emptyCart });
        ioInstance.to(sessionRoom).emit('orderStatusUpdated', { orderId: order.updatedOrder.id, status: order.updatedOrder.status });

        if (order.updatedOrder.status === 'NEW') {
          // Trigger Audio-Visual kitchen alert with ticket details ONLY if it bypasses PRE_PAY
          ioInstance.emit('newOrderReceived', {
            order: {
              id: order.updatedOrder.id,
              status: 'NEW',
              tableNumber: order.tableNumber,
              restaurantId: order.restaurantId,
              items: order.updatedOrder.items.map(i => ({
                id: i.id,
                name: i.menuItem.name,
                quantity: new Decimal(i.quantity.toString()).toNumber(),
                modifications: i.modifications
              })),
              createdAt: order.updatedOrder.createdAt
            }
          });
        } else if (order.updatedOrder.status === 'PAYMENT_PENDING') {
          // Notify the Waiter Dashboard that an order requires manual payment verification
          ioInstance.emit('helpRequested', {
            tableNumber: order.tableNumber,
            requestType: 'PAYMENT_VERIFICATION',
            metadata: {
              orderId: order.updatedOrder.id,
              amountToVerify: 'Full Cart' // Can be refined later with exact math
            }
          } as any);
        }

        if (callback) callback({ success: true });
      } catch (err: any) {
        fastify.log.error(err);
        socket.emit('error', { message: err.message });
        if (callback) callback({ success: false, error: err.message });
      }
    });

    socket.on('requestHelp', ({ tableId, requestType }) => {
      fastify.log.info(`Help request: table ${tableId} needs ${requestType}`);
      io?.emit('helpRequested', { tableNumber: tableId, requestType });
    });

    // ----------------------------------------------------
    // MULTIPLAYER SPLIT PAYMENT LOBBY EVENTS
    // ----------------------------------------------------

    socket.on('initiateSplitPayment', (data) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      
      const splits: SplitPortion[] = data.splits.map((s: any) => ({
        ...s,
        status: 'PENDING'
      }));

      const lobby: SplitLobby = {
        sessionId,
        splits,
        isComplete: false
      };

      activeSplitLobbies.set(sessionId, lobby);
      io?.to(`session:${sessionId}`).emit('splitPaymentSync', { lobby });
    });

    socket.on('claimSplitPayment', (data) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      const lobby = activeSplitLobbies.get(sessionId);
      if (!lobby) return;

      const split = lobby.splits.find((s: SplitPortion) => s.id === data.splitId);
      if (split && split.status === 'PENDING') {
        split.status = 'CLAIMED';
        io?.to(`session:${sessionId}`).emit('splitPaymentSync', { lobby });
      }
    });

    socket.on('unclaimSplitPayment', (data) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      const lobby = activeSplitLobbies.get(sessionId);
      if (!lobby) return;

      const split = lobby.splits.find((s: SplitPortion) => s.id === data.splitId);
      if (split && split.status === 'CLAIMED') {
        split.status = 'PENDING';
        io?.to(`session:${sessionId}`).emit('splitPaymentSync', { lobby });
      }
    });

    socket.on('confirmSplitPayment', (data) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      const lobby = activeSplitLobbies.get(sessionId);
      if (!lobby) return;

      const split = lobby.splits.find((s: SplitPortion) => s.id === data.splitId);
      if (split) {
        split.status = 'PAID';
        lobby.isComplete = lobby.splits.every((s: SplitPortion) => s.status === 'PAID');
        
        io?.to(`session:${sessionId}`).emit('splitPaymentSync', { lobby });

        // The frontend will listen for lobby.isComplete and trigger executeCheckout('CASH' -> modified for Split) 
        // to move the order to PAYMENT_PENDING.
      }
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
      fastify.log.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.io has not been initialized');
  }
  return io;
}
