/**
 * CREDIT-TC-2004
 * Verify default status is logged on activity log
 * Boundary: dpd90Date — log entry should appear here, not at dpd89Date
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2004 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_defaultAccount');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-2004 — Default Status Logged at DPD=90 Boundary', () => {

  test('No default log entry at dpd89Date (not yet in default)', () => {
    const entries = ctx.stateAtDPD89.activityLog.filter(e =>
      e.transactionType === 'Account Default' || e.description?.toLowerCase().includes('default')
    );
    expect(entries.length).toBe(0);
  });

  test('Default log entry exists at dpd90Date', () => {
    expect(ctx.stateAtDPD90.activityLog.some(e =>
      e.transactionType === 'Account Default' ||
      e.transactionType === 'Default' ||
      e.description?.toLowerCase().includes('default')
    )).toBe(true);
  });

  test('Default log entry is on the correct account', () => {
    const entry = ctx.stateAtDPD90.activityLog.find(e =>
      e.transactionType === 'Account Default' || e.description?.toLowerCase().includes('default')
    );
    expect(entry).toBeDefined();
    expect(entry.accountNumber).toBe(ctx.account.odAccountNumber);
  });

  afterAll(() => {
    const entry = ctx.stateAtDPD90.activityLog?.find(e => e.description?.toLowerCase().includes('default'));
    console.log(`\n  TC-2004 | Default log: ${entry?.transactionType} — ${entry?.description}\n`);
  });
});
