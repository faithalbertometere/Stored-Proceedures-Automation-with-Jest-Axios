/**
 * CREDIT-TC-814
 * Verify Repayment Updates on OverdraftDebtBreakdown After Repayment
 *
 * Run: npx jest tests/debtBreakdown/TC-814 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

const PARTIAL_REPAYMENT = 1000000;
let account, day1Date, expectedBalance;
let breakdown1, breakdown2, searchAfterRepayment, debthistory;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-814 — Repayment Updates OverdraftDebtBreakdown', () => {

  beforeAll(async () => {
    account  = await setupOverdraftAccount({ drawAmount: 3000000 });
    day1Date = account.drawdownDate;
    // day3Date = dayjs(day1Date).add(2, 'day').format('YYYY-MM-DD');

    // // Day 1 — EOD, breakdown records created
    breakdown1 = await db.getDebtBreakdownRecords(account.odAccountNumber, day1Date);

    // Partial repayment
    await api.makeRepayment(account.linkedAccountNumber, PARTIAL_REPAYMENT, generateInstrumentNumber());

    // Wait for background worker to process the repayment
    const expectedBalance = account.searchResponse.overdrawnAmount - PARTIAL_REPAYMENT;
    searchAfterRepayment = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedBalance,
    });

    // Day 3 — EOD after repayment, check breakdown reflects reduced principal
    await runEODUntil({ fromDate: day1Date, toDate: day1Date, procs: [PROCS.RECONCILIATION, PROCS.DEBT_HISTORY] });
    breakdown2 = await db.getDebtBreakdownRecords(account.odAccountNumber, day1Date);
    debthistory = await db.getDebtHistoryRecord(account.odAccountNumber, day1Date);
  }, 600_000);

  test('Day 1: breakdown record exists before repayment', () => {
    expect(breakdown1.length).toBeGreaterThan(0);
  });

  test('Day 1: principal = full drawdown amount', () => {
    expect(breakdown1[0].UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
  });

  test('After repayment: overdrawnAmount reduced on SearchOverdraft', () => {
    expectedBalance = account.searchResponse.overdrawnAmount - PARTIAL_REPAYMENT;
    expect(searchAfterRepayment.overdrawnAmount).toBe(expectedBalance);
  });

  test('Day 3: breakdown record exists after repayment', () => {
    expect(breakdown2.length).toBeGreaterThan(0);
  });

  test('Day 3: principal is less than Day 1 (repayment reflected)', () => {
    expect(breakdown2[0].UnpaidOverdraftPrincipal).toBe(expectedBalance);
    expect(breakdown2[1].RepaymentStatus).toBe(3);
    expect(breakdown2[0].RepaymentStatus).toBe(1);
  });

  test('Day 3: principal matches reduced overdrawnAmount from API', () => {
    expect(breakdown2[0].UnpaidOverdraftPrincipal).toBe(searchAfterRepayment.overdrawnAmount);
  });

   test('OverdraftDebtHistory record reflects correct OutstandingPrincipal', () => {
    expect(debthistory.UnpaidOverdraftPrincipal).toBe(searchAfterRepayment.overdrawnAmount);
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-814 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:         ${account?.odAccountNumber}`);
    console.log(`  Original principal: ${breakdown1?.[0]?.UnpaidOverdraftPrincipal}`);
    console.log(`  Repayment:          ${PARTIAL_REPAYMENT}`);
    console.log(`  Day 3 principal:    ${breakdown2?.[0]?.UnpaidOverdraftPrincipal}`);
    console.log(`  API balance after:  ${searchAfterRepayment?.overdrawnAmount}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(account.drawdownDate);
  });
});
