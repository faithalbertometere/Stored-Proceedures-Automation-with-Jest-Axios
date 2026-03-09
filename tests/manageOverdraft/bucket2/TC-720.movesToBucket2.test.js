/**
 * CREDIT-TC-720
 * Verify accounts are moved to Arrears Bucket 2 when DPD is 31
 * Boundaries: dpd30Date (last day of Bucket 1) → dpd31Date (Bucket 2 entry)
 *
 * Run: npx jest tests/manageOverdraft/bucket2/TC-720 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket2Account');
const { assertBucketState, assertStatus, assertAccountDisabled, STATUS } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-720 — Moves to Bucket 2 at DPD=31', () => {

  describe('Boundary: dpd30Date — last day of Bucket 1 (DPD=30)', () => {
    test('DB: ArrearsBucket = 1', () => { expect(ctx.stateAtDPD30.dbRecord.ArrearsBucket).toBe(1); });
    test('DB: DaysPastDue = 30',  () => { expect(ctx.stateAtDPD30.dbRecord.DaysPastDue).toBe(30); });
    test('API: arrearsBucket = 1',() => { expect(ctx.stateAtDPD30.searchResponse.arrearsBucket).toBe(1); });
  });

  describe('Boundary: dpd31Date — Bucket 2 entry (DPD=31)', () => {
    assertBucketState(() => ctx.stateAtDPD31, 31, 2, true);
    assertStatus(() => ctx.stateAtDPD31, STATUS.DEBT_DISABLED, 'DebtDisabled');
    assertAccountDisabled(() => ctx.stateAtDPD31);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-720 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  dpd30Date (DPD=30): Bucket=${ctx?.stateAtDPD30?.dbRecord?.ArrearsBucket}`);
    console.log(`  dpd31Date (DPD=31): Bucket=${ctx?.stateAtDPD31?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
