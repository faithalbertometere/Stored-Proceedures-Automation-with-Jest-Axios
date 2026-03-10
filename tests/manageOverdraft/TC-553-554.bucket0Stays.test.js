/**
 * CREDIT-TC-553  Verify accounts remain in Arrears bucket 0 if at least Minimum Payment is done as at when due
 * CREDIT-TC-554  Verify accounts remain in Arrears bucket 0 if no outstanding debt at the end of the cycle
 *
 * Shared account: draw down, run to paymentDueDate, make minimum payment,
 * confirm bucket stays at 0 after ManageOverdraft runs.
 *
 * Run: npx jest tests/manageOverdraft/TC-553-554 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount }   = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');
const {
  runToPaymentDueDate,
  fetchBucketState,
  assertBucketState,
  assertStatus,
  STATUS,
} = require('./_manageSetup');

// ── TC-553: minimum payment made on time ──────────────────────────────────────
describe('CREDIT-TC-553 — Bucket 0 When Minimum Payment Made on Time', () => {

  let account, dates, stateOnDueDate, stateAfterPayment;

  beforeAll(async () => {
    await db.connect();
    account = await setupOverdraftAccount();
    dates   = await runToPaymentDueDate(account);

    // Fetch statement to get minimumPaymentBalance
    const statement = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
    const minPayment = statement?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
    console.log(`  [TC-553] Making minimum payment: ${minPayment}`);

    await api.makeRepayment(account.linkedAccountNumber, minPayment, generateInstrumentNumber());

    // Wait for worker to process repayment
    const expectedBalance = account.searchResponse.overdrawnAmount - minPayment;
    await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance });

    // Run ManageOverdraft on paymentDueDate after payment
    await continueEODUntil({
      lastDate: dayjs(dates.paymentDueDate).subtract(1, 'day').format('YYYY-MM-DD'),
      toDate:   dates.paymentDueDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
    });

    stateAfterPayment = await fetchBucketState(account.odAccountNumber, dates.paymentDueDate);
  }, 900_000);

  afterAll(async () => { await db.disconnect(); });

  assertBucketState(() => stateAfterPayment, 0, 0);
  assertStatus(() => stateAfterPayment, STATUS.ACTIVE, 'Active');

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-553 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:    ${account?.odAccountNumber}`);
    console.log(`  paymentDueDate:${dates?.paymentDueDate}`);
    console.log(`  DaysPastDue:   ${stateAfterPayment?.dbRecord?.DaysPastDue}`);
    console.log(`  ArrearsBucket: ${stateAfterPayment?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});


// ── TC-554: no outstanding debt ───────────────────────────────────────────────
describe('CREDIT-TC-554 — Bucket 0 When No Outstanding Debt at End of Cycle', () => {

  let account, dates, stateAfterRepayment;

  beforeAll(async () => {
    await db.connect();
    account = await setupOverdraftAccount();
    dates   = await runToPaymentDueDate(account);

    // Full repayment before paymentDueDate
    const search     = await api.searchOverdraft(account.odAccountNumber);
    const totalOwed  = search.overdrawnAmount + search.accruedODInterest;
    console.log(`  [TC-554] Full repayment: ${totalOwed}`);

    await api.makeRepayment(account.linkedAccountNumber, totalOwed, generateInstrumentNumber(),);

    await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance: 0 });

    await continueEODUntil({
      lastDate: dayjs(dates.paymentDueDate).subtract(1, 'day').format('YYYY-MM-DD'),
      toDate:   dates.paymentDueDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
    });

    stateAfterRepayment = await fetchBucketState(account.odAccountNumber, dates.paymentDueDate);
  }, 900_000);

  afterAll(async () => { await db.disconnect(); });

  test('overdrawnAmount = 0 after full repayment', () => {
    expect(stateAfterRepayment.searchResponse.overdrawnAmount).toBe(0);
  });

  assertBucketState(() => stateAfterRepayment, 0, 0);

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-554 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:    ${account?.odAccountNumber}`);
    console.log(`  overdrawnAmt:  ${stateAfterRepayment?.searchResponse?.overdrawnAmount}`);
    console.log(`  ArrearsBucket: ${stateAfterRepayment?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
  });
});
