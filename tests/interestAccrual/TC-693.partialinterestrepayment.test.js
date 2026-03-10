/**
 * CREDIT-TC-693
 * Verify that when a customer repays half the interest, the remaining interest
 * carries over and new interest accrues on the outstanding principal.
 *
 * Flow:
 *   Day 1 — DebtHistory + InterestAccrual
 *   Day 2 — DebtHistory (interest visible) → repay half interest → EOD
 *   Day 3 — DebtHistory + InterestAccrual
 *   Day 4 — DebtHistory (confirm carried-over interest + new accrual)
 *
 * Run: npx jest tests/interestAccrual/TC-693 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

let account, day1Date, day2Date, day3Date, day4Date;
let recordDay2, recordDay4, searchAfterRepayment, activityLogDay4;
let halfInterest, remainingInterest;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-693 — Partial Interest Repayment: Remaining Interest Carries Over', () => {

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

    // Repay half of the accrued interest
    halfInterest      = Math.floor(recordDay2.UnpaidOverdraftInterest / 2);
    remainingInterest = recordDay2.UnpaidOverdraftInterest - halfInterest;
    // console.log(`  [TC-693] Total interest: ${recordDay2.UnpaidOverdraftInterest} | Half repaid: ${halfInterest} | Remaining: ${remainingInterest}`);

    await api.makeRepayment(account.linkedAccountNumber, halfInterest, generateInstrumentNumber());

    // Wait for repayment to be processed
    searchAfterRepayment = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedInterest: remainingInterest,
    });

    // Day 3 — DebtHistory + InterestAccrual (new interest accrues on outstanding principal)
    await runEODUntil({ fromDate: day3Date, toDate: day3Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    // Day 4 — DebtHistory picks up day 3's interest on top of carried-over interest
    await runEODUntil({ fromDate: day4Date, toDate: day4Date, procs: [PROCS.DEBT_HISTORY] });

    [recordDay4, activityLogDay4] = await Promise.all([
      db.getDebtHistoryRecord(account.odAccountNumber, day4Date),
      api.getActivityLog(account.odAccountNumber),
    ]);
  }, 600_000);

  describe('After partial interest repayment', () => {
    test('overdrawnAmount unchanged — principal still outstanding', () => {
      expect(searchAfterRepayment.overdrawnAmount).toBe(account.searchResponse.overdrawnAmount);
    });

    test('accruedODInterest reflects remaining interest after partial repayment', () => {
      expect(searchAfterRepayment.accruedODInterest).toBe(remainingInterest);
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

  describe('Day 4 record — carried-over interest + new accrual', () => {
    test('DebtHistory record exists', () => {
      expect(recordDay4).not.toBeNull();
    });

    test('UnpaidOverdraftPrincipal unchanged — principal not affected by interest repayment', () => {
      expect(recordDay4.UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
    });

    test('UnpaidOverdraftInterest = remaining interest + one new day of accrual', () => {
      const { overdrawnAmount, interestRate } = account.searchResponse;
      const dailyInterest = (overdrawnAmount * interestRate) / 100 / 30;
      const expected      = remainingInterest + dailyInterest;
      expect(recordDay4.UnpaidOverdraftInterest).toBe(expected);
    });

    test('ActivityLog has Interest Accrual entry for day 3', () => {
      const dateStr = dayjs(day3Date).format('MM/DD/YYYY');
      const found   = activityLogDay4.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));

      console.log("Found", found)
      expect(found).toBe(true);
    });
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-693 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:          ${account?.odAccountNumber}`);
    console.log(`  Original principal:  ${account?.searchResponse?.overdrawnAmount}`);
    console.log(`  Day 2 interest:      ${recordDay2?.UnpaidOverdraftInterest}`);
    console.log(`  Half repaid:         ${halfInterest}`);
    console.log(`  Remaining interest:  ${remainingInterest}`);
    console.log(`  Day 4 principal:     ${recordDay4?.UnpaidOverdraftPrincipal}`);
    console.log(`  Day 4 interest:      ${recordDay4?.UnpaidOverdraftInterest}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(day1Date);
  });
});