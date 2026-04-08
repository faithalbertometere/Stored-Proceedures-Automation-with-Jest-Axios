/**
 * CREDIT-TC-714
 * Verify accounts are moved to Arrears Bucket 1 when DPD is 1
 * Boundary: dpd1Date
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-714 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_bucket1Account');
const { assertBucketState, assertStatus, assertAccountDisabled, STATUS } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-714 — Moves to Bucket 1 at DPD=1', () => {

  assertBucketState(() => ctx.stateAtDPD1, 1, 1, true);
  assertStatus(() => ctx.stateAtDPD1, STATUS.DEBT_DISABLED, 'DebtDisabled');
  assertAccountDisabled(() => ctx.stateAtDPD1);

  afterAll(async() => {
    console.log(`\n  TC-714 | dpd1Date: ${ctx?.dates?.dpd1Date} | DPD=${ctx?.stateAtDPD1?.dbRecord?.DaysPastDue} | Bucket=${ctx?.stateAtDPD1?.dbRecord?.ArrearsBucket} | Status=${ctx?.stateAtDPD1?.searchResponse?.status}\n`);
    await db.deleteDebtHistoryByDate(ctx.account.drawdownDate);
    await db.deleteStatementByDate(ctx.account.drawdownDate);
  });
});
