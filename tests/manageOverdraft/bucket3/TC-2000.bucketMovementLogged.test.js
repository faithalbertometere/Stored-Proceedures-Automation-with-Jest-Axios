/**
 * CREDIT-TC-2000
 * Verify arrears bucket movement is logged on activity log (Bucket 2 → 3)
 * Checks ActivityLog at dpd61Date boundary
 *
 * Run: npx jest tests/manageOverdraft/bucket3/TC-2000 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket3Account');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-2000 — Bucket Movement Logged at DPD=61 Boundary', () => {

  test('ActivityLog has Arrears Bucket Movement entry at dpd61Date', () => {
    expect(ctx.stateAtDPD61.activityLog.some(e => e.transactionType === 'Arrears Bucket Movement')).toBe(true);
  });

  test('No Bucket 3 movement logged at dpd60Date (still in Bucket 2)', () => {
    const entriesAtDPD60 = ctx.stateAtDPD60.activityLog.filter(
      e => e.transactionType === 'Arrears Bucket Movement' && e.description?.match(/bucket 3|→ 3/i)
    );
    expect(entriesAtDPD60.length).toBe(0);
  });

  test('Entry at dpd61Date references Bucket 3', () => {
    const entries = ctx.stateAtDPD61.activityLog.filter(e => e.transactionType === 'Arrears Bucket Movement');
    expect(entries.some(e => e.description?.match(/3/))).toBe(true);
  });

  afterAll(() => {
    const entry = ctx.stateAtDPD61.activityLog?.find(e => e.transactionType === 'Arrears Bucket Movement');
    console.log(`\n  TC-2000 | Log entry: ${entry?.description ?? 'not found'}\n`);
  });
});
