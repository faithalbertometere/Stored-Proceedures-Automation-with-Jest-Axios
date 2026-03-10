/**
 * CREDIT-TC-944
 * Verify Minimum Payment Calculation for Partial Repayment
 *
 * Run: npx jest tests/billingStatement/TC-944 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { runBillingEOD, calcMinimumPayment } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

const PARTIAL_REPAYMENT = 1000000;
let account, dates, statement, searchAfterRepayment, expectedAfterRepayment;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-944 — Minimum Payment Calculation for Partial Repayment', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount({ drawAmount: 3000000 });

    // Partial repayment
    console.log(`  [TC-944] Partial repayment: ${PARTIAL_REPAYMENT}`);
    await api.makeRepayment(account.linkedAccountNumber, PARTIAL_REPAYMENT, generateInstrumentNumber());

    // Wait for background worker to apply repayment
    const expectedBalance = account.searchResponse.overdrawnAmount - PARTIAL_REPAYMENT;
    searchAfterRepayment  = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedBalance,
    });

    // Run billing EOD based on post-repayment balance
    dates = await runBillingEOD({ ...account, searchResponse: searchAfterRepayment });

    const { overdrawnAmount, interestRate, minimumPaymentPercentage } = searchAfterRepayment;
    expectedAfterRepayment = calcMinimumPayment({
      principal:      overdrawnAmount,
      rate:           interestRate,
      minPaymentPct:  minimumPaymentPercentage,
      cycleStartDate: dates.cycleStartDate,
      cycleEndDate:   dates.cycleEndDate,
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
    expect(statement.OutstandingPrincipal).toBeCloseTo(searchAfterRepayment.overdrawnAmount, 2);
  });

  test('TotalMinimumPayment based on remaining principal', () => {
    expect(statement.TotalMinimumPayment).toBeCloseTo(expectedAfterRepayment.totalMinimumPayment, 2);
  });

  test('TotalMinimumPayment is less than it would have been without repayment', () => {
    const fullExpected = calcMinimumPayment({
      principal:      account.searchResponse.overdrawnAmount,
      rate:           account.searchResponse.interestRate,
      minPaymentPct:  account.searchResponse.minimumPaymentPercentage,
      cycleStartDate: dates.cycleStartDate,
      cycleEndDate:   dates.cycleEndDate,
    });
    expect(statement.TotalMinimumPayment).toBeLessThan(fullExpected.totalMinimumPayment);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-944 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:          ${account?.odAccountNumber}`);
    console.log(`  Original principal:  ${account?.searchResponse?.overdrawnAmount}`);
    console.log(`  Partial repayment:   ${PARTIAL_REPAYMENT}`);
    console.log(`  Remaining principal: ${searchAfterRepayment?.overdrawnAmount}`);
    console.log(`  Expected totalMin:   ${expectedAfterRepayment?.totalMinimumPayment}`);
    console.log(`  DB TotalMinimum:     ${statement?.TotalMinimumPayment}`);
    console.log('══════════════════════════════════════════\n');
  });
});
