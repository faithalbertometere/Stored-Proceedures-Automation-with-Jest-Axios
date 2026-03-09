/**
 * CREDIT-TC-816
 * Verify all accounts with Active Overdrafts are Recorded on Debt History Table
 *
 * Run: npx jest tests/debtHistory/TC-816 --runInBand
 */

const dayjs = require('dayjs');
const { getNextEODDate } = require('../../data/testData');
const db    = require('../../helpers/dbHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let accountA, accountB, recordA, recordB, finDate;
finDate = getNextEODDate();


beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-816 — All Active Overdraft Accounts Recorded on Debt History', () => {

  beforeAll(async () => {
    console.log('  [TC-816] Provisioning two independent OD accounts...');
    [accountA, accountB] = await Promise.all([
      setupOverdraftAccount(),
      setupOverdraftAccount(),
    ]);

    finDate = accountA.drawdownDate;

    await runEODUntil({ fromDate: finDate, toDate: finDate, procs: [PROCS.DEBT_HISTORY] });

    [recordA, recordB] = await Promise.all([
      db.getDebtHistoryRecord(accountA.odAccountNumber, finDate),
      db.getDebtHistoryRecord(accountB.odAccountNumber, finDate),
    ]);
  }, 180_000);

  test('Account A has a Debt History record for the financial date', () => {
    expect(recordA).not.toBeNull();
  });

  test('Account B has a Debt History record for the financial date', () => {
    expect(recordB).not.toBeNull();
  });

  test('Account A principal matches its drawdown amount', () => {
    expect(recordA.UnpaidOverdraftPrincipal).toBe(accountA.searchResponse.overdrawnAmount);
  });

  test('Account B principal matches its drawdown amount', () => {
    expect(recordB.UnpaidOverdraftPrincipal).toBe(accountB.searchResponse.overdrawnAmount);
  });

  test('Both records share the same FinancialDate', () => {
    expect(dayjs(recordA.FinancialDate).format('YYYY-MM-DD')).toBe(finDate);
    expect(dayjs(recordB.FinancialDate).format('YYYY-MM-DD')).toBe(finDate);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-816 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  Account A: ${accountA?.odAccountNumber} | Principal: ${recordA?.UnpaidOverdraftPrincipal}`);
    console.log(`  Account B: ${accountB?.odAccountNumber} | Principal: ${recordB?.UnpaidOverdraftPrincipal}`);
    console.log(`  EOD FinDate: ${finDate}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(finDate);
    
  });
});
