/**
 * CREDIT-TC-948
 * Verify Principal Minimum Payment Cap with Second Drawdown
 *
 * Scenario:
 *   - minimumPaymentPercentage = 100 (full principal requested in cycle 1)
 *   - Cycle 1: PrincipalMinimumPayment = drawAmount (100% of initial principal)
 *   - Second drawdown after cycle 1
 *   - Cycle 2: PrincipalMinimumPayment = second drawdown amount only (cap applied on initial)
 *   - Cycle 2: TotalMinimumPayment = second drawdown amount (no interest accrual)
 *
 * Run: npx jest tests/billingStatement/TC-948 --runInBand
 */

const dayjs  = require('dayjs');
const db     = require('../../helpers/dbHelper');
const api    = require('../../helpers/apiHelper');
const { PROCS, runEODUntil, getNextStatementRunDate } = require('../../helpers/eodRunner');
const { getBillingDates, calcMinimumPayment } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

const DRAW_AMOUNT     = 3000000;
const SECOND_DRAWDOWN = 2000000;

let account, dates, cycle2StampDate, statementCycle1, statementCycle2,
    cycle1MinPayment, cycle2MinPayment;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-948 — Principal Cap with Second Drawdown', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount({
      drawAmount:               DRAW_AMOUNT,
      minimumPaymentPercentage: 100,
    });
    dates = getBillingDates(account);

    const { statementDay, minimumPaymentPercentage } = account.searchResponse;
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

    cycle1MinPayment = calcMinimumPayment({
      principal:    DRAW_AMOUNT,
      minPaymentRate: minimumPaymentPercentage,
    });

    // Second drawdown after cycle 1
    await api.drawdown({
      linkedAccountNumber: account.linkedAccountNumber,
      amount:              SECOND_DRAWDOWN,
      instrumentNumber:    generateInstrumentNumber(),
    });

    // Cycle 2 — cap applies on initial principal, only second drawdown is billable
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

    cycle2MinPayment = calcMinimumPayment({
      principal:    SECOND_DRAWDOWN,
      minPaymentRate: minimumPaymentPercentage,
    });

    [statementCycle1, statementCycle2] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, cycle1StampDate),
      db.getOverdraftStatement(account.odAccountNumber, cycle2StampDate),
    ]);
  }, 900_000);

  test('Cycle 1 statement exists', () => { expect(statementCycle1).not.toBeNull(); });
  test('Cycle 2 statement exists', () => { expect(statementCycle2).not.toBeNull(); });

  test('Cycle 1 PrincipalMinimumPayment = full initial drawdown', () => {
    expect(statementCycle1.PrincipalMinimumPayment).toBe(DRAW_AMOUNT);
  });

  test('Cycle 1 TotalMinimumPayment = full initial drawdown (no interest)', () => {
    expect(statementCycle1.TotalMinimumPayment).toBe(cycle1MinPayment);
  });

  test('Cycle 2 PrincipalMinimumPayment = second drawdown only (cap applied on initial)', () => {
    expect(statementCycle2.PrincipalMinimumPayment).toBe(SECOND_DRAWDOWN);
  });

  test('Cycle 2 TotalMinimumPayment = second drawdown minimum payment', () => {
    expect(statementCycle2.TotalMinimumPayment).toBe(cycle2MinPayment);
  });

  test('Cycle 2 MinimumPaymentBalance = cycle2MinPayment', () => {
    expect(statementCycle2.MinimumPaymentBalance).toBe(cycle2MinPayment);
  });

  test('Cycle 2 PreviousOutstandingPrincipal = Cycle 1 OutstandingPrincipal', () => {
    expect(statementCycle2.PreviousOutstandingPrincipal).toBe(statementCycle1.OutstandingPrincipal);
  });

  test('Cycle 2 OutstandingPrincipal = initial + second drawdown', () => {
    expect(statementCycle2.OutstandingPrincipal).toBe(DRAW_AMOUNT + SECOND_DRAWDOWN);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-948 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:                    ${account?.odAccountNumber}`);
    console.log(`  Initial Draw:                  ${DRAW_AMOUNT}`);
    console.log(`  Second Drawdown:               ${SECOND_DRAWDOWN}`);
    console.log(`  Cycle 1 PrincipalMinPayment:   ${statementCycle1?.PrincipalMinimumPayment}`);
    console.log(`  Cycle 1 TotalMinimumPayment:   ${statementCycle1?.TotalMinimumPayment}`);
    console.log(`  Cycle 2 PrincipalMinPayment:   ${statementCycle2?.PrincipalMinimumPayment}`);
    console.log(`  Cycle 2 TotalMinimumPayment:   ${statementCycle2?.TotalMinimumPayment}`);
    console.log(`  Cycle 2 OutstandingPrincipal:  ${statementCycle2?.OutstandingPrincipal}`);
    console.log('══════════════════════════════════════════════════\n');
    //await db.deleteDebtHistoryByDate(dates.cycleStartDate);
    //await db.deleteStatementByDate(dates.cycleEndDate);
  });
});