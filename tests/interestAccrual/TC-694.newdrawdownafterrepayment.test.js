// /**
//  * CREDIT-TC-694
//  * Verify interest accrues correctly on updated principal after repayment + new drawdown.
//  *
//  * Part 1 — Partial repayment (interest + some principal) → new drawdown → EOD → check
//  * Part 2 — Full repayment → new drawdown → EOD → check
//  *
//  * Offset rule: repayment clears interest first, then principal.
//  * e.g. 5,000 principal + 1,000 interest:
//  *   - repay 1,500 → clears 1,000 interest + 500 principal → 4,500 principal remaining
//  *   - new drawdown of 2,000 → principal becomes 6,500
//  *
//  * Run: npx jest tests/interestAccrual/TC-694 --runInBand
//  */

// const dayjs = require('dayjs');
// const db    = require('../../helpers/dbHelper');
// const api   = require('../../helpers/apiHelper');
// const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
// const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
// const { generateInstrumentNumber } = require('../../data/testData');
// const config = require('../../config');

// let account, day1Date, day2Date, day3Date, day4Date, day5Date, day6Date;
// let recordDay2, recordDay4, recordDay6;
// let searchAfterPartial, searchAfterPartialDrawdown;
// let searchAfterFull, searchAfterFullDrawdown;
// let activityLogDay4, activityLogDay6;
// let partialRepayAmount, newDrawdownAmount;
// let expectedPrincipalPart1, expectedPrincipalPart2;

// beforeAll(async () => { await db.connect(); }, 15_000);
// afterAll(async ()  => { await db.disconnect(); });

// describe('CREDIT-TC-694 — New Drawdown After Repayment: Interest Accrues on Updated Principal', () => {

//   beforeAll(async () => {
//     account  = await setupOverdraftAccount();
//     day1Date = account.drawdownDate;
//     day2Date = dayjs(day1Date).add(1, 'day').format('YYYY-MM-DD');
//     day3Date = dayjs(day1Date).add(2, 'day').format('YYYY-MM-DD');
//     day4Date = dayjs(day1Date).add(3, 'day').format('YYYY-MM-DD');
//     day5Date = dayjs(day1Date).add(4, 'day').format('YYYY-MM-DD');
//     day6Date = dayjs(day1Date).add(5, 'day').format('YYYY-MM-DD');

//     // Day 1 — DebtHistory + InterestAccrual
//     await runEODUntil({ fromDate: day1Date, toDate: day1Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
//     // Day 2 — DebtHistory picks up day 1's interest
//     await runEODUntil({ fromDate: day2Date, toDate: day2Date, procs: [PROCS.DEBT_HISTORY] });
//     recordDay2 = await db.getDebtHistoryRecord(account.odAccountNumber, day2Date);

//     // ── PART 1: Partial repayment (interest + 500 principal) + new drawdown ──

//     partialRepayAmount = recordDay2.UnpaidOverdraftInterest + 500;
//     console.log(`  [TC-694] Part 1 — partial repayment: ${partialRepayAmount}`);
//     await api.makeRepayment({
//       linkedAccountNumber: account.linkedAccountNumber,
//       amount:              partialRepayAmount,
//       instrumentNumber:    generateInstrumentNumber(),
//     });

//     const principalAfterPartial = account.searchResponse.overdrawnAmount - 500;
//     searchAfterPartial = await api.waitForRepaymentProcessed({
//       accountNumber:   account.odAccountNumber,
//       expectedBalance: principalAfterPartial,
//       expectedInterest: 0
//     });

//     newDrawdownAmount      = config.smartOD.drawAmount;
//     expectedPrincipalPart1 = principalAfterPartial + newDrawdownAmount;
//     console.log(`  [TC-694] Part 1 — new drawdown: ${newDrawdownAmount} | expected principal: ${expectedPrincipalPart1}`);
//     await api.drawdown({
//       linkedAccountNumber: account.linkedAccountNumber,
//       amount:              newDrawdownAmount,
//       instrumentNumber:    generateInstrumentNumber(),
//     });

//     searchAfterPartialDrawdown = await api.waitForRepaymentProcessed({
//       accountNumber:   account.odAccountNumber,
//       expectedBalance: expectedPrincipalPart1,
//     });

//     // Day 3 — DebtHistory + InterestAccrual on updated principal
//     await runEODUntil({ fromDate: day3Date, toDate: day3Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
//     // Day 4 — DebtHistory picks up day 3's interest
//     await runEODUntil({ fromDate: day4Date, toDate: day4Date, procs: [PROCS.DEBT_HISTORY] });

//     [recordDay4, activityLogDay4] = await Promise.all([
//       db.getDebtHistoryRecord(account.odAccountNumber, day4Date),
//       api.getActivityLog(account.odAccountNumber),
//     ]);

//     // ── PART 2: Full repayment + new drawdown ─────────────────────────────
//     const currentState = await api.searchOverdraft(account.odAccountNumber);
//     const totalOwed    = currentState.overdrawnAmount + currentState.accruedODInterest;

//     console.log(`  [TC-694] Part 2 — full repayment: ${totalOwed}`);
//     await api.makeRepayment({
//       linkedAccountNumber: account.linkedAccountNumber,
//       amount:              totalOwed,
//       instrumentNumber:    generateInstrumentNumber(),
//     });

//     searchAfterFull = await api.waitForRepaymentProcessed({
//       accountNumber:   account.odAccountNumber,
//       expectedBalance: 0,
//       expectedInterest: 0,
//     });

//     expectedPrincipalPart2 = config.smartOD.drawAmount;

//     await api.drawdown({
//       linkedAccountNumber: account.linkedAccountNumber,
//       amount:              expectedPrincipalPart2,
//       instrumentNumber:    generateInstrumentNumber(),
//     });

//     searchAfterFullDrawdown = await api.waitForRepaymentProcessed({
//       accountNumber:   account.odAccountNumber,
//       expectedBalance: expectedPrincipalPart2,
//     });

//     // Day 5 — DebtHistory + InterestAccrual on new principal
//     await runEODUntil({ fromDate: day5Date, toDate: day5Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
//     // Day 6 — DebtHistory picks up day 5's interest
//     await runEODUntil({ fromDate: day6Date, toDate: day6Date, procs: [PROCS.DEBT_HISTORY] });

//     [recordDay6, activityLogDay6] = await Promise.all([
//       db.getDebtHistoryRecord(account.odAccountNumber, day6Date),
//       api.getActivityLog(account.odAccountNumber),
//     ]);
//   }, 900_000);

//   // ── PART 1 assertions ────────────────────────────────────────────────────

//   describe('Part 1 — After partial repayment', () => {
//     test('overdrawnAmount reduced by 500 — interest cleared, 500 taken from principal', () => {
//       expect(searchAfterPartial.overdrawnAmount).toBe(account.searchResponse.overdrawnAmount - 500);
//     });

//     test('accruedODInterest = 0 — interest fully cleared', () => {
//       expect(searchAfterPartial.accruedODInterest).toBe(0);
//     });
//   });

//   describe('Part 1 — After new drawdown', () => {
//     test('overdrawnAmount = reduced principal + new drawdown', () => {
//       expect(searchAfterPartialDrawdown.overdrawnAmount).toBe(expectedPrincipalPart1);
//     });
//   });

//   describe('Part 1 — Day 4 DebtHistory record', () => {
//     test('Record exists', () => {
//       expect(recordDay4).not.toBeNull();
//     });

//     test('UnpaidOverdraftPrincipal = reduced principal + new drawdown', () => {
//       expect(recordDay4.UnpaidOverdraftPrincipal).toBe(expectedPrincipalPart1);
//     });

//     test('UnpaidOverdraftInterest > 0 — interest accrued on updated principal', () => {
//       expect(recordDay4.UnpaidOverdraftInterest).toBeGreaterThan(0);
//     });

//     test('UnpaidOverdraftInterest = one day accrual on updated principal', () => {
//       const { interestRate } = account.searchResponse;
//       const expected = Math.round((expectedPrincipalPart1 * interestRate) / 100 / 30);
//       expect(recordDay4.UnpaidOverdraftInterest).toBe(expected);
//     });

//     test('ActivityLog has Interest Accrual entry for day 3', () => {
//       const dateStr = dayjs(day3Date).format('MM/DD/YYYY');
//       const found   = activityLogDay4.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
//       expect(found).toBe(true);
//     });
//   });

//   // ── PART 2 assertions ────────────────────────────────────────────────────

//   describe('Part 2 — After full repayment', () => {
//     test('overdrawnAmount = 0', () => {
//       expect(searchAfterFull.overdrawnAmount).toBe(0);
//     });

//     test('accruedODInterest = 0', () => {
//       expect(searchAfterFull.accruedODInterest).toBe(0);
//     });
//   });

//   describe('Part 2 — After new drawdown', () => {
//     test('overdrawnAmount = new drawdown amount', () => {
//       expect(searchAfterFullDrawdown.overdrawnAmount).toBe(expectedPrincipalPart2);
//     });
//   });

//   describe('Part 2 — Day 6 DebtHistory record', () => {
//     test('Record exists', () => {
//       expect(recordDay6).not.toBeNull();
//     });

//     test('UnpaidOverdraftPrincipal = new drawdown amount only', () => {
//       expect(recordDay6.UnpaidOverdraftPrincipal).toBe(expectedPrincipalPart2);
//     });

//     test('UnpaidOverdraftInterest > 0 — interest accrued on new principal', () => {
//       expect(recordDay6.UnpaidOverdraftInterest).toBeGreaterThan(0);
//     });

//     test('UnpaidOverdraftInterest = one day accrual on new principal', () => {
//       const { interestRate } = account.searchResponse;
//       const expected = Math.round((expectedPrincipalPart2 * interestRate) / 100 / 30);
//       expect(recordDay6.UnpaidOverdraftInterest).toBe(expected);
//     });

//     test('ActivityLog has Interest Accrual entry for day 5', () => {
//       const dateStr = dayjs(day5Date).format('MM/DD/YYYY');
//       const found   = activityLogDay6.some(e => e.transactionType === 'Interest Accrual' && e.description.includes(dateStr));
//       expect(found).toBe(true);
//     });
//   });

//   afterAll(async () => {
//     console.log('\n══════════════════════════════════════════');
//     console.log('  CREDIT-TC-694 — Summary');
//     console.log('══════════════════════════════════════════');
//     console.log(`  OD Account:                 ${account?.odAccountNumber}`);
//     console.log(`  Original principal:         ${account?.searchResponse?.overdrawnAmount}`);
//     console.log(`  Day 2 interest:             ${recordDay2?.UnpaidOverdraftInterest}`);
//     console.log('  --- Part 1 ---');
//     console.log(`  Partial repaid:             ${partialRepayAmount}`);
//     console.log(`  Principal after partial:    ${searchAfterPartial?.overdrawnAmount}`);
//     console.log(`  New drawdown:               ${newDrawdownAmount}`);
//     console.log(`  Day 4 principal:            ${recordDay4?.UnpaidOverdraftPrincipal}`);
//     console.log(`  Day 4 interest:             ${recordDay4?.UnpaidOverdraftInterest}`);
//     console.log('  --- Part 2 ---');
//     console.log(`  Post-full repay balance:    ${searchAfterFull?.overdrawnAmount}`);
//     console.log(`  New drawdown:               ${expectedPrincipalPart2}`);
//     console.log(`  Day 6 principal:            ${recordDay6?.UnpaidOverdraftPrincipal}`);
//     console.log(`  Day 6 interest:             ${recordDay6?.UnpaidOverdraftInterest}`);
//     console.log('══════════════════════════════════════════\n');
//     await db.deleteDebtHistoryByDate(day1Date);
//   });
// });

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
      api.makeRepayment({
        linkedAccountNumber: accountPartial.linkedAccountNumber,
        amount:              partialRepayAmount,
        instrumentNumber:    generateInstrumentNumber(),
      }).then(() => api.waitForRepaymentProcessed({
        accountNumber:    accountPartial.odAccountNumber,
        expectedBalance:  accountPartial.searchResponse.overdrawnAmount - 500,
        expectedInterest: 0,
      })),
      api.makeRepayment({
        linkedAccountNumber: accountFull.linkedAccountNumber,
        amount:              fullRepayAmount,
        instrumentNumber:    generateInstrumentNumber(),
      }).then(() => api.waitForRepaymentProcessed({
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
    await runEODUntil({ fromDate: day3Date, toDate: day3Date, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });
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
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-694 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  --- Part 1 (Partial Repayment) ---`);
    console.log(`  OD Account:                 ${accountPartial?.odAccountNumber}`);
    console.log(`  Original principal:         ${accountPartial?.searchResponse?.overdrawnAmount}`);
    console.log(`  Day 2 interest:             ${recordDay2Partial?.UnpaidOverdraftInterest}`);
    console.log(`  Partial repaid:             ${partialRepayAmount}`);
    console.log(`  Principal after partial:    ${searchAfterPartial?.overdrawnAmount}`);
    console.log(`  New drawdown:               ${newDrawdownAmount}`);
    console.log(`  Day 4 principal:            ${recordDay4Partial?.UnpaidOverdraftPrincipal}`);
    console.log(`  Day 4 interest:             ${recordDay4Partial?.UnpaidOverdraftInterest}`);
    console.log(`  --- Part 2 (Full Repayment) ---`);
    console.log(`  OD Account:                 ${accountFull?.odAccountNumber}`);
    console.log(`  Original principal:         ${accountFull?.searchResponse?.overdrawnAmount}`);
    console.log(`  Day 2 interest:             ${recordDay2Full?.UnpaidOverdraftInterest}`);
    console.log(`  Post-full repay balance:    ${searchAfterFull?.overdrawnAmount}`);
    console.log(`  New drawdown:               ${expectedPrincipalPart2}`);
    console.log(`  Day 6 principal:            ${recordDay6Full?.UnpaidOverdraftPrincipal}`);
    console.log(`  Day 6 interest:             ${recordDay6Full?.UnpaidOverdraftInterest}`);
    console.log('══════════════════════════════════════════\n');
    await Promise.all([
      db.deleteDebtHistoryByDate(day1Date),
    ]);
  });
});