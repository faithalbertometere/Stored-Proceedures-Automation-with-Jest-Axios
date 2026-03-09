/**
 * CREDIT-TC-716
 * Verify Customer Stays in Arrears Bucket 1 if partial Payment is made for Bucket 1
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-716 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, runOnDate, getMilestoneDates, fetchBucketState } = require('../_manageSetup');

let account, dates, stateBeforePayment, stateAfterPayment;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);
  await runToPaymentDueDate(account);
  await runOnDate(dates.paymentDueDate, dates.dpd1Date, account, dates);

  // Fetch statement for minimumPaymentBalance
  const statement  = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const minPayment = statement?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  const partial    = parseFloat((minPayment * 0.5).toFixed(2));   // pay only 50%

  console.log(`  [TC-716] Min payment: ${minPayment} | Partial (50%): ${partial}`);
  stateBeforePayment = await fetchBucketState(account.odAccountNumber, dates.dpd1Date);

  await api.makeRepayment({
    linkedAccountNumber: account.linkedAccountNumber,
    amount:              partial,
    instrumentNumber:    generateInstrumentNumber(),
  });

  const expectedBalance = account.searchResponse.overdrawnAmount - partial;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  // Run one more day of ManageOverdraft after partial payment
  const dayAfterDPD1 = dayjs(dates.dpd1Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dates.dpd1Date, toDate: dayAfterDPD1, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, dayAfterDPD1);
}, 900_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-716 — Stays in Bucket 1 After Partial Payment', () => {

  test('Before payment: ArrearsBucket = 1', () => {
    expect(stateBeforePayment.dbRecord.ArrearsBucket).toBe(1);
  });

  test('After partial payment: ArrearsBucket still = 1', () => {
    expect(stateAfterPayment.dbRecord.ArrearsBucket).toBe(1);
  });

  test('After partial payment: API arrearsBucket still = 1', () => {
    expect(stateAfterPayment.searchResponse.arrearsBucket).toBe(1);
  });

  test('After partial payment: overdrawnAmount is reduced', () => {
    expect(stateAfterPayment.searchResponse.overdrawnAmount)
      .toBeLessThan(account.searchResponse.overdrawnAmount);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-716 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:         ${account?.odAccountNumber}`);
    console.log(`  Bucket before pay:  ${stateBeforePayment?.dbRecord?.ArrearsBucket}`);
    console.log(`  Bucket after pay:   ${stateAfterPayment?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
