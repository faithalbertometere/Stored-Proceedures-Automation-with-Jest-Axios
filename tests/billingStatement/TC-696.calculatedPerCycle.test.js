/**
 * CREDIT-TC-696
 * Verify Minimum Payment is Calculated for Each Billing Cycle
 *
 * Run: npx jest tests/billingStatement/TC-696 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const { PROCS, runEODUntil, continueEODUntil, getNextStatementRunDate } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, cycle1StampDate, cycle2StampDate, statementCycle1, statementCycle2;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-696 — Minimum Payment Calculated for Each Billing Cycle', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();

    const { statementDay, optInDate } = account.searchResponse;

    const cycle1RunDate = getNextStatementRunDate(account.drawdownDate, statementDay);
    cycle1StampDate     = dayjs(cycle1RunDate).add(1, 'day').format('YYYY-MM-DD');

    const cycle2RunDate = getNextStatementRunDate(cycle1StampDate, statementDay);
    cycle2StampDate     = dayjs(cycle2RunDate).add(1, 'day').format('YYYY-MM-DD');

    // DebtHistory every day through both cycles
    await runEODUntil({ fromDate: account.drawdownDate, toDate: cycle2RunDate, procs: [PROCS.DEBT_HISTORY] });

    // BillingStatement — cycle 1
    await continueEODUntil({
      lastDate: dayjs(cycle1RunDate).subtract(1, 'day').format('YYYY-MM-DD'),
      toDate:   cycle1RunDate,
      procs:    [PROCS.BILLING_STATEMENT],
    });

    // BillingStatement — cycle 2
    await continueEODUntil({
      lastDate: dayjs(cycle2RunDate).subtract(1, 'day').format('YYYY-MM-DD'),
      toDate:   cycle2RunDate,
      procs:    [PROCS.BILLING_STATEMENT],
    });

    [statementCycle1, statementCycle2] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, cycle1StampDate),
      db.getOverdraftStatement(account.odAccountNumber, cycle2StampDate),
    ]);
  }, 900_000);

  test('Cycle 1 statement exists', () => { expect(statementCycle1).not.toBeNull(); });
  test('Cycle 2 statement exists', () => { expect(statementCycle2).not.toBeNull(); });

  test('Cycle 1 BillingCycleStartDate = optInDate', () => {
    const optIn = dayjs(account.searchResponse.optInDate).format('YYYY-MM-DD');
    expect(dayjs(statementCycle1.BillingCycleStartDate).format('YYYY-MM-DD')).toBe(optIn);
  });

  test('Cycle 1 BillingCycleEndDate = day before cycle 1 stamp date', () => {
    expect(dayjs(statementCycle1.BillingCycleEndDate).format('YYYY-MM-DD'))
      .toBe(dayjs(cycle1StampDate).subtract(1, 'day').format('YYYY-MM-DD'));
  });

  test('Cycle 2 BillingCycleStartDate = cycle 1 stamp date', () => {
    expect(dayjs(statementCycle2.BillingCycleStartDate).format('YYYY-MM-DD')).toBe(cycle1StampDate);
  });

  test('Each cycle has a distinct FinancialDate', () => {
    expect(statementCycle1.FinancialDate).not.toEqual(statementCycle2.FinancialDate);
  });

  test('Both cycles have TotalMinimumPayment > 0', () => {
    expect(statementCycle1.TotalMinimumPayment).toBeGreaterThan(0);
    expect(statementCycle2.TotalMinimumPayment).toBeGreaterThan(0);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-696 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:    ${account?.odAccountNumber}`);
    console.log(`  Cycle 1 stamp: ${cycle1StampDate} | TotalMin: ${statementCycle1?.TotalMinimumPayment}`);
    console.log(`  Cycle 2 stamp: ${cycle2StampDate} | TotalMin: ${statementCycle2?.TotalMinimumPayment}`);
    console.log('══════════════════════════════════════════\n');
  });
});
