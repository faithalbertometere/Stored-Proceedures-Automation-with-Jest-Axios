/**
 * CREDIT-TC-945
 * Verify Minimum Payment Calculation for Next Month with Carryover from Previous Month
 *
 * Run: npx jest tests/billingStatement/TC-945 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const { PROCS, runEODUntil, continueEODUntil, getNextStatementRunDate } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, cycle1StampDate, cycle2StampDate, statementCycle1, statementCycle2;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-945 — Minimum Payment Next Month with Carryover', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();

    const { statementDay } = account.searchResponse;

    const cycle1RunDate = getNextStatementRunDate(account.drawdownDate, statementDay);
    cycle1StampDate     = dayjs(cycle1RunDate).add(1, 'day').format('YYYY-MM-DD');

    const cycle2RunDate = getNextStatementRunDate(cycle1StampDate, statementDay);
    cycle2StampDate     = dayjs(cycle2RunDate).add(1, 'day').format('YYYY-MM-DD');

    // No repayment between cycles — carryover should apply
    await runEODUntil({ fromDate: account.drawdownDate, toDate: cycle2RunDate, procs: [PROCS.DEBT_HISTORY] });

    await continueEODUntil({
      lastDate: dayjs(cycle1RunDate).subtract(1, 'day').format('YYYY-MM-DD'),
      toDate:   cycle1RunDate,
      procs:    [PROCS.BILLING_STATEMENT],
    });

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

  test('Cycle 2 PreviousOutstandingPrincipal = Cycle 1 OutstandingPrincipal (carryover)', () => {
    expect(statementCycle2.PreviousOutstandingPrincipal)
      .toBeCloseTo(statementCycle1.OutstandingPrincipal, 2);
  });

  test('Cycle 2 TotalMinimumPayment > Cycle 1 TotalMinimumPayment', () => {
    expect(statementCycle2.TotalMinimumPayment).toBeGreaterThan(statementCycle1.TotalMinimumPayment);
  });

  test('Cycle 2 UnpaidInterest > Cycle 1 InterestCharged (cumulative)', () => {
    expect(statementCycle2.UnpaidInterest).toBeGreaterThan(statementCycle1.InterestCharged);
  });

  test('Cycle 2 MinimumPaymentBalance > Cycle 1 MinimumPaymentBalance', () => {
    expect(statementCycle2.MinimumPaymentBalance).toBeGreaterThan(statementCycle1.MinimumPaymentBalance);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-945 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:                  ${account?.odAccountNumber}`);
    console.log(`  Cycle 1 TotalMinimum:        ${statementCycle1?.TotalMinimumPayment}`);
    console.log(`  Cycle 1 OutstandingPrincipal:${statementCycle1?.OutstandingPrincipal}`);
    console.log(`  Cycle 2 PrevOutstanding:     ${statementCycle2?.PreviousOutstandingPrincipal}`);
    console.log(`  Cycle 2 TotalMinimum:        ${statementCycle2?.TotalMinimumPayment}`);
    console.log(`  Cycle 2 MinPayBalance:       ${statementCycle2?.MinimumPaymentBalance}`);
    console.log('══════════════════════════════════════════════════\n');
  });
});
