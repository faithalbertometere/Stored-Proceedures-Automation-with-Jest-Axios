/**
 * CREDIT-TC-1996
 * Verify Customer Moves to Bucket 2 if full Payment is made for Bucket 1 only
 *
 * Run: npx jest tests/manageOverdraft/bucket3/TC-1996 --runInBand
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

  const stmt1      = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const bucket1Pay = stmt1?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  console.log(`  [TC-1996] Bucket 1 only payment: ${bucket1Pay}`);
  await api.makeRepayment({ linkedAccountNumber: account.linkedAccountNumber, amount: bucket1Pay, instrumentNumber: generateInstrumentNumber() });
  const expectedBalance = account.searchResponse.overdrawnAmount - bucket1Pay;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const nextDay = dayjs(dpd61Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd61Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 3_600_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-1996 — Moves to Bucket 2 After Bucket 1 Payment (2+3 Unpaid)', () => {
  test('ArrearsBucket = 2 after Bucket 1 payment', () => { expect(stateAfterPayment.dbRecord.ArrearsBucket).toBe(2); });
  test('API arrearsBucket = 2', () => { expect(stateAfterPayment.searchResponse.arrearsBucket).toBe(2); });
  afterAll(() => { console.log(`\n  TC-1996 | Bucket: ${stateAfterPayment?.dbRecord?.ArrearsBucket}\n`); });
});
