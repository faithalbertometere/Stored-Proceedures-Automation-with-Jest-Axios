/**
 * CREDIT-TC-817
 * Verify SmartOverdraftActivityLogs is updated after running EOD_SmartOverdraftInterestAccrual
 *
 * Run: npx jest tests/interestAccrual/TC-817 --runInBand
 */

const dayjs = require('dayjs');
const api   = require('../../helpers/apiHelper');
const db    = require('../../helpers/dbHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, eodFinDate, activityLog;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-817 — SmartOverdraftActivityLogs Updated After EOD', () => {

  beforeAll(async () => {
    account    = await setupOverdraftAccount();
    eodFinDate = account.drawdownDate;

    await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL]});
    activityLog = await api.getActivityLog(account.odAccountNumber);
  }, 120_000);

  test('ActivityLog is not empty after EOD runs', () => {
    expect(activityLog.length).toBeGreaterThan(0);
  });

  test('Interest Accrual entry exists in ActivityLog', () => {
    expect(activityLog.some(e => e.transactionType === 'Interest Accrual')).toBe(true);
  });

  test('Interest Accrual entry exists for the EOD financial date', () => {
    const dateStr = dayjs(eodFinDate).format('MM/DD/YYYY');
    expect(activityLog.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr))).toBe(true);
  });

  test('Entry has the correct accountNumber', () => {
    const entry = activityLog.find(e => e.transactionType === 'Interest Accrual');
    expect(entry.accountNumber).toBe(account.odAccountNumber);
  });

  test('Entry has a transactionDate', () => {
    const entry = activityLog.find(e => e.transactionType === 'Interest Accrual');
    expect(entry.transactionDate).toBeTruthy();
  });

  afterAll(async() => {
    const entry = activityLog?.find(e => e.transactionType === 'Interest Accrual');
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-817 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:   ${account?.odAccountNumber}`);
    console.log(`  Log entries:  ${activityLog?.length}`);
    console.log(`  Accrual entry: ${entry ? `${entry.amount} on ${entry.transactionDate}` : 'not found'}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodFinDate);
  });
});
