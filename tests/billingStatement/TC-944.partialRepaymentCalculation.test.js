/**
 * CREDIT-TC-944
 * Verify Minimum Payment Calculation for Partial Repayment
 *
 * Run: npx jest tests/billingStatement/TC-944 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { getBillingDates, calcMinimumPayment } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');
const { PROCS, runEODUntil} = require('../../helpers/eodRunner');


const PARTIAL_REPAYMENT = 1000000;
let account, dates, statement, searchAfterRepayment, expectedAfterRepayment, totalMinimumPayment;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-944 — Minimum Payment Calculation for Partial Repayment', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount({ drawAmount: 3000000 });
    dates   = getBillingDates(account);

    // Partial repayment
    await api.makeRepayment(account.linkedAccountNumber, PARTIAL_REPAYMENT, generateInstrumentNumber());

    // Wait for background worker to apply repayment
    const expectedBalance = account.searchResponse.overdrawnAmount - PARTIAL_REPAYMENT;
    searchAfterRepayment  = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedBalance,
    });

    cycleRunDate = dates.statementRunDate;
    await runEODUntil({ fromDate: cycleRunDate, toDate: cycleRunDate, procs: [PROCS.RECONCILIATION, PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT] });

    const { overdrawnAmount, minimumPaymentPercentage } = searchAfterRepayment;
    totalMinimumPayment = calcMinimumPayment({
      principal:      overdrawnAmount,
      minPaymentRate:  minimumPaymentPercentage,
    });

    statement = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  }, 600_000);

  test('overdrawnAmount reduced after partial repayment', () => {
    expect(searchAfterRepayment.overdrawnAmount)
      .toBe(account.searchResponse.overdrawnAmount - PARTIAL_REPAYMENT);
  });

  test('Statement exists', () => {
    expect(statement).not.toBeNull();
  });

  test('OutstandingPrincipal = remaining balance after repayment', () => {
    expect(statement.OutstandingPrincipal).toBe(searchAfterRepayment.overdrawnAmount);
  });

  test('TotalMinimumPayment based on remaining principal', () => {
    expect(statement.TotalMinimumPayment).toBe(totalMinimumPayment);
  });

  test('Cycle BillingCycleStartDate = cycle start date', () => {
    expect(dayjs(statement.BillingCycleStartDate).format('YYYY-MM-DD')).toBe(dates.cycleStartDate);
  });
 
  test('API paymentDueInfo[0].paymentDueDate matches expected', async() => {
    const searchAfterBilling = await api.searchOverdraft(account.odAccountNumber);
    const apiMinPayment = searchAfterBilling.paymentDueInfo[0].minimumPaymentBalance
    const apiDueDate = dayjs(searchAfterBilling.paymentDueInfo[0].paymentDueDate).format('YYYY-MM-DD');

    expect(apiDueDate).toBe(dates.paymentDueDate);
    expect(apiMinPayment).toBe(statement.MinimumPaymentBalance);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-944 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:          ${account?.odAccountNumber}`);
    console.log(`  Original principal:  ${account?.searchResponse?.overdrawnAmount}`);
    console.log(`  Partial repayment:   ${PARTIAL_REPAYMENT}`);
    console.log(`  Remaining principal: ${searchAfterRepayment?.overdrawnAmount}`);
    console.log(`  Expected totalMin:   ${totalMinimumPayment}`);
    console.log(`  DB TotalMinimum:     ${statement?.TotalMinimumPayment}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(cycleRunDate);
    await db.deleteStatementByDate(cycleRunDate); 
  });
});
