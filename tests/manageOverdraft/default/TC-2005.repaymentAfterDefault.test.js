/**
 * CREDIT-TC-2005
 * Verify repayment after Default Flag is attached
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2005 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, runOnDate, getMilestoneDates, fetchBucketState, assertStatus, STATUS } = require('../_manageSetup');

let account, dates, stateAtDefault, stateAfterPayment;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);
  await runToPaymentDueDate(account);
  await runOnDate(dates.paymentDueDate, dates.dpd1Date,  account, dates);
  await runOnDate(dates.dpd1Date,       dates.dpd30Date, account, dates);
  await runOnDate(dates.dpd30Date,      dates.dpd31Date, account, dates);
  await runOnDate(dates.dpd31Date,      dates.dpd60Date, account, dates);
  await runOnDate(dates.dpd60Date,      dates.dpd61Date, account, dates);
  await runOnDate(dates.dpd61Date,      dates.dpd89Date, account, dates);
  const dpd91Date = await runOnDate(dates.dpd89Date, dates.dpd90Date, account, dates);
  stateAtDefault  = await fetchBucketState(account.odAccountNumber, dpd91Date);

  // Full repayment after default
  const search      = await api.searchOverdraft(account.odAccountNumber);
  const fullPayment = search.overdrawnAmount + search.accruedODInterest;
  console.log(`  [TC-2005] Repayment after default: ${fullPayment}`);
  await api.makeRepayment(account.linkedAccountNumber, fullPayment, generateInstrumentNumber());
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance: 0 });

  const nextDay = dayjs(dpd91Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd91Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterPayment = await fetchBucketState(account.odAccountNumber, nextDay);
}, 7_200_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-2005 — Repayment After Default Flag', () => {
  test('Status was DebtDisabledDefault at DPD=91', () => {
    expect(stateAtDefault.searchResponse.status).toBe(STATUS.DEBT_DISABLED_DEFAULT);
  });

  test('After full repayment: overdrawnAmount = 0', () => {
    expect(stateAfterPayment.searchResponse.overdrawnAmount).toBe(0);
  });

  test('After full repayment: status transitions away from Default', () => {
    // Status should move to Active(2) or at minimum no longer be Default(8)
    expect(stateAfterPayment.searchResponse.status).not.toBe(STATUS.DEBT_DISABLED_DEFAULT);
  });

  test('ArrearsBucket = 0 after full repayment', () => {
    expect(stateAfterPayment.dbRecord.ArrearsBucket).toBe(0);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-2005 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  Status at default:   ${stateAtDefault?.searchResponse?.status}`);
    console.log(`  Status after pay:    ${stateAfterPayment?.searchResponse?.status}`);
    console.log(`  Bucket after pay:    ${stateAfterPayment?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
