/**
 * CREDIT-TC-942
 * Verify Minimum payment is 0 for account yet to withdraw
 *
 * Run: npx jest tests/billingStatement/TC-942 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil, continueEODUntil, getNextStatementRunDate, getPaymentDates } = require('../../helpers/eodRunner');
const { setupAccountNoDrawdown } = require('../../fixtures/overdraftSetup');

let account, statementStampDate, statement, searchResponse;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-942 — Minimum Payment is 0 for Account Yet to Withdraw', () => {

  beforeAll(async () => {
    account = await setupAccountNoDrawdown();

    const fakeDrawdownDate   = dayjs().format('YYYY-MM-DD');
    const { statementDay }   = account.searchResponse;
    const statementRunDate   = getNextStatementRunDate(fakeDrawdownDate, statementDay);
    statementStampDate       = dayjs(statementRunDate).add(1, 'day').format('YYYY-MM-DD');

    await runEODUntil({ fromDate: fakeDrawdownDate, toDate: statementRunDate, procs: [PROCS.DEBT_HISTORY] });
    await continueEODUntil({
      lastDate: dayjs(statementRunDate).subtract(1, 'day').format('YYYY-MM-DD'),
      toDate:   statementRunDate,
      procs:    [PROCS.BILLING_STATEMENT],
    });

    [statement, searchResponse] = await Promise.all([
      db.getOverdraftStatement(account.odAccountNumber, statementStampDate),
      api.searchOverdraft(account.odAccountNumber),
    ]);
  }, 600_000);

  test('overdrawnAmount = 0 (no drawdown)', () => {
    expect(account.searchResponse.overdrawnAmount).toBe(0);
  });

  test('No statement record created (nothing to bill)', () => {
    expect(statement).toBeNull();
  });

  test('paymentDueInfo is null on SearchOverdraft', () => {
    expect(searchResponse.paymentDueInfo).toBeNull();
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-942 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:    ${account?.odAccountNumber}`);
    console.log(`  DB statement:  ${statement ? 'EXISTS (unexpected)' : 'null ✔'}`);
    console.log(`  paymentDueInfo:${searchResponse?.paymentDueInfo ?? 'null ✔'}`);
    console.log('══════════════════════════════════════════\n');
  });
});
