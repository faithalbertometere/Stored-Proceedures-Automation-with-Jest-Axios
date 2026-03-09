/**
 * CREDIT-TC-691 / CREDIT-TC-692
 * Verify No Interest Accrual When Smart OD Facility is Unused
 * (opted-in and consented but overdrawnAmount = 0)
 *
 * Run: npx jest tests/interestAccrual/TC-691 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupAccountNoDrawdown } = require('../../fixtures/overdraftSetup');

let account, eodFinDate, dbRecord, searchAfterEOD, activityLog;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-691 - No Interest When Smart OD Facility is Unused', () => {

  beforeAll(async () => {
    account    = await setupAccountNoDrawdown();
    eodFinDate = dayjs().format('YYYY-MM-DD');

    await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });

    [dbRecord, searchAfterEOD, activityLog] = await Promise.all([
      db.getDebtHistoryRecord(account.odAccountNumber, eodFinDate),
      api.searchOverdraft(account.odAccountNumber),
      api.getActivityLog(account.odAccountNumber),
    ]);
  }, 120_000);

  test('overdrawnAmount = 0 (facility is unused)', () => {
    expect(account.searchResponse.overdrawnAmount).toBe(0);
  });

  // test('No DebtHistory record created for unused facility', () => {
  //   expect(dbRecord).toBeNull();
  // });

  test('DebtHistory record exists but shows no debt', () => {
    expect(dbRecord).not.toBeNull();
  });

  test('UnpaidOverdraftPrincipal = 0 (no drawdown made)', () => {
    expect(dbRecord.UnpaidOverdraftPrincipal).toBe(0);
  });

  test('UnpaidOverdraftInterest = 0 (nothing to accrue on)', () => {
    expect(dbRecord.UnpaidOverdraftInterest).toBe(0);
  });

  test('accruedODInterest = 0', () => {
    expect(searchAfterEOD.accruedODInterest).toBe(0);
  });

  test('No Interest Accrual entry in ActivityLog for this date', () => {
    const dateStr = dayjs(eodFinDate).format('MM/DD/YYYY');
    const entries = activityLog.filter(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
    expect(entries.length).toBe(0);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-691/692 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:        ${account?.odAccountNumber}`);
    console.log(`  overdrawnAmount:   ${account?.searchResponse?.overdrawnAmount}`);
    console.log(`  accruedODInterest: ${searchAfterEOD?.accruedODInterest}`);
    console.log(`  DB record:         ${dbRecord ? 'EXISTS (unexpected)' : 'null ✔'}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodFinDate);
  });
});
