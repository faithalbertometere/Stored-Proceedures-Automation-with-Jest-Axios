/**
 * CREDIT-TC-1995
 * Verify Customer Stays in Arrears Bucket 3 if partial Payment is made for Bucket 1
 *
 * Run: npx jest tests/manageOverdraft/bucket3/TC-1995 --runInBand
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

  const partial = parseFloat((account.searchResponse.overdrawnAmount * 0.1).toFixed(2));
  console.log(`  [TC-1995] Partial payment (10%): ${partial}`);
  await api.makeRepayment(account.linkedAccountNumber, partial, generateInstrumentNumber());
  const expectedBalance = account.searchResponse.overdrawnAmount - partial;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const nextDay = dayjs(dpd61Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd61Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 3_600_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-1995 — Stays in Bucket 3 After Partial Payment', () => {
  test('ArrearsBucket still = 3 after partial payment', () => { expect(stateAfterPayment.dbRecord.ArrearsBucket).toBe(3); });
  test('API arrearsBucket still = 3', () => { expect(stateAfterPayment.searchResponse.arrearsBucket).toBe(3); });
  afterAll(() => { console.log(`\n  TC-1995 | Bucket after partial pay: ${stateAfterPayment?.dbRecord?.ArrearsBucket}\n`); });
});
