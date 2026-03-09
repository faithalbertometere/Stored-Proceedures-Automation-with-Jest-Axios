/**
 * CREDIT-TC-2001
 * Verify the Default Flag is attached when Days Past Due is 90 and above
 * Boundaries: dpd89Date (last day of Bucket 3) → dpd90Date (Default entry)
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2001 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_defaultAccount');
const { assertAccountDefault } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-2001 — Default Flag Attached at DPD=90', () => {

  describe('Boundary: dpd89Date — last day before Default (DPD=89)', () => {
    test('isDefault = false at DPD=89', () => { expect(ctx.stateAtDPD89.searchResponse.isDefault).toBe(false); });
    test('DB: ArrearsBucket = 3 at DPD=89', () => { expect(ctx.stateAtDPD89.dbRecord.ArrearsBucket).toBe(3); });
  });

  describe('Boundary: dpd90Date — Default entry (DPD=90)', () => {
    test('isDefault = true at DPD=90', () => { expect(ctx.stateAtDPD90.searchResponse.isDefault).toBe(true); });
    test('DB: DaysPastDue >= 90', () => { expect(ctx.stateAtDPD90.dbRecord.DaysPastDue).toBeGreaterThanOrEqual(90); });
    assertAccountDefault(() => ctx.stateAtDPD90);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-2001 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  dpd89Date (DPD=89): isDefault=${ctx?.stateAtDPD89?.searchResponse?.isDefault} | Bucket=${ctx?.stateAtDPD89?.dbRecord?.ArrearsBucket}`);
    console.log(`  dpd90Date (DPD=90): isDefault=${ctx?.stateAtDPD90?.searchResponse?.isDefault}`);
    console.log('══════════════════════════════════════════\n');
  });
});
