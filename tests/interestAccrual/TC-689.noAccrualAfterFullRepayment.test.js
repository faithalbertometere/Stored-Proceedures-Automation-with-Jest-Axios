/**
 * CREDIT-TC-689
 * Verify No Interest Accrual on Debt That Has Been Fully Repaid
 *
 * Run: npx jest tests/interestAccrual/TC-689 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

let account, day1Date, day3Date;
let recordDay1, recordDay3, searchAfterRepayment, activityLogDay3;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-689 — No Interest Accrual After Full Repayment', () => {

    beforeAll(async () => {
      account  = await setupOverdraftAccount();
      day1Date = account.drawdownDate;
      const day2Date = dayjs(day1Date).add(1, 'day').format('YYYY-MM-DD');
      day3Date = dayjs(day1Date).add(2, 'day').format('YYYY-MM-DD');
      
      // Day 1 — DebtHistory first, then InterestAccrual
      await runEODUntil({ fromDate: day1Date, toDate: day1Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
      // Day 2 — DebtHistory picks up day 1's accrued interest
      await runEODUntil({ fromDate: day2Date, toDate: day2Date, procs: [PROCS.DEBT_HISTORY] });
      recordDay1 = await db.getDebtHistoryRecord(account.odAccountNumber, day2Date);
      
      // Full repayment (principal + accrued interest)
      const totalOwed = account.searchResponse.overdrawnAmount + recordDay1.UnpaidOverdraftInterest;
      await api.makeRepayment(account.linkedAccountNumber, totalOwed, generateInstrumentNumber());
    
      // Wait for background worker to process the repayment
      searchAfterRepayment = await api.waitForRepaymentProcessed({
        accountNumber:   account.odAccountNumber,
        expectedBalance: 0,
      });
    
      // Day 3 — EOD after repayment
      await runEODUntil({ fromDate: day3Date, toDate: day3Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    
      [recordDay3, activityLogDay3] = await Promise.all([
        db.getDebtHistoryRecord(account.odAccountNumber, day3Date),
       api.getActivityLog(account.odAccountNumber),
      ]);
    }, 600_000);

  test('Day 1: interest was accruing before repayment', () => {
    expect(recordDay1.UnpaidOverdraftInterest).toBeGreaterThan(0);
  });

  test('After repayment: overdrawnAmount = 0', () => {
    expect(searchAfterRepayment.overdrawnAmount).toBe(0);
  });

  test('After repayment: accruedODInterest = 0', () => {
    expect(searchAfterRepayment.accruedODInterest).toBe(0);
  });

  test('Day 3: DebtHistory record created (no outstanding debt)', () => {
    expect(recordDay3).not.toBeNull();
    expect(recordDay3.UnpaidOverdraftPrincipal).toBe(0);
    expect(recordDay3.UnpaidOverdraftInterest).toBe(0);
  });

  test('Day 3: No Interest Accrual entry in ActivityLog', () => {
    const dateStr = dayjs(day3Date).format('MM/DD/YYYY');
    const entries = activityLogDay3.filter(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
    expect(entries.length).toBe(0);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-689 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:          ${account?.odAccountNumber}`);
    console.log(`  Day 1 interest:      ${recordDay1?.UnpaidOverdraftInterest}`);
    console.log(`  Post-repay balance:  ${searchAfterRepayment?.overdrawnAmount}`);
    console.log(`  Post-repay interest: ${searchAfterRepayment?.accruedODInterest}`);
    console.log(`  Day 3 DB record:     ${recordDay3 ? 'EXISTS (unexpected)' : 'null ✔'}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(day1Date);
  });
});
