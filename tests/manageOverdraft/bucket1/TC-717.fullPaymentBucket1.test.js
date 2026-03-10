/**
 * CREDIT-TC-717
 * Verify Customer Moves to Arrears Bucket 0 Upon Making Required Payment for Bucket 1
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-717 --runInBand
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
  dates   = await runToPaymentDueDate(account);
  await runOnDate(dates.paymentDueDate, dates.dpd1Date, account, dates);

  const statement  = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const minPayment = statement?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  console.log(`  [TC-717] Full minimum payment: ${minPayment}`);

  await api.makeRepayment(account.linkedAccountNumber, minPayment, generateInstrumentNumber());

  const expectedBalance = account.searchResponse.overdrawnAmount - minPayment;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const dayAfterDPD1 = dayjs(dates.dpd1Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dates.dpd1Date, toDate: dayAfterDPD1, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, dayAfterDPD1);
}, 900_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-717 — Moves to Bucket 0 After Required Payment for Bucket 1', () => {

  assertBucketState(() => stateAfterPayment, 0, 0);
  assertStatus(() => stateAfterPayment, STATUS.ACTIVE, 'Active');
  assertAccountReenabled(() => stateAfterPayment);

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-717 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:    ${account?.odAccountNumber}`);
    console.log(`  ArrearsBucket: ${stateAfterPayment?.dbRecord?.ArrearsBucket}`);
    console.log(`  DaysPastDue:   ${stateAfterPayment?.dbRecord?.DaysPastDue}`);
    console.log(`  Status:        ${stateAfterPayment?.searchResponse?.status}`);
    console.log('══════════════════════════════════════════\n');
  });
});
