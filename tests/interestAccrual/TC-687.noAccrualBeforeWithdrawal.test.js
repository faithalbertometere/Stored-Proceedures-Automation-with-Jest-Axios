/**
 * CREDIT-TC-687
 * Verify Interest is not Accrued on Account yet to Withdraw
 *
 * Run: npx jest tests/interestAccrual/TC-687 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupAccountNoDrawdown } = require('../../fixtures/overdraftSetup');

let account, eodFinDate, dbRecord, searchAfterEOD, activityLog, breakdownRecords;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-687 — No Interest Accrual on Account Yet to Withdraw', () => {

  beforeAll(async () => {
    account    = await setupAccountNoDrawdown();
    eodFinDate = dayjs().format('YYYY-MM-DD');

    await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY] });

    [dbRecord, searchAfterEOD, activityLog, breakdownRecords] = await Promise.all([
      db.getDebtHistoryRecord(account.odAccountNumber, eodFinDate),
      api.searchOverdraft(account.odAccountNumber),
      api.getActivityLog(account.odAccountNumber),
      db.getDebtBreakdownRecords(account.odAccountNumber, eodFinDate),
    ]);
  }, 120_000);

  test('overdrawnAmount = 0 (no drawdown made)', () => {
    expect(account.searchResponse.overdrawnAmount).toBe(0);
  });

  test('No DebtHistory record created (no debt to snapshot)', () => {
    expect(dbRecord).not.toBeNull();
  });

  test('accruedODInterest = 0 on SearchOverdraft', () => {
    expect(searchAfterEOD.accruedODInterest).toBe(0);
  });

  test('No Interest Accrual entry in ActivityLog for this date', () => {
    const dateStr = dayjs(eodFinDate).format('MM/DD/YYYY');
    const entries = activityLog.filter(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
    expect(entries.length).toBe(0);
  });

  test('No DebtBreakdown record for this date', () => {
    expect(breakdownRecords.length).toBe(0);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-687 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:        ${account?.odAccountNumber}`);
    console.log(`  overdrawnAmount:   ${account?.searchResponse?.overdrawnAmount}`);
    console.log(`  DB record:         ${dbRecord ? 'EXISTS (unexpected)' : 'null ✔'}`);
    console.log(`  accruedODInterest: ${searchAfterEOD?.accruedODInterest}`);
    console.log(`  Breakdown records: ${breakdownRecords?.length}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodFinDate);
  });
});
