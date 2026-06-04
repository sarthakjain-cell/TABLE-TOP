import crypto from 'crypto';

const SECRET_KEY = process.env.JWT_SECRET || 'tabletop-super-secret-key';

export interface DecodedTableToken {
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  timestamp: number;
}

/**
 * Encodes and signs the restaurant and table context to a secure token string.
 */
export function signTableToken(restaurantId: string, tableId: string, tableNumber: string): string {
  const payloadStr = JSON.stringify({
    restaurantId,
    tableId,
    tableNumber,
    timestamp: Date.now()
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
  ).toString('base64url'); // base64url is URL-safe (no +, /, or = padding)
}

/**
 * Decodes and verifies the table token signature.
 */
export function verifyTableToken(token: string): DecodedTableToken | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const { payload, signature } = JSON.parse(raw);
    
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payload)
      .digest('hex');
      
    if (signature !== expectedSignature) {
      return null;
    }
    
    return JSON.parse(payload) as DecodedTableToken;
  } catch (err) {
    return null;
  }
}

export interface UserAuthPayload {
  userId: string;
  role: 'ADMIN' | 'KITCHEN';
  restaurantId: string;
  createdAt: number;
}

/**
 * Encodes and signs user auth payload containing Role-Based Access and Tenant Isolation details.
 */
export function signUserToken(userId: string, role: 'ADMIN' | 'KITCHEN', restaurantId: string): string {
  const payloadStr = JSON.stringify({
    userId,
    role,
    restaurantId,
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

/**
 * Decodes and verifies a user auth token's signature.
 */
export function verifyUserToken(token: string): UserAuthPayload | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const { payload, signature } = JSON.parse(raw);

    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return null;
    }

    return JSON.parse(payload) as UserAuthPayload;
  } catch (err) {
    return null;
  }
}
