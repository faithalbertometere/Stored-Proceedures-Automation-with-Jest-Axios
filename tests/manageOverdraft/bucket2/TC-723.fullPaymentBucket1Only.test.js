/**
 * CREDIT-TC-723
 * Verify Customer Moves to Arrears Bucket 1 if full Payment is made for Bucket 1
 * and no payment for Bucket 2
 *
 * Run: npx jest tests/manageOverdraft/bucket2/TC-723 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, runOnDate, getMilestoneDates, fetchBucketState, assertBucketState } = require('../_manageSetup');

let account, dates, stateAfterPayment;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);
  await runToPaymentDueDate(account);
  await runOnDate(dates.paymentDueDate, dates.dpd1Date,  account, dates);
  await runOnDate(dates.dpd1Date,       dates.dpd30Date, account, dates);
  const dpd31Date = await runOnDate(dates.dpd30Date, dates.dpd31Date, account, dates);

  // Fetch both cycle statements — Bucket 1 min = cycle 1 statement, Bucket 2 min = cycle 2 statement
  const stmt1 = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const bucket1Payment = stmt1?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  console.log(`  [TC-723] Paying Bucket 1 only: ${bucket1Payment}`);

  await api.makeRepayment({ linkedAccountNumber: account.linkedAccountNumber, amount: bucket1Payment, instrumentNumber: generateInstrumentNumber() });
  const expectedBalance = account.searchResponse.overdrawnAmount - bucket1Payment;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const nextDay = dayjs(dpd31Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd31Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 1_800_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-723 — Moves to Bucket 1 After Full Bucket 1 Payment (Bucket 2 Unpaid)', () => {
  assertBucketState(() => stateAfterPayment, expect.any(Number), 1);
  test('ArrearsBucket = 1 (dropped from 2, Bucket 2 still unpaid)', () => { expect(stateAfterPayment.dbRecord.ArrearsBucket).toBe(1); });
  afterAll(() => { console.log(`\n  TC-723 | Bucket after Bucket1 pay: ${stateAfterPayment?.dbRecord?.ArrearsBucket}\n`); });
});
