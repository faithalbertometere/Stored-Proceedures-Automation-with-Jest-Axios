/**
 * CREDIT-TC-721
 * Verify Account stays in Arrears Bucket 2 for DPD 31-60
 * Boundaries: dpd31Date (entry) and dpd60Date (last day)
 *
 * Run: npx jest tests/manageOverdraft/bucket2/TC-721 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket2Account');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-721 — Account Stays in Bucket 2 for DPD 31–60', () => {

  describe('Boundary: dpd31Date — entry (DPD=31)', () => {
    test('DB: ArrearsBucket = 2', () => { expect(ctx.stateAtDPD31.dbRecord.ArrearsBucket).toBe(2); });
    test('DB: DaysPastDue = 31',  () => { expect(ctx.stateAtDPD31.dbRecord.DaysPastDue).toBe(31); });
    test('API: arrearsBucket = 2',() => { expect(ctx.stateAtDPD31.searchResponse.arrearsBucket).toBe(2); });
  });

  describe('Boundary: dpd60Date — last day (DPD=60)', () => {
    test('DB: ArrearsBucket = 2', () => { expect(ctx.stateAtDPD60.dbRecord.ArrearsBucket).toBe(2); });
    test('DB: DaysPastDue = 60',  () => { expect(ctx.stateAtDPD60.dbRecord.DaysPastDue).toBe(60); });
    test('API: arrearsBucket = 2',() => { expect(ctx.stateAtDPD60.searchResponse.arrearsBucket).toBe(2); });
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-721 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  dpd31Date (DPD=31): Bucket=${ctx?.stateAtDPD31?.dbRecord?.ArrearsBucket}`);
    console.log(`  dpd60Date (DPD=60): Bucket=${ctx?.stateAtDPD60?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
