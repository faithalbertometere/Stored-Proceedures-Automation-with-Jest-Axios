/**
 * CREDIT-TC-688
 * Verify interest is accrued daily as long as the account is in debt
 *
 * Run: npx jest tests/interestAccrual/TC-688 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

const DAYS_TO_RUN = 3;
let account, startDate, accrualEnd, dailyRecords, activityLog, breakdownRecords;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-688 — Interest Accrues Daily While Account is in Debt', () => {
     
  beforeAll(async () => {
      account   = await setupOverdraftAccount();
      startDate = account.drawdownDate;

      accrualEnd = dayjs(startDate).add(DAYS_TO_RUN - 1, 'day').format('YYYY-MM-DD');
      const debtEnd = dayjs(startDate).add(DAYS_TO_RUN, 'day').format('YYYY-MM-DD');

      // Day 1 to 3: DebtHistory first, then InterestAccrual
      await runEODUntil({ fromDate: startDate, toDate: accrualEnd, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
      // Day 4: DebtHistory only — picks up day 3's accrued interest
      await runEODUntil({ fromDate: debtEnd, toDate: debtEnd, procs: [PROCS.DEBT_HISTORY] });

      // Fetch records from day 2 onwards — day 1 will always show 0 interest
      const debtStart     = dayjs(startDate).add(1, 'day').format('YYYY-MM-DD');
      const recordFetches = Array.from({ length: DAYS_TO_RUN }, (_, i) =>
        db.getDebtHistoryRecord(account.odAccountNumber, dayjs(debtStart).add(i, 'day').format('YYYY-MM-DD'))
      );
    
      [dailyRecords, activityLog, breakdownRecords] = await Promise.all([
      Promise.all(recordFetches),
      api.getActivityLog(account.odAccountNumber, 50),
      db.getDebtBreakdownRange(account.odAccountNumber, startDate, accrualEnd),
      ]);
  }, 180_000);

  test('A DebtHistory record exists for each of the 3 days', () => {
    dailyRecords.forEach((rec, i) => {
      const date = dayjs(startDate).add(i, 'day').format('YYYY-MM-DD');
      expect({ date, exists: rec !== null }).toMatchObject({ date, exists: true });
    });
  });

  test('DaysAtRisk increments by 1 each consecutive day', () => {
    dailyRecords.forEach((rec, i) => {
      expect(rec.DaysAtRisk).toBe(i + 2);
    });
  });

  test('UnpaidOverdraftInterest > 0 on every day', () => {
    dailyRecords.forEach((rec, i) => {
      const date = dayjs(startDate).add(i, 'day').format('YYYY-MM-DD');
      expect({ date, interest: rec.UnpaidOverdraftInterest }).toMatchObject({ date, interest: expect.any(Number) });
      expect(rec.UnpaidOverdraftInterest).toBeGreaterThan(0);
    });
  });

  test('ActivityLog has an Interest Accrual entry for each day', () => {
    for (let i = 0; i < DAYS_TO_RUN; i++) {
      const dateStr = dayjs(startDate).add(i, 'day').format('MM/DD/YYYY');
      const found   = activityLog.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
      expect({ date: dateStr, found }).toMatchObject({ date: dateStr, found: true });
    }
  });

  test('UnpaidOverdraftInterest on day 3 equals 3 days of accrual', () => {
      const { overdrawnAmount, interestRate } = account.searchResponse;
      const dailyInterest  = (overdrawnAmount * interestRate) / 100 / 30;
      const expectedTotal  = dailyInterest * DAYS_TO_RUN;
      expect(dailyRecords[DAYS_TO_RUN - 1].UnpaidOverdraftInterest).toBe(expectedTotal);
  });

  test('OverdraftDebtBreakdown has an interest record for each accrual day', () => {
      const interestRecords = breakdownRecords.filter(r => r.UnpaidOverdraftInterest > 0);
      expect(interestRecords.length).toBe(DAYS_TO_RUN);
  });

  test('Each breakdown interest record matches the daily interest formula', () => {
      const { overdrawnAmount, interestRate } = account.searchResponse;
      const dailyInterest  = (overdrawnAmount * interestRate) / 100 / 30;
      const interestRecords = breakdownRecords.filter(r => r.UnpaidOverdraftInterest > 0);

      interestRecords.forEach(rec => {
      expect(rec.UnpaidOverdraftInterest).toBe(dailyInterest);
      });
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-688 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account: ${account?.odAccountNumber}`);
    dailyRecords.forEach((rec, i) => {
      const date = dayjs(startDate).add(i, 'day').format('YYYY-MM-DD');
      console.log(`  Day ${i + 1} (${date}): DaysAtRisk=${rec?.DaysAtRisk}  Interest=${rec?.UnpaidOverdraftInterest}`);
    });
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(startDate);
  });
});
