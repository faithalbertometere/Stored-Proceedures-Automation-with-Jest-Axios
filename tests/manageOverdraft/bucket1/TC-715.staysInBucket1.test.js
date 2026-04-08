/**
 * CREDIT-TC-715
 * Verify Account stays in Arrears Bucket 1 for DPD 1-30
 * Boundaries: dpd1Date (entry) and dpd30Date (last day)
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-715 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket1Account');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-715 — Account Stays in Bucket 1 for DPD 1–30', () => {

  describe('Boundary: dpd1Date — entry (DPD=1)', () => {
    test('DB: ArrearsBucket = 1', () => { expect(ctx.stateAtDPD1.dbRecord.ArrearsBucket).toBe(1); });
    test('DB: DaysPastDue = 1',   () => { expect(ctx.stateAtDPD1.dbRecord.DaysPastDue).toBe(1); });
    test('API: arrearsBucket = 1',() => { expect(ctx.stateAtDPD1.searchResponse.arrearsBucket).toBe(1); });
  });

  describe('Boundary: dpd30Date — last day (DPD=30)', () => {
    test('DB: ArrearsBucket = 1', () => { expect(ctx.stateAtDPD30.dbRecord.ArrearsBucket).toBe(1); });
    test('DB: DaysPastDue = 30',  () => { expect(ctx.stateAtDPD30.dbRecord.DaysPastDue).toBe(30); });
    test('API: arrearsBucket = 1',() => { expect(ctx.stateAtDPD30.searchResponse.arrearsBucket).toBe(1); });
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-715 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:                ${ctx?.account?.odAccountNumber}`);
    console.log(`  dpd1Date  (DPD=1):  Bucket=${ctx?.stateAtDPD1?.dbRecord?.ArrearsBucket}`);
    console.log(`  dpd30Date (DPD=30): Bucket=${ctx?.stateAtDPD30?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(ctx.account.drawdownDate);
    await db.deleteStatementByDate(ctx.account.drawdownDate);
  });
});
