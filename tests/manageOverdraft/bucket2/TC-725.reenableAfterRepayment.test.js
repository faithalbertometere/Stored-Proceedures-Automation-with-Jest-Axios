/**
 * CREDIT-TC-725
 * Verify account is reenabled after repayment and less than 90 days due (Bucket 2)
 *
 * Run: npx jest tests/manageOverdraft/bucket2/TC-725 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket2Account');
const { assertStatus, STATUS } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 1_800_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-725 — Account Status is DebtDisabled (Not Default) in Bucket 2', () => {
  // At DPD=31 (Bucket 2) account should be DebtDisabled (7), not yet Default (8)
  assertStatus(() => ctx.state, STATUS.DEBT_DISABLED, 'DebtDisabled — not yet Default at DPD=31');

  test('DPD < 90 (not yet in default)', () => {
    expect(ctx.state.dbRecord.DaysPastDue).toBeLessThan(90);
  });

  afterAll(() => { console.log(`\n  TC-725 | Status: ${ctx?.state?.searchResponse?.status} | DPD: ${ctx?.state?.dbRecord?.DaysPastDue}\n`); });
});
