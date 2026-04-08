/**
 * CREDIT-TC-717
 * Verify Customer Moves to Arrears Bucket 0 Upon Making Required Payment for Bucket 1
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-717 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, getMilestoneDates, fetchBucketState, assertBucketState, assertStatus, assertAccountReenabled, STATUS } = require('../_manageSetup');

let account, dates, stateAfterPayment, minPayment;

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

  const statement = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  minPayment      = statement?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  console.log(`  [TC-717] Full minimum payment: ${minPayment}`);

  await api.makeRepayment(account.linkedAccountNumber, minPayment, generateInstrumentNumber());

  const expectedBalance = account.searchResponse.overdrawnAmount - minPayment;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const dayAfterDPD1 = dayjs(dates.dpd1Date).add(1, 'day').format('YYYY-MM-DD');
  await runEODUntil({
    fromDate: dayAfterDPD1,
    toDate:   dayAfterDPD1,
    procs:    [PROCS.RECONCILIATION, PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, dayAfterDPD1);
}, 900_000);

describe('CREDIT-TC-717 — Moves to Bucket 0 After Required Payment for Bucket 1', () => {

  assertBucketState(() => stateAfterPayment, 0, 0);
  assertStatus(() => stateAfterPayment, STATUS.ACTIVE, 'Active');
  assertAccountReenabled(() => stateAfterPayment);

  test('After full payment: overdrawnAmount = original - minPayment', () => {
    const expectedBalance = account.searchResponse.overdrawnAmount - minPayment;
    expect(stateAfterPayment.searchResponse.overdrawnAmount).toBe(expectedBalance);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-717 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:    ${account?.odAccountNumber}`);
    console.log(`  ArrearsBucket: ${stateAfterPayment?.dbRecord?.ArrearsBucket}`);
    console.log(`  DaysPastDue:   ${stateAfterPayment?.dbRecord?.DaysPastDue}`);
    console.log(`  Status:        ${stateAfterPayment?.searchResponse?.status}`);
    console.log('══════════════════════════════════════════\n');
    // await db.deleteDebtHistoryByDate(account.drawdownDate);
    // await db.deleteStatementByDate(account.drawdownDate);
    await db.disconnect();
  });
});