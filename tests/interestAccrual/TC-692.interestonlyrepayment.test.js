/**
 * CREDIT-TC-692
 * Verify that when a customer repays interest only, the principal remains unchanged,
 * and new interest accrues on the outstanding principal the next day.
 *
 * Flow:
 *   Day 1 — DebtHistory + InterestAccrual
 *   Day 2 — DebtHistory (interest visible) → repay exact interest amount → EOD
 *   Day 3 — DebtHistory + InterestAccrual (new interest accrues on same principal)
 *   Day 4 — DebtHistory (confirm new interest recorded)
 *
 * Run: npx jest tests/interestAccrual/TC-692 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

let account, day1Date, day2Date, day3Date, day4Date;
let recordDay2, recordDay4, searchAfterRepayment, activityLogDay4;
let interestRepaid;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-692 — Interest-Only Repayment: Principal Remains, New Interest Accrues', () => {

  beforeAll(async () => {
    account  = await setupOverdraftAccount();
    day1Date = account.drawdownDate;
    day2Date = dayjs(day1Date).add(1, 'day').format('YYYY-MM-DD');
    day3Date = dayjs(day1Date).add(2, 'day').format('YYYY-MM-DD');
    day4Date = dayjs(day1Date).add(3, 'day').format('YYYY-MM-DD');

    // Day 1 — DebtHistory records principal, InterestAccrual accrues interest
    await runEODUntil({ fromDate: day1Date, toDate: day1Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    // Day 2 — DebtHistory picks up day 1's accrued interest
    await runEODUntil({ fromDate: day2Date, toDate: day2Date, procs: [PROCS.DEBT_HISTORY] });
    recordDay2 = await db.getDebtHistoryRecord(account.odAccountNumber, day2Date);

    // Repay exact interest amount only — principal untouched
    interestRepaid = recordDay2.UnpaidOverdraftInterest;
    console.log(`  [TC-692] Interest-only repayment: ${interestRepaid}`);
    await api.makeRepayment(account.linkedAccountNumber, interestRepaid, generateInstrumentNumber());
   
    // Wait for repayment to be processed
    searchAfterRepayment = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedInterest: 0,
      pollIntervalMs:   5_000,
    });

    // Day 3 — DebtHistory + InterestAccrual (new interest accrues on outstanding principal)
    await runEODUntil({ fromDate: day3Date, toDate: day3Date, procs: [PROCS.RECONCILIATION, PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    // Day 4 — DebtHistory picks up day 3's new interest
    await runEODUntil({ fromDate: day4Date, toDate: day4Date, procs: [PROCS.DEBT_HISTORY] });

    [recordDay4, activityLogDay4] = await Promise.all([
      db.getDebtHistoryRecord(account.odAccountNumber, day4Date),
      api.getActivityLog(account.odAccountNumber),
    ]);
  }, 600_000);

  describe('After interest-only repayment', () => {
    test('overdrawnAmount unchanged — principal still outstanding', () => {
      expect(searchAfterRepayment.overdrawnAmount).toBe(account.searchResponse.overdrawnAmount);
    });

    test('accruedODInterest = 0 immediately after repayment', () => {
      expect(searchAfterRepayment.accruedODInterest).toBe(0);
    });
  });

  describe('Day 2 record — before repayment', () => {
    test('UnpaidOverdraftInterest > 0', () => {
      expect(recordDay2.UnpaidOverdraftInterest).toBeGreaterThan(0);
    });

    test('UnpaidOverdraftPrincipal matches drawdown amount', () => {
      expect(recordDay2.UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
    });
  });

  describe('Day 4 record — after interest-only repayment', () => {
    test('DebtHistory record exists', () => {
      expect(recordDay4).not.toBeNull();
    });

    test('UnpaidOverdraftPrincipal still matches original drawdown — principal unchanged', () => {
      expect(recordDay4.UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
    });

    test('UnpaidOverdraftInterest > 0 — new interest accrued on outstanding principal', () => {
      expect(recordDay4.UnpaidOverdraftInterest).toBeGreaterThan(0);
    });

    test('New interest equals one day of accrual on the original principal', () => {
      const { overdrawnAmount, interestRate } = account.searchResponse;
      const expectedDailyInterest = (overdrawnAmount * interestRate) / 100 / 30;
      expect(recordDay4.UnpaidOverdraftInterest).toBe(expectedDailyInterest);
    });

    test('ActivityLog has Interest Accrual entry for day 3', () => {
      const dateStr = dayjs(day3Date).format('MM/DD/YYYY');
      const found   = activityLogDay4.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
      expect(found).toBe(true);
    });
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-692 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:          ${account?.odAccountNumber}`);
    console.log(`  Original principal:  ${account?.searchResponse?.overdrawnAmount}`);
    console.log(`  Interest repaid:     ${interestRepaid}`);
    console.log(`  Post-repay balance:  ${searchAfterRepayment?.overdrawnAmount}`);
    console.log(`  Day 2 interest:      ${recordDay2?.UnpaidOverdraftInterest}`);
    console.log(`  Day 4 principal:     ${recordDay4?.UnpaidOverdraftPrincipal}`);
    console.log(`  Day 4 interest:      ${recordDay4?.UnpaidOverdraftInterest}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(day1Date);
  });
});