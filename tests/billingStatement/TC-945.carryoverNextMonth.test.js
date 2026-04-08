const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil, getNextStatementRunDate } = require('../../helpers/eodRunner');
const { getBillingDates, calcMinimumPayment } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

const SECOND_DRAWDOWN = 2000000;

let account, dates, cycle2StampDate, statementCycle1, statementCycle2, 
    debthistory, debthistory2, cycle1MinPayment, cycle2MinPayment;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-945 — Minimum Payment Next Month with Carryover', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount({ drawAmount: 3000000 });
    dates   = getBillingDates(account);

    const { statementDay, overdrawnAmount, minimumPaymentPercentage } = account.searchResponse;
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

    cycle1MinPayment = calcMinimumPayment({ principal: overdrawnAmount, minPaymentRate: minimumPaymentPercentage });

    // Second drawdown after cycle 1
    await api.drawdown({
      linkedAccountNumber: account.linkedAccountNumber,
      amount:              SECOND_DRAWDOWN,
      instrumentNumber:    generateInstrumentNumber(),
    });

    // Cycle 2
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
      principal:    overdrawnAmount + SECOND_DRAWDOWN, 
      minPaymentRate: minimumPaymentPercentage,
    });

    [debthistory, debthistory2, statementCycle1, statementCycle2] = await Promise.all([
      db.getDebtHistoryRecord(account.odAccountNumber, cycle2RunDate),
      db.getDebtHistoryRecord(account.odAccountNumber, cycle2StampDate),
      db.getOverdraftStatement(account.odAccountNumber, cycle1StampDate),
      db.getOverdraftStatement(account.odAccountNumber, cycle2StampDate),
    ]);
  }, 900_000);

  test('Cycle 1 statement exists', () => { expect(statementCycle1).not.toBeNull(); });
  test('Cycle 2 statement exists', () => { expect(statementCycle2).not.toBeNull(); });

  test('Cycle 2 PreviousOutstandingPrincipal = Cycle 1 OutstandingPrincipal (carryover)', () => {
    expect(statementCycle2.PreviousOutstandingPrincipal).toBe(statementCycle1.OutstandingPrincipal);
  });

  test('Cycle 1 TotalMinimumPayment based on initial drawdown', () => {
    expect(statementCycle1.TotalMinimumPayment).toBe(cycle1MinPayment);
  });

  test('Cycle 2 TotalMinimumPayment based on initial + second drawdown', () => {
    expect(statementCycle2.TotalMinimumPayment).toBe(cycle2MinPayment);
  });

  test('Cycle 1 MinimumPaymentBalance = cycle1MinPayment', () => {
    expect(statementCycle1.MinimumPaymentBalance).toBe(cycle1MinPayment);
  });

  test('Cycle 2 MinimumPaymentBalance = cycle2MinPayment', () => {
    expect(statementCycle2.MinimumPaymentBalance).toBe(cycle2MinPayment);
  });

  test('DebtHistory on cycle2RunDate reflects MinimumPayment from cycle 1 statement', () => {
    expect(parseFloat(debthistory.MinimumPayment)).toBe(statementCycle1.TotalMinimumPayment);
  });

  test('DebtHistory on cycle2StampDate reflects total MinimumPayment for both cycles', () => {
    expect(parseFloat(debthistory2.MinimumPayment)).toBe(statementCycle1.TotalMinimumPayment + statementCycle2.TotalMinimumPayment);
  });

  afterAll(async () => {
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
    await db.deleteDebtHistoryByDate(dates.cycleStartDate);
    await db.deleteStatementByDate(dates.cycleEndDate);
  });
});