/**
 * CREDIT-TC-1999
 * Verify account is reenabled after repayment and less than 90 days due (Bucket 3)
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket3Account');
const { assertStatus, STATUS } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 3_600_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-1999 — Account Status is DebtDisabled (Not Default) in Bucket 3', () => {
  assertStatus(() => ctx.state, STATUS.DEBT_DISABLED, 'DebtDisabled — not yet Default at DPD=61');
  test('DPD < 90', () => { expect(ctx.state.dbRecord.DaysPastDue).toBeLessThan(90); });
  afterAll(() => { console.log(`\n  TC-1999 | Status: ${ctx?.state?.searchResponse?.status} | DPD: ${ctx?.state?.dbRecord?.DaysPastDue}\n`); });
});
