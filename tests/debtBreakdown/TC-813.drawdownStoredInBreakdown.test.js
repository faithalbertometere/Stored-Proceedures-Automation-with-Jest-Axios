/**
 * CREDIT-TC-813
 * Check Drawdowns are stored in OverdraftDebtBreakdown Table
 *
 * Run: npx jest tests/debtBreakdown/TC-813 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, eodFinDate, breakdownRecords, searchResponse;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-813 — Drawdowns Stored in OverdraftDebtBreakdown Table', () => {

  beforeAll(async () => {
    account    = await setupOverdraftAccount();
    eodFinDate = account.drawdownDate;

    await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY] });

    [breakdownRecords, searchResponse] = await Promise.all([
      db.getDebtBreakdownRecords(account.odAccountNumber, eodFinDate),
      api.searchOverdraft(account.odAccountNumber),
    ]);
  }, 120_000);

  test('A breakdown record exists after drawdown + EOD', () => {
    expect(breakdownRecords.length).toBeGreaterThan(0);
  });

  test('AccountNumber matches the OD account', () => {
    expect(breakdownRecords[0].AccountNumber).toBe(account.odAccountNumber);
  });

  test('UnpaidOverdraftPrincipal = drawdown amount', () => {
    expect(breakdownRecords[0].UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
  });

  test('UnpaidOverdraftPrincipal matches overdrawnAmount from SearchOverdraft', () => {
    expect(breakdownRecords[0].UnpaidOverdraftPrincipal).toBe(searchResponse.overdrawnAmount);
  });

  test('RealDate matches the EOD financial date', () => {
    expect(dayjs(breakdownRecords[0].RealDate).format('YYYY-MM-DD')).toBe(eodFinDate);
  });

  test('UnpaidOverdraftInterest > 0 (interest started accruing)', () => {
    expect(breakdownRecords[0].UnpaidOverdraftInterest).toBeGreaterThan(0);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-813 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:  ${account?.odAccountNumber}`);
    console.log(`  EOD FinDate: ${eodFinDate}`);
    console.log(`  Records:     ${breakdownRecords?.length}`);
    console.log(`  Principal:   ${breakdownRecords?.[0]?.UnpaidOverdraftPrincipal}`);
    console.log(`  Interest:    ${breakdownRecords?.[0]?.UnpaidOverdraftInterest}`);
    console.log('══════════════════════════════════════════\n');
  });
});
