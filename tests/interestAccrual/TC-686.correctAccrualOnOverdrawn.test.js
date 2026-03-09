/**
 * CREDIT-TC-686
 * Verify Correct Interest Accrual on Overdrawn Account
 * Formula: principal × interestRate / 100 / 30
 * Validated across 4 sources: DebtHistory DB, SearchOverdraft API, ActivityLog API, DebtBreakdowns DB
 *
 * Run: npx jest tests/interestAccrual/TC-686 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');


function calcDailyInterest(principal, rate) {
  return (principal * rate) / 100 / 30;
}

let account, eodFinDate, expectedDailyInterest;
let dbRecord, searchAfterEOD, activityLog, breakdownRecords, eodDay1, eodDay2;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-686 — Correct Interest Accrual on Overdrawn Account', () => {

  beforeAll(async () => {
    account    = await setupOverdraftAccount();
    eodFinDate = account.drawdownDate;

    const { overdrawnAmount, interestRate } = account.searchResponse;
    expectedDailyInterest = calcDailyInterest(overdrawnAmount, interestRate);
    console.log(`  [TC-686] Principal: ${overdrawnAmount} | Rate: ${interestRate}% | Expected daily: ${expectedDailyInterest}`);

    eodDay1 = account.drawdownDate;
    eodDay2 = dayjs(eodDay1).add(1, 'day').format('YYYY-MM-DD');
    // eodFinDate    = eodDay2;  // assert on day 2's record

  // Day 1: accrues interest
    await runEODUntil({ fromDate: eodDay1, toDate: eodDay1, procs: [PROCS.DEBT_HISTORY] });
    await runEODUntil({ fromDate: eodDay1, toDate: eodDay1, procs: [PROCS.INTEREST_ACCRUAL] });
  // Day 2: writes accrued interest to DebtHistory
    await runEODUntil({ fromDate: eodDay2, toDate: eodDay2, procs: [PROCS.DEBT_HISTORY] });

    [dbRecord, searchAfterEOD, activityLog, breakdownRecords] = await Promise.all([
      db.getDebtHistoryRecord(account.odAccountNumber, eodDay2),
      api.searchOverdraft(account.odAccountNumber),
      api.getActivityLog(account.odAccountNumber),
      db.getDebtBreakdownRecords(account.odAccountNumber, eodDay1)
    ]);
  }, 120_000);

  test('Expected daily interest > 0', () => {
    expect(expectedDailyInterest).toBeGreaterThan(0);
  });

  describe('Source a — DB: OverdraftDebtHistory', () => {
    test('UnpaidOverdraftInterest matches formula', () => {
      expect(dbRecord.UnpaidOverdraftInterest).toBe(expectedDailyInterest);
    });
  });

  describe('Source b — API: SearchOverdraft', () => {
    test('accruedODInterest >= expected daily interest', () => {
      expect(searchAfterEOD.accruedODInterest).toBe(expectedDailyInterest);
    });

    test('accruedODInterest matches DB UnpaidOverdraftInterest', () => {
      expect(searchAfterEOD.accruedODInterest).toBe(dbRecord.UnpaidOverdraftInterest);
    });
  });

  describe('Source c — API: ActivityLog', () => {
    test('ActivityLog has an Interest Accrual entry', () => {
      expect(activityLog.some(e => e.transactionType === 'Interest Accrual')).toBe(true);
    });

    test('Interest Accrual entry exists for the EOD financial date', () => {
      const dateStr = dayjs(eodFinDate).format('MM/DD/YYYY');
      expect(activityLog.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr))).toBe(true);
    });

    test('Interest Accrual amount in log matches formula', () => {
      const dateStr = dayjs(eodFinDate).format('MM/DD/YYYY');
      const entry   = activityLog.find(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
      expect(entry).toBeDefined();
      expect(entry.amount).toBe(expectedDailyInterest);
    });

    test('Interest Accrual is on the correct OD account', () => {
      const entry = activityLog.find(e => e.transactionType === 'Interest Accrual');
      expect(entry.accountNumber).toBe(account.odAccountNumber);
    });

    test('Interest Accrual linked account matches savings account', () => {
      const entry = activityLog.find(e => e.transactionType === 'Interest Accrual');
      expect(entry.linkedAccountNumber).toBe(account.linkedAccountNumber);
    });
  });

  describe('Source d — DB: OverdraftDebtBreakdowns', () => {
    test('Breakdown record exists for the financial date', () => {
  expect(breakdownRecords.length).toBeGreaterThan(0);
});

test('UnpaidOverdraftInterest matches formula', () => {
  const interestRecord = breakdownRecords.find(r => r.UnpaidOverdraftInterest > 0);
  expect(interestRecord.UnpaidOverdraftInterest).toBe(expectedDailyInterest);
});

test('UnpaidOverdraftPrincipal matches DebtHistory record', () => {
  const principalRecord = breakdownRecords.find(r => r.UnpaidOverdraftPrincipal > 0);
  expect(principalRecord.UnpaidOverdraftPrincipal).toBe(searchAfterEOD.overdrawnAmount);
});

test('RealDate matches EOD day 1 (principal record)', () => {
  const principalRecord = breakdownRecords.find(r => r.UnpaidOverdraftPrincipal > 0);
  expect(dayjs(principalRecord.RealDate).format('YYYY-MM-DD')).toBe(eodDay1);
});

test('RealDate matches EOD day 1 (interest record)', () => {
  const interestRecord = breakdownRecords.find(r => r.UnpaidOverdraftInterest > 0);
  expect(dayjs(interestRecord.RealDate).format('YYYY-MM-DD')).toBe(eodDay1);
});
  });

  afterAll(async() => {
    const logEntry = activityLog?.find(e => e.transactionType === 'Interest Accrual' && e.description?.includes(dayjs(eodFinDate).format('MM/DD/YYYY')));
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-686 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:      ${account?.odAccountNumber}`);
    console.log(`  Expected daily:  ${expectedDailyInterest}`);
    console.log(`  a. DB History:   ${dbRecord?.UnpaidOverdraftInterest}`);
    console.log(`  b. API Search:   ${searchAfterEOD?.accruedODInterest}`);
    console.log(`  c. API Log:      ${logEntry?.amount ?? 'not found'}`);
    console.log(`  d. DB Breakdown: ${breakdownRecords?.[0]?.UnpaidOverdraftInterest ?? 'no record'}`);
    console.log('══════════════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodDay1);
  });
});
