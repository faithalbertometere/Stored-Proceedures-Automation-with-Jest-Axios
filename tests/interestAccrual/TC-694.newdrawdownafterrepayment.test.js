/**
 * CREDIT-TC-694
 * Verify interest accrues correctly on updated principal after repayment + new drawdown.
 *
 * Part 1 — Partial repayment (interest + some principal) → new drawdown → EOD → check
 * Part 2 — Full repayment → new drawdown → EOD → check
 *
 * Both parts run on separate accounts in parallel to reduce wait time.
 *
 * Offset rule: repayment clears interest first, then principal.
 * e.g. 5,000 principal + 1,000 interest:
 *   - repay 1,500 → clears 1,000 interest + 500 principal → 4,500 principal remaining
 *   - new drawdown of 2,000 → principal becomes 6,500
 *
 * Run: npx jest tests/interestAccrual/TC-694 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');
const config = require('../../config');

let accountPartial, accountFull;
let day1Date, day2Date, day3Date, day4Date, day5Date, day6Date;
let recordDay2Partial, recordDay2Full;
let recordDay4Partial, recordDay4Full;
let recordDay6Partial, recordDay6Full;
let searchAfterPartial, searchAfterPartialDrawdown;
let searchAfterFull, searchAfterFullDrawdown;
let activityLogDay4Partial, activityLogDay4Full;
let activityLogDay6Partial, activityLogDay6Full;
let partialRepayAmount, newDrawdownAmount;
let expectedPrincipalPart1, expectedPrincipalPart2;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-694 — New Drawdown After Repayment: Interest Accrues on Updated Principal', () => {

  beforeAll(async () => {
    // Set up both accounts in parallel
    [accountPartial, accountFull] = await Promise.all([
      setupOverdraftAccount(),
      setupOverdraftAccount(),
    ]);

    day1Date = accountPartial.drawdownDate;
    day2Date = dayjs(day1Date).add(1, 'day').format('YYYY-MM-DD');
    day3Date = dayjs(day1Date).add(2, 'day').format('YYYY-MM-DD');
    day4Date = dayjs(day1Date).add(3, 'day').format('YYYY-MM-DD');
    day5Date = dayjs(day1Date).add(4, 'day').format('YYYY-MM-DD');
    day6Date = dayjs(day1Date).add(5, 'day').format('YYYY-MM-DD');

    // Day 1 + Day 2 EOD — sequential (shared dates, both accounts picked up)
    await runEODUntil({ fromDate: day1Date, toDate: day1Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    await runEODUntil({ fromDate: day2Date, toDate: day2Date, procs: [PROCS.DEBT_HISTORY] });

    // Fetch day 2 records for both accounts in parallel
    [recordDay2Partial, recordDay2Full] = await Promise.all([
      db.getDebtHistoryRecord(accountPartial.odAccountNumber, day2Date),
      db.getDebtHistoryRecord(accountFull.odAccountNumber, day2Date),
    ]);

    // ── Repayments in parallel ────────────────────────────────────────────
    partialRepayAmount = recordDay2Partial.UnpaidOverdraftInterest + 500;
    const fullRepayAmount = recordDay2Full.UnpaidOverdraftInterest + accountFull.searchResponse.overdrawnAmount;

    console.log(`  [TC-694] Part 1 — partial repayment: ${partialRepayAmount}`);
    console.log(`  [TC-694] Part 2 — full repayment: ${fullRepayAmount}`);

    [searchAfterPartial, searchAfterFull] = await Promise.all([
      api.makeRepayment(accountPartial.linkedAccountNumber, partialRepayAmount, generateInstrumentNumber(),
      ).then(() => api.waitForRepaymentProcessed({
        accountNumber:    accountPartial.odAccountNumber,
        expectedBalance:  accountPartial.searchResponse.overdrawnAmount - 500,
        expectedInterest: 0,
      })),
      api.makeRepayment(accountFull.linkedAccountNumber, fullRepayAmount, generateInstrumentNumber(),
      ).then(() => api.waitForRepaymentProcessed({
        accountNumber:    accountFull.odAccountNumber,
        expectedBalance:  0,
        expectedInterest: 0,
      })),
    ]);

    // ── New drawdowns in parallel ─────────────────────────────────────────
    newDrawdownAmount      = config.smartOD.drawAmount;
    expectedPrincipalPart1 = (accountPartial.searchResponse.overdrawnAmount - 500) + newDrawdownAmount;
    expectedPrincipalPart2 = newDrawdownAmount;

    console.log(`  [TC-694] Part 1 — new drawdown: ${newDrawdownAmount} | expected principal: ${expectedPrincipalPart1}`);
    console.log(`  [TC-694] Part 2 — new drawdown: ${newDrawdownAmount}`);

    [searchAfterPartialDrawdown, searchAfterFullDrawdown] = await Promise.all([
      api.drawdown({
        linkedAccountNumber: accountPartial.linkedAccountNumber,
        amount:              newDrawdownAmount,
        instrumentNumber:    generateInstrumentNumber(),
      }).then(() => api.waitForRepaymentProcessed({
        accountNumber:   accountPartial.odAccountNumber,
        expectedBalance: expectedPrincipalPart1,
      })),
      api.drawdown({
        linkedAccountNumber: accountFull.linkedAccountNumber,
        amount:              newDrawdownAmount,
        instrumentNumber:    generateInstrumentNumber(),
      }).then(() => api.waitForRepaymentProcessed({
        accountNumber:   accountFull.odAccountNumber,
        expectedBalance: expectedPrincipalPart2,
      })),
    ]);

    // ── Day 3 + Day 4 EOD — sequential ───────────────────────────────────
    await runEODUntil({ fromDate: day3Date, toDate: day3Date, procs: [PROCS.RECONCILIATION, PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    await runEODUntil({ fromDate: day4Date, toDate: day4Date, procs: [PROCS.DEBT_HISTORY] });

    [recordDay4Partial, recordDay4Full, activityLogDay4Partial, activityLogDay4Full] = await Promise.all([
      db.getDebtHistoryRecord(accountPartial.odAccountNumber, day4Date),
      db.getDebtHistoryRecord(accountFull.odAccountNumber, day4Date),
      api.getActivityLog(accountPartial.odAccountNumber),
      api.getActivityLog(accountFull.odAccountNumber),
    ]);

    // ── Day 5 + Day 6 EOD — sequential ───────────────────────────────────
    await runEODUntil({ fromDate: day5Date, toDate: day5Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
    await runEODUntil({ fromDate: day6Date, toDate: day6Date, procs: [PROCS.DEBT_HISTORY] });

    [recordDay6Partial, recordDay6Full, activityLogDay6Partial, activityLogDay6Full] = await Promise.all([
      db.getDebtHistoryRecord(accountPartial.odAccountNumber, day6Date),
      db.getDebtHistoryRecord(accountFull.odAccountNumber, day6Date),
      api.getActivityLog(accountPartial.odAccountNumber),
      api.getActivityLog(accountFull.odAccountNumber),
    ]);
  }, 900_000);

  // ── PART 1 assertions ────────────────────────────────────────────────────

  describe('Part 1 — After partial repayment', () => {
    test('overdrawnAmount reduced by 500 — interest cleared, 500 taken from principal', () => {
      expect(searchAfterPartial.overdrawnAmount).toBe(accountPartial.searchResponse.overdrawnAmount - 500);
    });

    test('accruedODInterest = 0 — interest fully cleared', () => {
      expect(searchAfterPartial.accruedODInterest).toBe(0);
    });
  });

  describe('Part 1 — After new drawdown', () => {
    test('overdrawnAmount = reduced principal + new drawdown', () => {
      expect(searchAfterPartialDrawdown.overdrawnAmount).toBe(expectedPrincipalPart1);
    });
  });

  describe('Part 1 — Day 4 DebtHistory record', () => {
    test('Record exists', () => {
      expect(recordDay4Partial).not.toBeNull();
    });

    test('UnpaidOverdraftPrincipal = reduced principal + new drawdown', () => {
      expect(recordDay4Partial.UnpaidOverdraftPrincipal).toBe(expectedPrincipalPart1);
    });

    test('UnpaidOverdraftInterest > 0 — interest accrued on updated principal', () => {
      expect(recordDay4Partial.UnpaidOverdraftInterest).toBeGreaterThan(0);
    });

    test('UnpaidOverdraftInterest = one day accrual on updated principal', () => {
      const { interestRate } = accountPartial.searchResponse;
      const expected = Math.round((expectedPrincipalPart1 * interestRate) / 100 / 30);
      expect(recordDay4Partial.UnpaidOverdraftInterest).toBe(expected);
    });

    test('ActivityLog has Interest Accrual entry for day 3', () => {
      const dateStr = dayjs(day3Date).format('MM/DD/YYYY');
      const found   = activityLogDay4Partial.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
      expect(found).toBe(true);
    });
  });

  // ── PART 2 assertions ────────────────────────────────────────────────────

  describe('Part 2 — After full repayment', () => {
    test('overdrawnAmount = 0', () => {
      expect(searchAfterFull.overdrawnAmount).toBe(0);
    });

    test('accruedODInterest = 0', () => {
      expect(searchAfterFull.accruedODInterest).toBe(0);
    });
  });

  describe('Part 2 — After new drawdown', () => {
    test('overdrawnAmount = new drawdown amount', () => {
      expect(searchAfterFullDrawdown.overdrawnAmount).toBe(expectedPrincipalPart2);
    });
  });

  describe('Part 2 — Day 4 DebtHistory record', () => {
  test('Record exists', () => {
    expect(recordDay4Full).not.toBeNull();
  });

  test('UnpaidOverdraftPrincipal = new drawdown amount only', () => {
    expect(recordDay4Full.UnpaidOverdraftPrincipal).toBe(expectedPrincipalPart2);
  });

  test('UnpaidOverdraftInterest > 0 — interest accrued on new principal', () => {
    expect(recordDay4Full.UnpaidOverdraftInterest).toBeGreaterThan(0);
  });

  test('UnpaidOverdraftInterest = one day accrual on new principal', () => {
    const { interestRate } = accountFull.searchResponse;
    const expected = Math.round((expectedPrincipalPart2 * interestRate) / 100 / 30);
    expect(recordDay4Full.UnpaidOverdraftInterest).toBe(expected);
  });

  test('ActivityLog has Interest Accrual entry for day 3', () => {
    const dateStr = dayjs(day3Date).format('MM/DD/YYYY');
    const found   = activityLogDay4Full.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
    expect(found).toBe(true);
  });
  });

  afterAll(async () => {
    await (
      db.deleteDebtHistoryByDate(day1Date)
    )
  });

});