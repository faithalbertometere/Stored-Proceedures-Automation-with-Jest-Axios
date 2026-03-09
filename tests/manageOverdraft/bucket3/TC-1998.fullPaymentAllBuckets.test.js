/**
 * CREDIT-TC-1998
 * Verify Customer Moves to Bucket 0 Upon Making Required Payment for Bucket 1, 2 and 3
 *
 * Run: npx jest tests/manageOverdraft/bucket3/TC-1998 --runInBand
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
  await runOnDate(dates.dpd30Date,      dates.dpd31Date, account, dates);
  await runOnDate(dates.dpd31Date,      dates.dpd60Date, account, dates);
  const dpd61Date = await runOnDate(dates.dpd60Date, dates.dpd61Date, account, dates);

  const search      = await api.searchOverdraft(account.odAccountNumber);
  const fullPayment = search.paymentDueInfo?.reduce((s, p) => s + p.minimumPaymentBalance, 0) ?? search.overdrawnAmount;
  console.log(`  [TC-1998] Full payment (all buckets): ${fullPayment}`);
  await api.makeRepayment({ linkedAccountNumber: account.linkedAccountNumber, amount: fullPayment, instrumentNumber: generateInstrumentNumber() });
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance: 0 });

  const nextDay = dayjs(dpd61Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd61Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 3_600_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-1998 — Moves to Bucket 0 After Full Payment of All Buckets', () => {
  assertBucketState(() => stateAfterPayment, 0, 0);
  assertStatus(() => stateAfterPayment, STATUS.ACTIVE, 'Active');
  assertAccountReenabled(() => stateAfterPayment);
  afterAll(() => { console.log(`\n  TC-1998 | Bucket: ${stateAfterPayment?.dbRecord?.ArrearsBucket} | Status: ${stateAfterPayment?.searchResponse?.status}\n`); });
});
