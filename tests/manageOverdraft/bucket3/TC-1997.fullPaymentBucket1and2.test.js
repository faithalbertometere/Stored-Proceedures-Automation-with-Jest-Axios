/**
 * CREDIT-TC-1997
 * Verify Customer Moves to Bucket 1 if full Payment is made for Bucket 1 and 2, Bucket 3 unpaid
 *
 * Run: npx jest tests/manageOverdraft/bucket3/TC-1997 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, runOnDate, getMilestoneDates, fetchBucketState } = require('../_manageSetup');

let account, dates, stateAfterPayment;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);
  await runToPaymentDueDate(account);
  await runOnDate(dates.paymentDueDate, dates.dpd1Date,  account, dates);
  await runOnDate(dates.dpd1Date,       dates.dpd30Date, account, dates);
  await runOnDate(dates.dpd30Date,      dates.dpd31Date, account, dates);
  await runOnDate(dates.dpd31Date,      dates.dpd60Date, account, dates);
  const dpd61Date = await runOnDate(dates.dpd60Date, dates.dpd61Date, account, dates);

  // Pay Bucket 1 + Bucket 2 minimums — use sum of first 2 paymentDueInfo entries
  const search = await api.searchOverdraft(account.odAccountNumber);
  const dueInfos = search.paymentDueInfo ?? [];
  const payment  = dueInfos.slice(0, 2).reduce((s, p) => s + p.minimumPaymentBalance, 0)
                || parseFloat((account.searchResponse.overdrawnAmount * 0.4).toFixed(2));
  console.log(`  [TC-1997] Bucket 1+2 payment: ${payment}`);
  await api.makeRepayment(account.linkedAccountNumber, payment, generateInstrumentNumber());
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance: account.searchResponse.overdrawnAmount - payment });

  const nextDay = dayjs(dpd61Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd61Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 3_600_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-1997 — Moves to Bucket 1 After Bucket 1+2 Payment (Bucket 3 Unpaid)', () => {
  test('ArrearsBucket = 1', () => { expect(stateAfterPayment.dbRecord.ArrearsBucket).toBe(1); });
  test('API arrearsBucket = 1', () => { expect(stateAfterPayment.searchResponse.arrearsBucket).toBe(1); });
  afterAll(() => { console.log(`\n  TC-1997 | Bucket: ${stateAfterPayment?.dbRecord?.ArrearsBucket}\n`); });
});
