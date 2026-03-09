/**
 * CREDIT-TC-819
 * Verify DebtBreakdown Table is updated after Interest Accrual for accounts with debt
 *
 * Run: npx jest tests/interestAccrual/TC-819 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

function calcDailyInterest(principal, rate) {
  return (principal * rate) / 100 / 30;
}

let account, eodFinDate, breakdownRecords, expectedDailyInterest;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-819 — DebtBreakdown Table Updated After Interest Accrual', () => {

  beforeAll(async () => {
    account    = await setupOverdraftAccount();
    eodFinDate = account.drawdownDate;

    const { overdrawnAmount, interestRate } = account.searchResponse;
    expectedDailyInterest = calcDailyInterest(overdrawnAmount, interestRate);

    await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    breakdownRecords = await db.getDebtBreakdownRecords(account.odAccountNumber, eodFinDate);
  }, 120_000);

  test('At least one OverdraftDebtBreakdowns record exists for the financial date', () => {
    expect(breakdownRecords.length).toBeGreaterThan(0);
  });

  test('AccountNumber matches the OD account', () => {
    expect(breakdownRecords.every(r => r.AccountNumber === account.odAccountNumber)).toBe(true);
    expect(breakdownRecords.every(r => dayjs(r.RealDate).format('YYYY-MM-DD') === eodFinDate)).toBe(true);
  });

  test('UnpaidOverdraftPrincipal matches drawdown amount', () => {
    const principalRecord = breakdownRecords.find(r => r.UnpaidOverdraftPrincipal > 0);
    expect(principalRecord.UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
  });

  test('UnpaidOverdraftInterest matches formula', () => {
    const interestRecord = breakdownRecords.find(r => r.UnpaidOverdraftInterest > 0);
    expect(interestRecord.UnpaidOverdraftInterest).toBe(expectedDailyInterest);
  });

  test('RealDate matches EOD financial date', () => {
    expect(dayjs(breakdownRecords[0].RealDate).format('YYYY-MM-DD')).toBe(eodFinDate);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-819 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:        ${account?.odAccountNumber}`);
    console.log(`  Breakdown records: ${breakdownRecords?.length}`);
    console.log(`  Principal:         ${breakdownRecords?.[0]?.UnpaidOverdraftPrincipal}`);
    console.log(`  Interest:          ${breakdownRecords?.[0]?.UnpaidOverdraftInterest}`);
    console.log(`  Expected daily:    ${expectedDailyInterest}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodFinDate)
  });
});
