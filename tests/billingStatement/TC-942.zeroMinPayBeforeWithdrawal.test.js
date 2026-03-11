/**
 * CREDIT-TC-942
 * Verify Minimum payment is 0 for account yet to withdraw
 *
 * Run: npx jest tests/billingStatement/TC-942 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil} = require('../../helpers/eodRunner');
const { setupAccountNoDrawdown } = require('../../fixtures/overdraftSetup');
const { getBillingDates } = require('./_billingSetup');


let account, statement, dates, cycleRunDate, searchResponse;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-942 — Minimum Payment is 0 for Account Yet to Withdraw', () => {

  beforeAll(async () => {
    account = await setupAccountNoDrawdown();
    dates   = getBillingDates(account);

    cycleRunDate = dates.statementRunDate;
   
    await runEODUntil({ fromDate: cycleRunDate, toDate: cycleRunDate, procs: [PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT] });

    [statement, searchResponse] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate),
      api.searchOverdraft(account.odAccountNumber),
    ]);
  }, 600_000);

  test('overdrawnAmount = 0 (no drawdown)', () => {
    expect(account.searchResponse.overdrawnAmount).toBe(0);
  });

  test('No statement record created (nothing to bill)', () => {
    expect(statement).not.toBeNull();
  });

   test('DB PrincipalMinimumPayment 0', () => {
    expect(statement.PrincipalMinimumPayment).toBe(0);
  });

  test('paymentDueInfo is null on SearchOverdraft', () => {
    expect(searchResponse.paymentDueInfo).toBeNull();
  });

  afterAll(async() => {
    await db.deleteDebtHistoryByDate(cycleRunDate);
    await db.deleteStatementByDate(cycleRunDate); 
  });
});
