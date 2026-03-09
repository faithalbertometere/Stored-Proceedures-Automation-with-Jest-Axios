/**
 * CREDIT-TC-1994
 * Verify Account stays in Arrears Bucket 3 for DPD 61-89
 * Boundaries: dpd61Date (entry) and dpd89Date (last day before default)
 *
 * Run: npx jest tests/manageOverdraft/bucket3/TC-1994 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket3Account');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-1994 — Account Stays in Bucket 3 for DPD 61–89', () => {

  describe('Boundary: dpd61Date — entry (DPD=61)', () => {
    test('DB: ArrearsBucket = 3', () => { expect(ctx.stateAtDPD61.dbRecord.ArrearsBucket).toBe(3); });
    test('DB: DaysPastDue = 61',  () => { expect(ctx.stateAtDPD61.dbRecord.DaysPastDue).toBe(61); });
    test('API: arrearsBucket = 3',() => { expect(ctx.stateAtDPD61.searchResponse.arrearsBucket).toBe(3); });
  });

  describe('Boundary: dpd89Date — last day before Default (DPD=89)', () => {
    test('DB: ArrearsBucket = 3', () => { expect(ctx.stateAtDPD89.dbRecord.ArrearsBucket).toBe(3); });
    test('DB: DaysPastDue = 89',  () => { expect(ctx.stateAtDPD89.dbRecord.DaysPastDue).toBe(89); });
    test('API: arrearsBucket = 3',() => { expect(ctx.stateAtDPD89.searchResponse.arrearsBucket).toBe(3); });
    test('isDefault = false (not yet defaulted)', () => { expect(ctx.stateAtDPD89.searchResponse.isDefault).toBe(false); });
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-1994 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  dpd61Date (DPD=61): Bucket=${ctx?.stateAtDPD61?.dbRecord?.ArrearsBucket}`);
    console.log(`  dpd89Date (DPD=89): Bucket=${ctx?.stateAtDPD89?.dbRecord?.ArrearsBucket} | isDefault=${ctx?.stateAtDPD89?.searchResponse?.isDefault}`);
    console.log('══════════════════════════════════════════\n');
  });
});
