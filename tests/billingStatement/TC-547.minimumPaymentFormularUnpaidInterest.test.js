/**
 * CREDIT-TC-692 (billing variant)
 * Verify minimum payment after interest repayment within cycle
 *
 * Scenario:
 *   - Interest accrues on cycleStartDate
 *   - Customer repays interest only (principal unchanged)
 *   - Interest accrues again on statementRunDate
 *   - BillingStatement runs on statementRunDate
 *
 * Expected:
 *   InterestCharged     = 2 days of accrual (both runs logged)
 *   UnpaidInterest      = 1 day of accrual (only statementRunDate interest unpaid)
 *   TotalMinimumPayment = PrincipalMinimumPayment + InterestCharged
 *
 * Run: npx jest tests/billingStatement/TC-692-billing --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { getBillingDates, calcDailyInterest, calcMinimumPayment } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

let account, dates, statement, searchResponse, expected;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-547-billing — Minimum Payment After Interest Repayment Within Cycle', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();
    dates   = getBillingDates(account);

    const { overdrawnAmount, interestRate, minimumPaymentPercentage } = account.searchResponse;

    // Day 1: cycleStartDate — accrue interest
    await runEODUntil({
      fromDate: dates.cycleStartDate,
      toDate:   dates.cycleStartDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.MANAGE_OVERDRAFT],
    });

    // Fetch interest from DebtHistory (next day's record picks it up)
    await runEODUntil({
      fromDate: dayjs(dates.cycleStartDate).add(1, 'day').format('YYYY-MM-DD'),
      toDate:   dayjs(dates.cycleStartDate).add(1, 'day').format('YYYY-MM-DD'),
      procs:    [PROCS.DEBT_HISTORY],
    });

    const search = await api.searchOverdraft(account.odAccountNumber);
    const interestToRepay = search.accruedODInterest;

    // Repay interest only — principal unchanged
    await api.makeRepayment(account.linkedAccountNumber, interestToRepay, generateInstrumentNumber());
    await api.waitForRepaymentProcessed({accountNumber: account.odAccountNumber, expectedInterest: 0});

    console.log(`  [TC-692-billing] Interest repaid: ${interestToRepay}`);

    // statementRunDate — accrue interest again + run billing statement
    await runEODUntil({
      fromDate: dates.statementRunDate,
      toDate:   dates.statementRunDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.BILLING_STATEMENT, PROCS.MANAGE_OVERDRAFT],
    });

    const dailyInterest       = calcDailyInterest(overdrawnAmount, interestRate);
    const interestCharged     = dailyInterest * 2;
    const unpaidInterest      = dailyInterest * 1;
    const principalMinPayment = calcMinimumPayment({ principal: overdrawnAmount, minPaymentRate: minimumPaymentPercentage });
    const totalMinimumPayment = (principalMinPayment + unpaidInterest);

    expected = { principalMinPayment, interestCharged, unpaidInterest, totalMinimumPayment };

    [statement, searchResponse] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate),
      api.searchOverdraft(account.odAccountNumber),
    ]);
  }, 600_000);

  test('OverdraftStatements record created for statement stamp date', () => {
    expect(statement).not.toBeNull();
  });

  test('DB PrincipalMinimumPayment = minimumPaymentPercentage/100 × principal', () => {
    expect(statement.PrincipalMinimumPayment).toBe(expected.principalMinPayment);
  });

  test('DB InterestCharged = 2 days of accrual', () => {
    expect(statement.InterestCharged).toBe(expected.interestCharged);
  });

  test('DB UnpaidInterest = 1 day of accrual (first interest was repaid)', () => {
    expect(statement.UnpaidInterest).toBe(expected.unpaidInterest);
  });

  test('DB TotalMinimumPayment = PrincipalMinimumPayment + InterestCharged', () => {
    expect(statement.TotalMinimumPayment).toBe(expected.totalMinimumPayment);
  });

  test('DB MinimumPaymentBalance = TotalMinimumPayment (no payment yet)', () => {
    expect(statement.MinimumPaymentBalance).toBe(statement.TotalMinimumPayment);
  });

  test('API paymentDueInfo[0].minimumPaymentBalance matches DB', () => {
    const apiMinPayment = searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
    expect(apiMinPayment).toBe(statement.MinimumPaymentBalance);
  });

  test('API paymentDueInfo[0].paymentDueDate matches expected', () => {
    const apiDueDate = dayjs(searchResponse.paymentDueInfo?.[0]?.paymentDueDate).format('YYYY-MM-DD');
    expect(apiDueDate).toBe(dates.paymentDueDate);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-692-billing — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:              ${account?.odAccountNumber}`);
    console.log(`  Cycle:                   ${dates?.cycleStartDate} → ${dates?.cycleEndDate}`);
    console.log(`  Expected principalMin:   ${expected?.principalMinPayment}`);
    console.log(`  Expected interestCharged:${expected?.interestCharged}`);
    console.log(`  Expected unpaidInterest: ${expected?.unpaidInterest}`);
    console.log(`  Expected totalMin:       ${expected?.totalMinimumPayment}`);
    console.log(`  DB TotalMinimumPayment:  ${statement?.TotalMinimumPayment}`);
    console.log(`  DB UnpaidInterest:       ${statement?.UnpaidInterest}`);
    console.log(`  API minimumPayment:      ${searchResponse?.paymentDueInfo?.[0]?.minimumPaymentBalance}`);
    console.log('══════════════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(dates.cycleStartDate);
    await db.deleteStatementByDate(dates.cycleEndDate);
  });
});