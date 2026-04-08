/**
 * CREDIT-TC-718
 * Verify account is reenabled after repayment and less than 90 days due
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-718 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, getMilestoneDates, fetchBucketState, assertStatus, assertAccountReenabled, STATUS } = require('../_manageSetup');

let account, dates, stateDisabled, stateReenabled;

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
  stateDisabled = await fetchBucketState(account.odAccountNumber, dates.dpd1Date);

  const statement  = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const minPayment = statement?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  await api.makeRepayment(account.linkedAccountNumber, minPayment, generateInstrumentNumber());

  const expectedBalance = account.searchResponse.overdrawnAmount - minPayment;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const nextDay = dayjs(dates.dpd1Date).add(1, 'day').format('YYYY-MM-DD');
  await runEODUntil({
    fromDate: nextDay,
    toDate:   nextDay,
    procs:    [PROCS.RECONCILIATION, PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });
  stateReenabled = await fetchBucketState(account.odAccountNumber, nextDay);
}, 900_000);

describe('CREDIT-TC-718 — Account Re-enabled After Repayment (DPD < 90)', () => {

  test('Status was DebtDisabled at DPD=1', () => {
    expect(stateDisabled.searchResponse.status).toBe(STATUS.DEBT_DISABLED);
  });

  assertStatus(() => stateReenabled, STATUS.ACTIVE, 'Active — re-enabled after payment');
  assertAccountReenabled(() => stateReenabled);

  test('ArrearsBucket = 0 after payment', () => {
    expect(stateReenabled.dbRecord.ArrearsBucket).toBe(0);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-718 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:       ${account?.odAccountNumber}`);
    console.log(`  Status at DPD=1:  ${stateDisabled?.searchResponse?.status}`);
    console.log(`  Status after pay: ${stateReenabled?.searchResponse?.status}`);
    console.log(`  Bucket after pay: ${stateReenabled?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(account.drawdownDate);
    await db.deleteStatementByDate(account.drawdownDate);
    await db.disconnect();
  });
});