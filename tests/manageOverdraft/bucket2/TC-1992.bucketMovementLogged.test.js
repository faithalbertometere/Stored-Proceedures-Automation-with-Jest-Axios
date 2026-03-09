/**
 * CREDIT-TC-1992
 * Verify arrears bucket movement is logged on activity log (Bucket 1 → 2)
 * Checks ActivityLog at dpd31Date boundary
 *
 * Run: npx jest tests/manageOverdraft/bucket2/TC-1992 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket2Account');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-1992 — Bucket Movement Logged at DPD=31 Boundary', () => {

  test('ActivityLog has Arrears Bucket Movement entry at dpd31Date', () => {
    expect(ctx.stateAtDPD31.activityLog.some(e => e.transactionType === 'Arrears Bucket Movement')).toBe(true);
  });

  test('No Bucket 2 movement logged at dpd30Date (still in Bucket 1)', () => {
    const entriesAtDPD30 = ctx.stateAtDPD30.activityLog.filter(
      e => e.transactionType === 'Arrears Bucket Movement' && e.description?.match(/bucket 2|→ 2/i)
    );
    expect(entriesAtDPD30.length).toBe(0);
  });

  test('Entry at dpd31Date references Bucket 2', () => {
    const entries = ctx.stateAtDPD31.activityLog.filter(e => e.transactionType === 'Arrears Bucket Movement');
    expect(entries.some(e => e.description?.match(/2/))).toBe(true);
  });

  afterAll(() => {
    const entry = ctx.stateAtDPD31.activityLog?.find(e => e.transactionType === 'Arrears Bucket Movement');
    console.log(`\n  TC-1992 | Log entry: ${entry?.description ?? 'not found'}\n`);
  });
});
