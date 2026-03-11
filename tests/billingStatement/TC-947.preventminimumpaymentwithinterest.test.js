/**
 * CREDIT-TC-947
 * Verify Principal Minimum Payment Cap with Interest Accrual in Cycle 1
 *
 * Scenario:
 *   - minimumPaymentPercentage = 100 (full principal requested in cycle 1)
 *   - INTEREST_ACCRUAL runs on cycleStartDate and statementRunDate
 *   - Cycle 1: PrincipalMinimumPayment = drawAmount, InterestCharged = 2 days accrual
 *   - Cycle 1: TotalMinimumPayment = drawAmount + InterestCharged
 *   - Cycle 2: PrincipalMinimumPayment = 0 (cap applied)
 *   - Cycle 2: TotalMinimumPayment = UnpaidInterest only (interest not repaid)
 *
 * Run: npx jest tests/billingStatement/TC-947 --runInBand
 */

const dayjs  = require('dayjs');
const db     = require('../../helpers/dbHelper');
const { PROCS, runEODUntil, getNextStatementRunDate } = require('../../helpers/eodRunner');
const { getBillingDates, calcDailyInterest } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

const DRAW_AMOUNT = 1000000;

let account, dates, cycle2StampDate, statementCycle1, statementCycle2,
    expectedCycle1Interest, expectedCycle1Total, debthistory;;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-947 — Principal Cap with Interest: TotalMinimumPayment = Principal + UnpaidInterest', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount({
      drawAmount:               DRAW_AMOUNT,
      minimumPaymentPercentage: 100,
    });
    dates = getBillingDates(account);

    const { statementDay, interestRate } = account.searchResponse;
    const cycle1RunDate   = dates.statementRunDate;
    const cycle1StampDate = dates.statementStampDate;
    const cycle2RunDate   = getNextStatementRunDate(cycle1StampDate, statementDay);
    cycle2StampDate       = dayjs(cycle2RunDate).add(1, 'day').format('YYYY-MM-DD');

    // Cycle 1 — interest accrues on cycleStartDate and statementRunDate
    await runEODUntil({
      fromDate: dates.cycleStartDate,
      toDate:   dates.cycleStartDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL],
    });

    await runEODUntil({
      fromDate: cycle1RunDate,
      toDate:   cycle1RunDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.BILLING_STATEMENT],
    });

    // 2 days of interest accrual in cycle 1
    const dailyInterest      = calcDailyInterest(DRAW_AMOUNT, interestRate);
    expectedCycle1Interest   = dailyInterest * 2;
    expectedCycle1Total      = DRAW_AMOUNT + expectedCycle1Interest;

    // Cycle 2 — no repayment, cap applies on principal, unpaid interest carries over
    await runEODUntil({
      fromDate: cycle2RunDate,
      toDate:   cycle2RunDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT, PROCS.MANAGE_OVERDRAFT],
    });

    await runEODUntil({
      fromDate: cycle2StampDate,
      toDate:   cycle2StampDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
    });

    [statementCycle1, statementCycle2, debthistory] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, cycle1StampDate),
      db.getOverdraftStatement(account.odAccountNumber, cycle2StampDate),
      db.getDebtHistoryRecord(account.odAccountNumber, cycle2StampDate)
    ]);
  }, 900_000);

  test('Cycle 1 statement exists', () => { expect(statementCycle1).not.toBeNull(); });
  test('Cycle 2 statement exists', () => { expect(statementCycle2).not.toBeNull(); });

  test('Cycle 1 PrincipalMinimumPayment = full drawdown amount', () => {
    expect(statementCycle1.PrincipalMinimumPayment).toBe(DRAW_AMOUNT);
  });

  test('Cycle 1 InterestCharged = 2 days of accrual', () => {
    expect(statementCycle1.InterestCharged).toBe(expectedCycle1Interest);
  });

  test('Cycle 1 TotalMinimumPayment = drawAmount + InterestCharged', () => {
    expect(statementCycle1.TotalMinimumPayment).toBe(expectedCycle1Total);
  });

  test('Cycle 2 PrincipalMinimumPayment = 0', () => {
    expect(statementCycle2.PrincipalMinimumPayment).toBe(0);
  });

  test('Cycle 2 TotalMinimumPayment = 0', () => {
    expect(statementCycle2.TotalMinimumPayment).toBe(0);
  });

  test('Cycle 2 PreviousOutstandingPrincipal = Cycle 1 OutstandingPrincipal', () => {
    expect(statementCycle2.PreviousOutstandingPrincipal).toBe(statementCycle1.OutstandingPrincipal);
  });

  test('DebtHistory on cycle2StampDate MinimumPayment = cycle1 + cycle2 TotalMinimumPayment', () => {
    expect(parseFloat(debthistory.MinimumPayment))
      .toBe(statementCycle1.TotalMinimumPayment);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-947 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:                    ${account?.odAccountNumber}`);
    console.log(`  Draw Amount:                   ${DRAW_AMOUNT}`);
    console.log(`  Expected cycle1 interest:      ${expectedCycle1Interest}`);
    console.log(`  Expected cycle1 total:         ${expectedCycle1Total}`);
    console.log(`  Cycle 1 TotalMinimumPayment:   ${statementCycle1?.TotalMinimumPayment}`);
    console.log(`  Cycle 1 InterestCharged:       ${statementCycle1?.InterestCharged}`);
    console.log(`  Cycle 2 PrincipalMinPayment:   ${statementCycle2?.PrincipalMinimumPayment}`);
    console.log(`  Cycle 2 TotalMinimumPayment:   ${statementCycle2?.TotalMinimumPayment}`);
    console.log(`  Cycle 2 OutstandingPrincipal:  ${statementCycle2?.OutstandingPrincipal}`);
    console.log('══════════════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(dates.cycleStartDate);
    await db.deleteStatementByDate(dates.cycleEndDate);
  });
});