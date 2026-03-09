/**
 * CREDIT-TC-722
 * Verify Customer Stays in Arrears Bucket 2 if partial Payment is made for Bucket 1
 * (Paying only Bucket 1 minimum while Bucket 2 debt remains)
 *
 * Run: npx jest tests/manageOverdraft/bucket2/TC-722 --runInBand
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
  const dpd31Date = await runOnDate(dates.dpd30Date, dates.dpd31Date, account, dates);

  // Pay only Bucket 1 portion (50% of minimumPaymentBalance)
  const statement   = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const bucket1Only = parseFloat((statement.MinimumPaymentBalance * 0.5).toFixed(2));
  console.log(`  [TC-722] Bucket 1 partial payment: ${bucket1Only}`);

  await api.makeRepayment({ linkedAccountNumber: account.linkedAccountNumber, amount: bucket1Only, instrumentNumber: generateInstrumentNumber() });
  const expectedBalance = account.searchResponse.overdrawnAmount - bucket1Only;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const nextDay = dayjs(dpd31Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd31Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 1_800_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-722 — Stays in Bucket 2 After Partial Bucket 1 Payment', () => {
  test('ArrearsBucket still = 2 after partial payment', () => { expect(stateAfterPayment.dbRecord.ArrearsBucket).toBe(2); });
  test('API arrearsBucket still = 2', () => { expect(stateAfterPayment.searchResponse.arrearsBucket).toBe(2); });
  test('overdrawnAmount is reduced', () => { expect(stateAfterPayment.searchResponse.overdrawnAmount).toBeLessThan(account.searchResponse.overdrawnAmount); });
  afterAll(() => { console.log(`\n  TC-722 | Bucket after partial pay: ${stateAfterPayment?.dbRecord?.ArrearsBucket}\n`); });
});
