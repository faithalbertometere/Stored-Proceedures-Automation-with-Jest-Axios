/**
 * CREDIT-TC-943
 * Verify Minimum payment is 0 for account that has repaid fully
 *
 * Run: npx jest tests/billingStatement/TC-943 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { runBillingEOD } = require('./_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

let account, dates, statement, searchAfterRepayment;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-943 — Minimum Payment is 0 After Full Repayment', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount();

    // Full repayment before billing EOD runs
    const totalOwed = account.searchResponse.overdrawnAmount + account.searchResponse.accruedODInterest;
    console.log(`  [TC-943] Full repayment: ${totalOwed}`);
    await api.makeRepayment( account.linkedAccountNumber, totalOwed, generateInstrumentNumber());

    // Wait for background worker to apply repayment
    searchAfterRepayment = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedBalance: 0,
    });

    // Now run billing EOD — should produce no minimum payment
    dates = await runBillingEOD({ ...account, searchResponse: searchAfterRepayment });

    statement = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  }, 600_000);

  test('overdrawnAmount = 0 after full repayment', () => {
    expect(searchAfterRepayment.overdrawnAmount).toBe(0);
  });

  test('accruedODInterest = 0 after full repayment', () => {
    expect(searchAfterRepayment.accruedODInterest).toBe(0);
  });

  test('No statement record or MinimumPaymentBalance = 0', () => {
    const balance = statement?.MinimumPaymentBalance ?? 0;
    expect(balance).toBe(0);
  });

  test('paymentDueInfo is null or empty on SearchOverdraft', () => {
    const search = searchAfterRepayment;
    expect(search.paymentDueInfo === null || search.paymentDueInfo?.length === 0).toBe(true);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-943 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:     ${account?.odAccountNumber}`);
    console.log(`  Post-repay bal: ${searchAfterRepayment?.overdrawnAmount}`);
    console.log(`  DB MinPayBal:   ${statement?.MinimumPaymentBalance ?? 'no record'}`);
    console.log('══════════════════════════════════════════\n');
  });
});
