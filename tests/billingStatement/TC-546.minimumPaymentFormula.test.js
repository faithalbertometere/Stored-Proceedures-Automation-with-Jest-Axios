/**
 * CREDIT-TC-546 / CREDIT-TC-697
 * Verify the Right Minimum Payment is recorded based on the provided formula
 *
 * Formula (mode=1):
 *   PrincipalMinimumPayment = minimumPaymentPercentage/100 × cycleUnpaidPrincipal
 *   TotalMinimumPayment     = PrincipalMinimumPayment + totalInterestAccruedInCycle
 *
 * Run: npx jest tests/billingStatement/TC-546 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { runBillingEOD, calcMinimumPayment } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, dates, statement, searchResponse, expected;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-546/697 — Right Minimum Payment Based on Formula', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();
    dates   = await runBillingEOD(account);

    const { overdrawnAmount, interestRate, minimumPaymentPercentage } = account.searchResponse;
    expected = calcMinimumPayment({
      principal:      overdrawnAmount,
      rate:           interestRate,
      minPaymentPct:  minimumPaymentPercentage,
      cycleStartDate: dates.cycleStartDate,
      cycleEndDate:   dates.cycleEndDate,
    });

    console.log(`  [TC-546] Expected: principalMin=${expected.principalMinPayment} | cycleInterest=${expected.cycleInterest} | total=${expected.totalMinimumPayment}`);

    [statement, searchResponse] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate),
      api.searchOverdraft(account.odAccountNumber),
    ]);
  }, 600_000);

  test('OverdraftStatements record created for statement stamp date', () => {
    expect(statement).not.toBeNull();
  });

  test('DB PrincipalMinimumPayment = minimumPaymentPercentage/100 × principal', () => {
    expect(statement.PrincipalMinimumPayment).toBeCloseTo(expected.principalMinPayment, 2);
  });

  test('DB InterestCharged = total interest accrued in cycle', () => {
    expect(statement.InterestCharged).toBeCloseTo(expected.cycleInterest, 2);
  });

  test('DB TotalMinimumPayment = PrincipalMinimumPayment + InterestCharged', () => {
    expect(statement.TotalMinimumPayment).toBeCloseTo(expected.totalMinimumPayment, 2);
  });

  test('DB MinimumPaymentBalance = TotalMinimumPayment (no payment yet)', () => {
    expect(statement.MinimumPaymentBalance).toBeCloseTo(statement.TotalMinimumPayment, 2);
  });

  test('API paymentDueInfo[0].minimumPaymentBalance matches DB', () => {
    const apiMinPayment = searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
    expect(apiMinPayment).toBeCloseTo(statement.MinimumPaymentBalance, 2);
  });

  test('API paymentDueInfo[0].paymentDueDate matches expected', () => {
    const apiDueDate = dayjs(searchResponse.paymentDueInfo?.[0]?.paymentDueDate).format('YYYY-MM-DD');
    expect(apiDueDate).toBe(dates.paymentDueDate);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-546/697 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:              ${account?.odAccountNumber}`);
    console.log(`  Cycle:                   ${dates?.cycleStartDate} → ${dates?.cycleEndDate}`);
    console.log(`  Expected principalMin:   ${expected?.principalMinPayment}`);
    console.log(`  Expected cycleInterest:  ${expected?.cycleInterest}`);
    console.log(`  Expected totalMin:       ${expected?.totalMinimumPayment}`);
    console.log(`  DB TotalMinimumPayment:  ${statement?.TotalMinimumPayment}`);
    console.log(`  API minimumPayment:      ${searchResponse?.paymentDueInfo?.[0]?.minimumPaymentBalance}`);
    console.log('══════════════════════════════════════════════════\n');
  });
});
