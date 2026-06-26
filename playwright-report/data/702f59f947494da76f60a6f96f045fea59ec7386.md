# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dinner-rush.spec.ts >> Table Top E2E Dinner Rush Multi-GUI Integration >> Should synchronize operational mode toggles, shared carts, kitchen tickets, and vacate tables on payment
- Location: e2e\dinner-rush.spec.ts:8:7

# Error details

```
PrismaClientInitializationError: 
Invalid `prisma.restaurant.upsert()` invocation in
C:\Users\sjain\OneDrive\Desktop\ON TABLE ORDER\e2e\dinner-rush.spec.ts:15:29

  12 // =========================================================================
  13 
  14 // Seed Restaurant
→ 15 await prisma.restaurant.upsert(
Can't reach database server at `ep-empty-credit-aox4wd4q.c-2.ap-southeast-1.aws.neon.tech:5432`

Please make sure your database server is running at `ep-empty-credit-aox4wd4q.c-2.ap-southeast-1.aws.neon.tech:5432`.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { PrismaClient } from '@prisma/client';
  3   | import { signUserToken, signTableToken } from '../backend/src/utils/token';
  4   | 
  5   | const prisma = new PrismaClient();
  6   | 
  7   | test.describe('Table Top E2E Dinner Rush Multi-GUI Integration', () => {
  8   |   test('Should synchronize operational mode toggles, shared carts, kitchen tickets, and vacate tables on payment', async ({ browser }) => {
  9   |     
  10  |     // =========================================================================
  11  |     // STEP -1: DATABASE SEEDING (Ensure tables contain E2E test data)
  12  |     // =========================================================================
  13  |     
  14  |     // Seed Restaurant
> 15  |     await prisma.restaurant.upsert({
      |                             ^ PrismaClientInitializationError: 
  16  |       where: { id: 'rest-e2e-id' },
  17  |       update: {
  18  |         name: 'E2E Test Diner',
  19  |         operationalMode: 'FULL_SERVICE',
  20  |         taxRate: '0.0825'
  21  |       },
  22  |       create: {
  23  |         id: 'rest-e2e-id',
  24  |         name: 'E2E Test Diner',
  25  |         operationalMode: 'FULL_SERVICE',
  26  |         taxRate: '0.0825'
  27  |       }
  28  |     });
  29  | 
  30  |     // Generate secure token first
  31  |     const TABLE_TOKEN = signTableToken('rest-e2e-id', 'table1-id', '1');
  32  | 
  33  |     // Seed Table 1
  34  |     await prisma.table.upsert({
  35  |       where: {
  36  |         restaurantId_number: {
  37  |           restaurantId: 'rest-e2e-id',
  38  |           number: '1'
  39  |         }
  40  |       },
  41  |       update: {
  42  |         token: TABLE_TOKEN,
  43  |         status: 'VACANT'
  44  |       },
  45  |       create: {
  46  |         id: 'table1-id',
  47  |         number: '1',
  48  |         token: TABLE_TOKEN,
  49  |         status: 'VACANT',
  50  |         restaurantId: 'rest-e2e-id'
  51  |       }
  52  |     });
  53  | 
  54  |     // Seed Menu Item
  55  |     await prisma.menuItem.upsert({
  56  |       where: { id: 'cheeseburger-id' },
  57  |       update: {
  58  |         name: 'Cheeseburger',
  59  |         price: '10.00',
  60  |         isAvailable: true,
  61  |         restaurantId: 'rest-e2e-id'
  62  |       },
  63  |       create: {
  64  |         id: 'cheeseburger-id',
  65  |         name: 'Cheeseburger',
  66  |         description: 'Juicy beef patty with cheddar cheese',
  67  |         price: '10.00',
  68  |         isAvailable: true,
  69  |         restaurantId: 'rest-e2e-id'
  70  |       }
  71  |     });
  72  | 
  73  |     // Clear any leftover sessions/orders from previous runs to ensure fresh state
  74  |     await prisma.session.deleteMany({
  75  |       where: { restaurantId: 'rest-e2e-id' }
  76  |     });
  77  | 
  78  |     // =========================================================================
  79  |     // STEP 0: INITIALIZE DISTINCT BROWSER CONTEXTS (Simulating separate users/devices)
  80  |     // =========================================================================
  81  |     
  82  |     // Context 1: Restaurant Owner/Admin (Desktop screen)
  83  |     const adminContext = await browser.newContext();
  84  |     const adminPage = await adminContext.newPage();
  85  | 
  86  |     // Context 2: Customer at Table 1 (Mobile device screen)
  87  |     const customerContext = await browser.newContext({
  88  |       viewport: { width: 375, height: 812 }, // Emulate iPhone 12/13
  89  |       userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  90  |     });
  91  |     const customerPage = await customerContext.newPage();
  92  | 
  93  |     // Context 3: Kitchen Display System (Wall-mounted monitor display)
  94  |     const kitchenContext = await browser.newContext();
  95  |     const kitchenPage = await kitchenContext.newPage();
  96  | 
  97  |     // Mock tokens for RBAC authentication header injection
  98  |     const ADMIN_MOCK_TOKEN = signUserToken('admin-user-id', 'ADMIN');
  99  |     const KITCHEN_MOCK_TOKEN = signUserToken('kitchen-user-id', 'KITCHEN');
  100 | 
  101 |     // Seed mock local storage parameters to bypass login walls
  102 |     await adminPage.goto('/');
  103 |     await adminPage.evaluate((token) => {
  104 |       localStorage.setItem('tabletop_auth_token', token);
  105 |       localStorage.setItem('tabletop_restaurant_id', 'rest-e2e-id');
  106 |       document.cookie = `tabletop_auth_token=${token}; path=/;`;
  107 |     }, ADMIN_MOCK_TOKEN);
  108 | 
  109 |     await kitchenPage.goto('/');
  110 |     await kitchenPage.evaluate((token) => {
  111 |       localStorage.setItem('tabletop_auth_token', token);
  112 |       localStorage.setItem('tabletop_restaurant_id', 'rest-e2e-id');
  113 |       document.cookie = `tabletop_auth_token=${token}; path=/;`;
  114 |     }, KITCHEN_MOCK_TOKEN);
  115 | 
```