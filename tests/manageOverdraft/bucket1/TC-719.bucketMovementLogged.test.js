/**
 * CREDIT-TC-719
 * Verify arrears bucket movement is logged on activity log (Bucket 0 → 1)
 * Checks ActivityLog at dpd1Date boundary
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-719 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket1Account');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-719 — Bucket Movement Logged at DPD=1 Boundary', () => {

  test('ActivityLog has an Arrears Bucket Movement entry at dpd1Date', () => {
    expect(ctx.stateAtDPD1.activityLog.some(e => e.transactionType === 'Arrears Bucket Movement')).toBe(true);
  });

  test('No Arrears Bucket Movement logged on paymentDueDate (DPD=0)', () => {
    // At DPD=0 no transition should have been logged yet
    const logAtDue = ctx.stateAtDue.activityLog.filter(e => e.transactionType === 'Arrears Bucket Movement');
    expect(logAtDue.length).toBe(0);
  });

  test('Entry references Bucket 1', () => {
    const entry = ctx.stateAtDPD1.activityLog.find(e => e.transactionType === 'Arrears Bucket Movement');
    expect(entry.description).toMatch(/1/);
  });

  test('Entry is on the correct account', () => {
    const entry = ctx.stateAtDPD1.activityLog.find(e => e.transactionType === 'Arrears Bucket Movement');
    expect(entry.accountNumber).toBe(ctx.account.odAccountNumber);
  });

  afterAll(() => {
    const entry = ctx.stateAtDPD1.activityLog?.find(e => e.transactionType === 'Arrears Bucket Movement');
    console.log(`\n  TC-719 | Log entry: ${entry?.description ?? 'not found'}\n`);
  });
});
