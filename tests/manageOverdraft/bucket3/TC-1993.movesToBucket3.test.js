/**
 * CREDIT-TC-1993
 * Verify accounts are moved to Arrears Bucket 3 when DPD is 61
 * Boundaries: dpd60Date (last day of Bucket 2) → dpd61Date (Bucket 3 entry)
 *
 * Run: npx jest tests/manageOverdraft/bucket3/TC-1993 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket3Account');
const { assertBucketState, assertStatus, assertAccountDisabled, STATUS } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-1993 — Moves to Bucket 3 at DPD=61', () => {

  describe('Boundary: dpd60Date — last day of Bucket 2 (DPD=60)', () => {
    test('DB: ArrearsBucket = 2', () => { expect(ctx.stateAtDPD60.dbRecord.ArrearsBucket).toBe(2); });
    test('DB: DaysPastDue = 60',  () => { expect(ctx.stateAtDPD60.dbRecord.DaysPastDue).toBe(60); });
    test('API: arrearsBucket = 2',() => { expect(ctx.stateAtDPD60.searchResponse.arrearsBucket).toBe(2); });
  });

  describe('Boundary: dpd61Date — Bucket 3 entry (DPD=61)', () => {
    assertBucketState(() => ctx.stateAtDPD61, 61, 3, true);
    assertStatus(() => ctx.stateAtDPD61, STATUS.DEBT_DISABLED, 'DebtDisabled');
    assertAccountDisabled(() => ctx.stateAtDPD61);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-1993 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  dpd60Date (DPD=60): Bucket=${ctx?.stateAtDPD60?.dbRecord?.ArrearsBucket}`);
    console.log(`  dpd61Date (DPD=61): Bucket=${ctx?.stateAtDPD61?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
