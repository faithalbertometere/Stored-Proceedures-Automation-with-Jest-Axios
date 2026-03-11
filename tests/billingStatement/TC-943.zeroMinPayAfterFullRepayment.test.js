/**
 * CREDIT-TC-943
 * Verify Minimum payment is 0 for account that has repaid fully
 *
 * Run: npx jest tests/billingStatement/TC-943 --runInBand
 */

const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { getBillingDates } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');
const { PROCS, runEODUntil} = require('../../helpers/eodRunner');


let account, dates, statement, cycleRunDate, searchAfterRepayment;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-943 — Minimum Payment is 0 After Full Repayment', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();
    dates   = getBillingDates(account);

    // Full repayment before billing EOD runs
    const totalOwed = account.searchResponse.overdrawnAmount + account.searchResponse.accruedODInterest;
    await api.makeRepayment( account.linkedAccountNumber, totalOwed, generateInstrumentNumber());

    // Wait for background worker to apply repayment
    searchAfterRepayment = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedBalance: 0,
    });

    cycleRunDate = dates.statementRunDate;
   
    await runEODUntil({ fromDate: cycleRunDate, toDate: cycleRunDate, procs: [PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT] });

    statement = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  }, 600_000);

  test('overdrawnAmount = 0 after full repayment', () => {
    expect(searchAfterRepayment.overdrawnAmount).toBe(0);
  });

  test('accruedODInterest = 0 after full repayment', () => {
    expect(searchAfterRepayment.accruedODInterest).toBe(0);
  });

  test('No statement record or MinimumPaymentBalance = 0', () => {
    expect(statement).not.toBeNull();
    expect(statement.MinimumPaymentBalance).toBe(0);
  });

  test('paymentDueInfo is null or empty on SearchOverdraft', () => {
    expect(searchAfterRepayment.paymentDueInfo).toBe(null);
  });

  afterAll(async() => {
    await db.deleteDebtHistoryByDate(cycleRunDate);
    await db.deleteStatementByDate(cycleRunDate); 
  });
});
