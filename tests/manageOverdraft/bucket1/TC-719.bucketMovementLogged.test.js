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

describe('CREDIT-TC-719 — Bucket Movement Logged at DPD=1 Boundary', () => {

  test('ActivityLog has a Change in Arrears Bucket entry at dpd1Date', () => {
    expect(ctx.stateAtDPD1.activityLog.some(e => e.transactionCategory === 'Change in Arrears Bucket')).toBe(true);
  });

  test('No Arrears Bucket Movement logged on lastSafeDate (DPD=0)', () => {
    const logAtDue = ctx.stateLastSafeDate.activityLog.filter(e => e.transactionCategory === 'Change in Arrears Bucket');
    expect(logAtDue.length).toBe(0);
  });

  test('Entry references Bucket 1', () => {
    const entry = ctx.stateAtDPD1.activityLog.find(e => e.transactionCategory === 'Change in Arrears Bucket');
    expect(entry.amount).toBe(1);
  });

  test('Entry is on the correct account', () => {
    const entry = ctx.stateAtDPD1.activityLog.find(e => e.transactionCategory === 'Change in Arrears Bucket');
    expect(entry.accountNumber).toBe(ctx.account.odAccountNumber);
  });

  afterAll(async () => {
    const entry = ctx.stateAtDPD1.activityLog?.find(e => e.transactionCategory === 'Change in Arrears Bucket');
    console.log(`\n  TC-719 | Log entry: ${entry?.description ?? 'not found'}\n`);
    await db.deleteDebtHistoryByDate(ctx.account.drawdownDate);
    await db.deleteStatementByDate(ctx.account.drawdownDate);
    await db.disconnect();
  });
});