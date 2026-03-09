/**
 * CREDIT-TC-718
 * Verify account is reenabled after repayment and less than 90 days due
 *
 * Run: npx jest tests/manageOverdraft/bucket1/TC-718 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, runOnDate, getMilestoneDates, fetchBucketState, assertStatus, assertAccountDisabled, assertAccountReenabled, STATUS } = require('../_manageSetup');

let account, dates, stateDisabled, stateReenabled;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);
  await runToPaymentDueDate(account);
  await runOnDate(dates.paymentDueDate, dates.dpd1Date, account, dates);
  stateDisabled = await fetchBucketState(account.odAccountNumber, dates.dpd1Date);

  // Make full minimum payment
  const statement  = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const minPayment = statement?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  await api.makeRepayment({ linkedAccountNumber: account.linkedAccountNumber, amount: minPayment, instrumentNumber: generateInstrumentNumber() });

  const expectedBalance = account.searchResponse.overdrawnAmount - minPayment;
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

  const nextDay = dayjs(dates.dpd1Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dates.dpd1Date, toDate: nextDay, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateReenabled = await fetchBucketState(account.odAccountNumber, nextDay);
}, 900_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-718 — Account Re-enabled After Repayment (DPD < 90)', () => {

  test('Status was DebtDisabled at DPD=1', () => {
    expect(stateDisabled.searchResponse.status).toBe(STATUS.DEBT_DISABLED);
  });

  assertStatus(() => stateReenabled, STATUS.ACTIVE, 'Active — re-enabled after payment');
  assertAccountReenabled(() => stateReenabled);

  test('ArrearsBucket = 0 after payment', () => {
    expect(stateReenabled.dbRecord.ArrearsBucket).toBe(0);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-718 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:       ${account?.odAccountNumber}`);
    console.log(`  Status at DPD=1:  ${stateDisabled?.searchResponse?.status}`);
    console.log(`  Status after pay: ${stateReenabled?.searchResponse?.status}`);
    console.log(`  Bucket after pay: ${stateReenabled?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
