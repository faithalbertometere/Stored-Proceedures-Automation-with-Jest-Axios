/**
 * CREDIT-TC-724
 * Verify Customer Moves to Arrears Bucket 0 Upon Making Required Payment for Bucket 1 and 2
 *
 * Run: npx jest tests/manageOverdraft/bucket2/TC-724 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, runOnDate, getMilestoneDates, fetchBucketState, assertBucketState, assertStatus, assertAccountReenabled, STATUS } = require('../_manageSetup');

let account, dates, stateAfterPayment;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  await runToPaymentDueDate(account);
  dates           = getMilestoneDates(account);
  await runOnDate(dates.paymentDueDate, dates.dpd1Date,  account, dates);
  await runOnDate(dates.dpd1Date,       dates.dpd30Date, account, dates);
  const dpd31Date = await runOnDate(dates.dpd30Date, dates.dpd31Date, account, dates);

  // Full payment for both buckets = full minimumPaymentBalance from SearchOverdraft
  const search      = await api.searchOverdraft(account.odAccountNumber);
  const fullPayment = search.paymentDueInfo?.reduce((sum, p) => sum + p.minimumPaymentBalance, 0)
                   ?? search.overdrawnAmount;
  console.log(`  [TC-724] Full payment (Bucket 1+2): ${fullPayment}`);

  await api.makeRepayment(account.linkedAccountNumber, fullPayment, generateInstrumentNumber());
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance: 0 });

  const nextDay = dayjs(dpd31Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd31Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 1_800_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-724 — Moves to Bucket 0 After Full Payment of Bucket 1 and 2', () => {
  assertBucketState(() => stateAfterPayment, 0, 0);
  assertStatus(() => stateAfterPayment, STATUS.ACTIVE, 'Active');
  assertAccountReenabled(() => stateAfterPayment);
  afterAll(() => { console.log(`\n  TC-724 | Bucket: ${stateAfterPayment?.dbRecord?.ArrearsBucket} | Status: ${stateAfterPayment?.searchResponse?.status}\n`); });
});
