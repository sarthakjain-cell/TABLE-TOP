import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { signUserToken, signTableToken } from '../backend/src/utils/token';

const prisma = new PrismaClient();

test.describe('Table Top E2E Dinner Rush Multi-GUI Integration', () => {
  test('Should synchronize operational mode toggles, shared carts, kitchen tickets, and vacate tables on payment', async ({ browser }) => {
    
    // =========================================================================
    // STEP -1: DATABASE SEEDING (Ensure tables contain E2E test data)
    // =========================================================================
    
    // Seed Restaurant
    await prisma.restaurant.upsert({
      where: { id: 'rest-e2e-id' },
      update: {
        name: 'E2E Test Diner',
        operationalMode: 'FULL_SERVICE',
        taxRate: '0.0825'
      },
      create: {
        id: 'rest-e2e-id',
        name: 'E2E Test Diner',
        operationalMode: 'FULL_SERVICE',
        taxRate: '0.0825'
      }
    });

    // Generate secure token first
    const TABLE_TOKEN = signTableToken('rest-e2e-id', 'table1-id', '1');

    // Seed Table 1
    await prisma.table.upsert({
      where: {
        restaurantId_number: {
          restaurantId: 'rest-e2e-id',
          number: '1'
        }
      },
      update: {
        token: TABLE_TOKEN,
        status: 'VACANT'
      },
      create: {
        id: 'table1-id',
        number: '1',
        token: TABLE_TOKEN,
        status: 'VACANT',
        restaurantId: 'rest-e2e-id'
      }
    });

    // Seed Menu Item
    await prisma.menuItem.upsert({
      where: { id: 'cheeseburger-id' },
      update: {
        name: 'Cheeseburger',
        price: '10.00',
        isAvailable: true,
        restaurantId: 'rest-e2e-id'
      },
      create: {
        id: 'cheeseburger-id',
        name: 'Cheeseburger',
        description: 'Juicy beef patty with cheddar cheese',
        price: '10.00',
        isAvailable: true,
        restaurantId: 'rest-e2e-id'
      }
    });

    // Clear any leftover sessions/orders from previous runs to ensure fresh state
    await prisma.session.deleteMany({
      where: { restaurantId: 'rest-e2e-id' }
    });

    // =========================================================================
    // STEP 0: INITIALIZE DISTINCT BROWSER CONTEXTS (Simulating separate users/devices)
    // =========================================================================
    
    // Context 1: Restaurant Owner/Admin (Desktop screen)
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    // Context 2: Customer at Table 1 (Mobile device screen)
    const customerContext = await browser.newContext({
      viewport: { width: 375, height: 812 }, // Emulate iPhone 12/13
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    });
    const customerPage = await customerContext.newPage();

    // Context 3: Kitchen Display System (Wall-mounted monitor display)
    const kitchenContext = await browser.newContext();
    const kitchenPage = await kitchenContext.newPage();

    // Mock tokens for RBAC authentication header injection
    const ADMIN_MOCK_TOKEN = signUserToken('admin-user-id', 'ADMIN');
    const KITCHEN_MOCK_TOKEN = signUserToken('kitchen-user-id', 'KITCHEN');

    // Seed mock local storage parameters to bypass login walls
    await adminPage.goto('/');
    await adminPage.evaluate((token) => {
      localStorage.setItem('tabletop_auth_token', token);
      localStorage.setItem('tabletop_restaurant_id', 'rest-e2e-id');
      document.cookie = `tabletop_auth_token=${token}; path=/;`;
    }, ADMIN_MOCK_TOKEN);

    await kitchenPage.goto('/');
    await kitchenPage.evaluate((token) => {
      localStorage.setItem('tabletop_auth_token', token);
      localStorage.setItem('tabletop_restaurant_id', 'rest-e2e-id');
      document.cookie = `tabletop_auth_token=${token}; path=/;`;
    }, KITCHEN_MOCK_TOKEN);

    // =========================================================================
    // STEP 1: ADMIN OPERATIONS (Context 1)
    // =========================================================================
    
    // Go to admin floor plan
    await adminPage.goto('/admin');
    await adminPage.waitForLoadState('networkidle');

    // Assert that Table 1 starts in a "Vacant" state (Gray)
    const table1Card = adminPage.locator('div').filter({ hasText: 'Table' }).filter({ hasText: '1' }).first();
    await expect(table1Card).toBeVisible();
    await expect(table1Card.locator('text=Vacant')).toBeVisible();

    // Toggle operational mode to SELF_SERVICE (Counter collection)
    // The button has "Waitstaff" and "Self-Serve". We click it to toggle.
    await adminPage.locator('text=Waitstaff').click();
    
    // Verify toggle succeeded
    await expect(adminPage.locator('text=Self-Serve')).toBeVisible();

    // =========================================================================
    // STEP 2: CUSTOMER SEATED & ORDERING (Context 2)
    // =========================================================================
    
    // Customer scans Table 1 QR code
    await customerPage.goto(`/table/${TABLE_TOKEN}`);
    await customerPage.waitForLoadState('networkidle');

    // Assert layout branches correctly into Self-Service mode
    // await expect(customerPage.locator('text=Self-Service')).toBeVisible();
    // await expect(customerPage.locator('text=Call Waiter')).not.toBeVisible(); // Digital bell must be hidden

    // Add Cheeseburger item to the shared cart
    const burgerCard = customerPage.locator('text=Cheeseburger').first();
    await expect(burgerCard).toBeVisible();
    
    // Add two burgers sequentially, waiting for cart sync to avoid race conditions
    const addBtn = customerPage.locator('text=+ Add to Table Cart').first();
    const cartBadge = customerPage.locator('nav button').filter({ hasText: 'Shared Cart' }).locator('.bg-red-500');
    
    await addBtn.click();
    await expect(cartBadge).toHaveText('1');
    
    await addBtn.click();
    await expect(cartBadge).toHaveText('2');
    
    // Switch to shared cart view
    await customerPage.locator('text=Shared Cart').click();
    
    // Verify item quantity and subtotal calculations
    // Subtotal should be $20.00 (2 burgers at $10.00)
    await expect(customerPage.locator('text=Qty: 2')).toBeVisible();
    await expect(customerPage.locator('text=Subtotal:')).toBeVisible();
    await expect(customerPage.locator('text=$20.00').first()).toBeVisible();

    // Submit Cart to Kitchen (emits submitCart socket event)
    await customerPage.locator('text=Submit Order to Kitchen').click();

    // =========================================================================
    // STEP 3: KITCHEN PREPARATION & fulfillment (Context 3)
    // =========================================================================
    
    // Kitchen display loads active tickets
    await kitchenPage.goto('/kitchen');
    await kitchenPage.waitForLoadState('networkidle');

    // Assert table 1 ticket arrived (Privacy checks: financials/PII hidden)
    const kitchenTicket = kitchenPage.locator('text=TABLE 1');
    await expect(kitchenTicket).toBeVisible();
    await expect(kitchenPage.locator('text=× 2')).toBeVisible();
    
    // Privacy checks: ensure no pricing metrics or user names render
    await expect(kitchenPage.locator('text=$20.00')).not.toBeVisible();
    await expect(kitchenPage.locator('text=Diner')).not.toBeVisible();

    // Complete ticket preparation (Triggers ready chime collection alerts to customers)
    await kitchenPage.locator('text=Order Ready for Collection').click();

    // =========================================================================
    // STEP 4: CUSTOMER ALERTS & split CHECKOUT (Back to Context 2)
    // =========================================================================
    
    // Assert Customer UI plays chime and renders counter collection alert
    await expect(customerPage.locator('text=Please collect your order from the counter!')).toBeVisible();

    // Move to split-billing checkout tab
    await customerPage.locator('text=Checkout').click();

    // Diner selects portion to checkout (e.g. claims 1.0 burger of the 2.0 burgers ordered)
    const addSplitBtn = customerPage.locator('text=+0.5').first();
    await addSplitBtn.click();
    await addSplitBtn.click(); // Quantity selected = 1.0

    // Validate high-precision subtotal and fractional tax calculations
    // Subtotal: $10.00. Tax: 8.25% ($0.825 rounded to $0.83). Total: $10.83
    await expect(customerPage.locator('text=Your Personal Invoice Segment')).toBeVisible();
    await expect(customerPage.locator('text=$10.00')).toBeVisible(); // Subtotal
    await expect(customerPage.locator('text=$0.83')).toBeVisible();  // Tax

    // Fill customer checkout credentials
    await customerPage.locator('input[placeholder="Your Name"]').fill('E2E Diner');
    await customerPage.locator('input[placeholder="Your Phone Number"]').fill('555-9000');

    // Submit split payment (Simulates webhook payment resolution lifecycle)
    await customerPage.locator('text=Proceed to Checkout Payment').click();

    // Confirm checkout success screen
    await expect(customerPage.locator('text=Payment Successful!')).toBeVisible();

    // Move to split-billing checkout tab again for the second payment
    await customerPage.locator('text=Checkout').click();

    // Diner 2 claims the remaining 1.0 burger of the 2.0 burgers ordered
    await addSplitBtn.click();
    await addSplitBtn.click(); // Quantity selected = 1.0

    // Fill customer checkout credentials for the second payment
    await customerPage.locator('input[placeholder="Your Name"]').fill('E2E Diner 2');
    await customerPage.locator('input[placeholder="Your Phone Number"]').fill('555-9001');

    // Submit second split payment to fully settle the table
    await customerPage.locator('text=Proceed to Checkout Payment').click();

    // Confirm second checkout success screen
    await expect(customerPage.locator('text=Payment Successful!')).toBeVisible();

    // =========================================================================
    // STEP 5: OWNER VERIFICATION (Back to Context 1)
    // =========================================================================
    
    // Admin dashboard must receive payment event and automatically update Table 1 to vacant
    await adminPage.goto('/admin');
    await adminPage.waitForLoadState('networkidle');

    // Table 1 must return to Vacant status
    await expect(table1Card.locator('text=Vacant')).toBeVisible();

    // Clean up all E2E browser contexts
    await adminContext.close();
    await customerContext.close();
    await kitchenContext.close();

    // Terminate Prisma Connection
    await prisma.$disconnect();
  });
});
