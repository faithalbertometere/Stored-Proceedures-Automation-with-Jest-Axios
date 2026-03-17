
const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { getBillingDates, calcDailyInterest, calcMinimumPayment } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, dates, statement, searchResponse, expected;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-546/697 — Right Minimum Payment Based on Formula', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();
    dates   = getBillingDates(account);

    const { overdrawnAmount, interestRate, minimumPaymentPercentage } = account.searchResponse;

    // Run INTEREST_ACCRUAL on cycleStartDate only
    await runEODUntil({
      fromDate: dates.cycleStartDate,
      toDate:   dates.cycleStartDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL],
    });

    // Run INTEREST_ACCRUAL + BILLING_STATEMENT on statementRunDate
    await runEODUntil({
      fromDate: dates.statementRunDate,
      toDate:   dates.statementRunDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.BILLING_STATEMENT],
    });

    // InterestCharged = 2 days of accrual (cycleStartDate + statementRunDate)
    const interestCharged    = calcDailyInterest(overdrawnAmount, interestRate) * 2;
    const principalMinPayment = calcMinimumPayment({ principal: overdrawnAmount, minPaymentRate: minimumPaymentPercentage });
    const totalMinimumPayment = parseFloat((principalMinPayment + interestCharged).toFixed(2));

    expected = { principalMinPayment, interestCharged, totalMinimumPayment };

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

  test('DB TotalMinimumPayment = PrincipalMinimumPayment + InterestCharged', () => {
    expect(statement.TotalMinimumPayment).toBe(expected.totalMinimumPayment);
  });

  test('DB MinimumPaymentBalance = TotalMinimumPayment (no payment yet)', () => {
    expect(statement.MinimumPaymentBalance).toBeCloseTo(statement.TotalMinimumPayment, 2);
  });

  test('API paymentDueInfo[0].minimumPaymentBalance matches DB', () => {
    const apiMinPayment = searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
    expect(apiMinPayment).toBe(statement.MinimumPaymentBalance);
  });

  test('API paymentDueInfo[0].paymentDueDate matches expected', () => {
    const apiDueDate = dayjs(searchResponse.paymentDueInfo?.[0]?.paymentDueDate).format('YYYY-MM-DD');
    expect(apiDueDate).toBe(dates.paymentDueDate);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-546/697 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:              ${account?.odAccountNumber}`);
    console.log(`  Cycle:                   ${dates?.cycleStartDate} → ${dates?.cycleEndDate}`);
    console.log(`  Expected principalMin:   ${expected?.principalMinPayment}`);
    console.log(`  Expected interestCharged:${expected?.interestCharged}`);
    console.log(`  Expected totalMin:       ${expected?.totalMinimumPayment}`);
    console.log(`  DB TotalMinimumPayment:  ${statement?.TotalMinimumPayment}`);
    console.log(`  API minimumPayment:      ${searchResponse?.paymentDueInfo?.[0]?.minimumPaymentBalance}`);
    console.log('══════════════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(dates.cycleStartDate);
    await db.deleteStatementByDate(dates.cycleEndDate);
  });
});