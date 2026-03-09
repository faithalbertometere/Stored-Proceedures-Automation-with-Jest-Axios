/**
 * CREDIT-TC-555
 * Verify accounts are moved to DPD=1 when minimum payment is not done before payment due date
 * Boundary: paymentDueDate (DPD=0) → dpd1Date (DPD=1)
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-555 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket1Account');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-555 — Moves to DPD=1 When Minimum Payment Not Made', () => {

  describe('Boundary: paymentDueDate — DPD=0 (last safe day)', () => {
    test('DB: DaysPastDue = 0 on paymentDueDate', () => {
      expect(ctx.stateAtDue.dbRecord.DaysPastDue).toBe(0);
    });
    test('DB: ArrearsBucket = 0 on paymentDueDate', () => {
      expect(ctx.stateAtDue.dbRecord.ArrearsBucket).toBe(0);
    });
    test('API: arrearsBucket = 0 on paymentDueDate', () => {
      expect(ctx.stateAtDue.searchResponse.arrearsBucket).toBe(0);
    });
  });

  describe('Boundary: dpd1Date — DPD=1 (entry into Bucket 1)', () => {
    test('DB: DaysPastDue = 1 on dpd1Date', () => {
      expect(ctx.stateAtDPD1.dbRecord.DaysPastDue).toBe(1);
    });
    test('DB: ArrearsBucket = 1 on dpd1Date', () => {
      expect(ctx.stateAtDPD1.dbRecord.ArrearsBucket).toBe(1);
    });
    test('API: arrearsBucket = 1 on dpd1Date', () => {
      expect(ctx.stateAtDPD1.searchResponse.arrearsBucket).toBe(1);
    });
    test('DB: FinancialDate = dpd1Date', () => {
      expect(dayjs(ctx.stateAtDPD1.dbRecord.FinancialDate).format('YYYY-MM-DD')).toBe(ctx.dates.dpd1Date);
    });
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-555 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:                ${ctx?.account?.odAccountNumber}`);
    console.log(`  paymentDueDate (DPD=0):    Bucket=${ctx?.stateAtDue?.dbRecord?.ArrearsBucket}`);
    console.log(`  dpd1Date       (DPD=1):    Bucket=${ctx?.stateAtDPD1?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
