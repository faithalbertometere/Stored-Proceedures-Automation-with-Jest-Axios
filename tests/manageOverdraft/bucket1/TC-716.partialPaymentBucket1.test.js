/**
 * CREDIT-TC-716
 * Verify Customer Stays in Arrears Bucket 1 if partial Payment is made for Bucket 1
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-716 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, getMilestoneDates, fetchBucketState } = require('../_manageSetup');

let account, dates, stateBeforePayment, stateAfterPayment, partial;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);

  await runToPaymentDueDate(account);

  await runEODUntil({
    fromDate: dates.dpd1Date,
    toDate:   dates.dpd1Date,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  const statement  = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const minPayment = statement?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  partial    = Math.floor(minPayment * 0.5);

  console.log(`  [TC-716] Min payment: ${minPayment} | Partial (50%): ${partial}`);
  stateBeforePayment = await fetchBucketState(account.odAccountNumber, dates.dpd1Date);

  await api.makeRepayment(account.linkedAccountNumber, partial, generateInstrumentNumber());

  const expectedBalance = account.searchResponse.overdrawnAmount - partial;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const dayAfterDPD1 = dayjs(dates.dpd1Date).add(1, 'day').format('YYYY-MM-DD');
  await runEODUntil({
    fromDate: dayAfterDPD1,
    toDate:   dayAfterDPD1,
    procs:    [PROCS.RECONCILIATION, PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, dayAfterDPD1);
}, 900_000);

afterAll(async () => {await db.disconnect();});

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
    const expectedBalance = account.searchResponse.overdrawnAmount - partial;
  expect(stateAfterPayment.searchResponse.overdrawnAmount).toBe(expectedBalance);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-716 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:         ${account?.odAccountNumber}`);
    console.log(`  Bucket before pay:  ${stateBeforePayment?.dbRecord?.ArrearsBucket}`);
    console.log(`  Bucket after pay:   ${stateAfterPayment?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(account.drawdownDate);
    await db.deleteStatementByDate(account.drawdownDate);
  });
});