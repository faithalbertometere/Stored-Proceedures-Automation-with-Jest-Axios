/**
 * CREDIT-TC-2006
 * Verify Accounts Are Moved to Arrears Bucket 4 When Minimum Payment Is Not Completed
 * after 30 days of entering Arrears Bucket 3
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2006 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_defaultAccount');
const { assertBucketState, assertStatus, STATUS } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 7_200_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-2006 — Account Moves to Bucket 4 / Default at DPD>=90', () => {
  // Bucket 4 = Default state, DPD >= 90
  test('DaysPastDue >= 90', () => { expect(ctx.state.dbRecord.DaysPastDue).toBeGreaterThanOrEqual(90); });
  test('isDefault = true', () => { expect(ctx.state.searchResponse.isDefault).toBe(true); });
  assertStatus(() => ctx.state, STATUS.DEBT_DISABLED_DEFAULT, 'DebtDisabledDefault');
  afterAll(() => { console.log(`\n  TC-2006 | DPD: ${ctx?.state?.dbRecord?.DaysPastDue} | isDefault: ${ctx?.state?.searchResponse?.isDefault}\n`); });
});
