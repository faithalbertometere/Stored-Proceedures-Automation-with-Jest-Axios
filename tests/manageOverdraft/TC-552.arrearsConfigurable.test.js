/**
 * CREDIT-TC-552
 * Verify arrears bucket is configurable on product setup
 *
 * Run: npx jest tests/manageOverdraft/TC-552 --runInBand
 */

const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const db = require('../../helpers/dbHelper');

let account;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-552 — Arrears Bucket Configurable on Product Setup', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();
  }, 60_000);

  test('arrearsTransitionDays is returned on SearchOverdraft', () => {
    expect(account.searchResponse.arrearsTransitionDays).toBeDefined();
    expect(account.searchResponse.arrearsTransitionDays).toBeGreaterThan(0);
  });

  test('defaultArrearsBucket is returned on SearchOverdraft', () => {
    expect(account.searchResponse.defaultArrearsBucket).toBeDefined();
    expect(account.searchResponse.defaultArrearsBucket).toBeGreaterThan(0);
  });

  test('gracePeriodInDays is returned on SearchOverdraft', () => {
    expect(account.searchResponse.gracePeriodInDays).toBeDefined();
    expect(account.searchResponse.gracePeriodInDays).toBeGreaterThan(0);
  });

  test('statementDay is returned on SearchOverdraft', () => {
    expect(account.searchResponse.statementDay).toBeDefined();
    expect(account.searchResponse.statementDay).toBeGreaterThanOrEqual(1);
    expect(account.searchResponse.statementDay).toBeLessThanOrEqual(31);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-552 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:           ${account?.odAccountNumber}`);
    console.log(`  arrearsTransitionDays:${account?.searchResponse?.arrearsTransitionDays}`);
    console.log(`  defaultArrearsBucket: ${account?.searchResponse?.defaultArrearsBucket}`);
    console.log(`  gracePeriodInDays:    ${account?.searchResponse?.gracePeriodInDays}`);
    console.log(`  statementDay:         ${account?.searchResponse?.statementDay}`);
    console.log('══════════════════════════════════════════\n');
  });
});
