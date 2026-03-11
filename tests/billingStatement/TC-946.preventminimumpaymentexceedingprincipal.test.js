/**
 * CREDIT-TC-946
 * Verify Principal Minimum Payment is Capped at Total Principal Drawn
 *
 * Scenario:
 *   - minimumPaymentPercentage = 100 (full principal requested in cycle 1)
 *   - Cycle 1: PrincipalMinimumPayment = drawAmount (100% of principal)
 *   - Cycle 2: PrincipalMinimumPayment = 0 (cap applied — already requested full principal)
 *   - TotalMinimumPayment cycle 2 = 0 (no interest accrual)
 *
 * Run: npx jest tests/billingStatement/TC-946 --runInBand
 */

const dayjs  = require('dayjs');
const db     = require('../../helpers/dbHelper');
const { PROCS, runEODUntil, getNextStatementRunDate } = require('../../helpers/eodRunner');
const { getBillingDates } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

const DRAW_AMOUNT = 1000000;

let account, dates, cycle2StampDate, statementCycle1, statementCycle2;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-946 — Principal Minimum Payment Capped at Total Principal Drawn', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount({ 
      drawAmount:               DRAW_AMOUNT, 
      minimumPaymentPercentage: 100,
    });
    dates = getBillingDates(account);

    const { statementDay } = account.searchResponse;
    const cycle1RunDate   = dates.statementRunDate;
    const cycle1StampDate = dates.statementStampDate;
    const cycle2RunDate   = getNextStatementRunDate(cycle1StampDate, statementDay);
    cycle2StampDate       = dayjs(cycle2RunDate).add(1, 'day').format('YYYY-MM-DD');

    // Cycle 1
    await runEODUntil({
      fromDate: cycle1RunDate,
      toDate:   cycle1RunDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT],
    });

    // Cycle 2 — no repayment, cap should apply
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

    [statementCycle1, statementCycle2] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, cycle1StampDate),
      db.getOverdraftStatement(account.odAccountNumber, cycle2StampDate),
    ]);
  }, 900_000);

  test('Cycle 1 statement exists', () => { expect(statementCycle1).not.toBeNull(); });
  test('Cycle 2 statement exists', () => { expect(statementCycle2).not.toBeNull(); });

  test('Cycle 1 PrincipalMinimumPayment = full drawdown amount', () => {
    expect(statementCycle1.PrincipalMinimumPayment).toBe(DRAW_AMOUNT);
  });

  test('Cycle 1 TotalMinimumPayment = full drawdown amount (no interest)', () => {
    expect(statementCycle1.TotalMinimumPayment).toBe(DRAW_AMOUNT);
  });

  test('Cycle 2 PrincipalMinimumPayment = 0', () => {
    expect(statementCycle2.PrincipalMinimumPayment).toBe(0);
  });

  test('Cycle 2 TotalMinimumPayment = 0', () => {
    expect(statementCycle2.TotalMinimumPayment).toBe(0);
  });

  test('Cycle 2 MinimumPaymentBalance = 0', () => {
    expect(statementCycle2.MinimumPaymentBalance).toBe(0);
  });

  test('Cycle 2 OutstandingPrincipal does not exceed drawdown amount', () => {
    expect(statementCycle2.OutstandingPrincipal).toBeLessThanOrEqual(DRAW_AMOUNT);
  });

  test('Cycle 2 PreviousOutstandingPrincipal = Cycle 1 OutstandingPrincipal', () => {
    expect(statementCycle2.PreviousOutstandingPrincipal).toBe(statementCycle1.OutstandingPrincipal);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-946 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:                    ${account?.odAccountNumber}`);
    console.log(`  Draw Amount:                   ${DRAW_AMOUNT}`);
    console.log(`  Cycle 1 PrincipalMinPayment:   ${statementCycle1?.PrincipalMinimumPayment}`);
    console.log(`  Cycle 1 TotalMinimumPayment:   ${statementCycle1?.TotalMinimumPayment}`);
    console.log(`  Cycle 2 PrincipalMinPayment:   ${statementCycle2?.PrincipalMinimumPayment}`);
    console.log(`  Cycle 2 TotalMinimumPayment:   ${statementCycle2?.TotalMinimumPayment}`);
    console.log(`  Cycle 2 OutstandingPrincipal:  ${statementCycle2?.OutstandingPrincipal}`);
    console.log('══════════════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(dates.cycleStartDate);
    await db.deleteStatementByDate(dates.cycleEndDate);
  });
});