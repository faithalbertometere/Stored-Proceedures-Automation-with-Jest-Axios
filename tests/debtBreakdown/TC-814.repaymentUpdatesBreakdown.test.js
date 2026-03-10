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
let account, day1Date, day3Date;
let breakdownDay1, breakdownDay3, searchAfterRepayment;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-814 — Repayment Updates OverdraftDebtBreakdown', () => {

  beforeAll(async () => {
    account  = await setupOverdraftAccount({ drawAmount: 3000000 });
    day1Date = account.drawdownDate;
    day3Date = dayjs(day1Date).add(2, 'day').format('YYYY-MM-DD');

    // Day 1 — EOD, breakdown records created
    await runEODUntil({ fromDate: day1Date, toDate: day1Date, procs: [PROCS.DEBT_HISTORY] });
    breakdownDay1 = await db.getDebtBreakdownRecords(account.odAccountNumber, day1Date);

    // Partial repayment
    console.log(`  [TC-814] Partial repayment: ${PARTIAL_REPAYMENT}`);
    await api.makeRepayment(account.linkedAccountNumber, PARTIAL_REPAYMENT, generateInstrumentNumber());

    // Wait for background worker to process the repayment
    const expectedBalance = account.searchResponse.overdrawnAmount - PARTIAL_REPAYMENT;
    searchAfterRepayment = await api.waitForRepaymentProcessed({
      accountNumber:   account.odAccountNumber,
      expectedBalance,
    });

    // Day 3 — EOD after repayment, check breakdown reflects reduced principal
    await runEODUntil({ fromDate: day3Date, toDate: day3Date, procs: [PROCS.DEBT_HISTORY] });
    breakdownDay3 = await db.getDebtBreakdownRecords(account.odAccountNumber, day3Date);
  }, 600_000);

  test('Day 1: breakdown record exists before repayment', () => {
    expect(breakdownDay1.length).toBeGreaterThan(0);
  });

  test('Day 1: principal = full drawdown amount', () => {
    expect(breakdownDay1[0].UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
  });

  test('After repayment: overdrawnAmount reduced on SearchOverdraft', () => {
    const expectedBalance = account.searchResponse.overdrawnAmount - PARTIAL_REPAYMENT;
    expect(searchAfterRepayment.overdrawnAmount).toBeCloseTo(expectedBalance, 2);
  });

  test('Day 3: breakdown record exists after repayment', () => {
    expect(breakdownDay3.length).toBeGreaterThan(0);
  });

  test('Day 3: principal is less than Day 1 (repayment reflected)', () => {
    expect(breakdownDay3[0].UnpaidOverdraftPrincipal).toBeLessThan(breakdownDay1[0].UnpaidOverdraftPrincipal);
  });

  test('Day 3: principal matches reduced overdrawnAmount from API', () => {
    expect(breakdownDay3[0].UnpaidOverdraftPrincipal).toBeCloseTo(searchAfterRepayment.overdrawnAmount, 2);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-814 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:         ${account?.odAccountNumber}`);
    console.log(`  Original principal: ${breakdownDay1?.[0]?.UnpaidOverdraftPrincipal}`);
    console.log(`  Repayment:          ${PARTIAL_REPAYMENT}`);
    console.log(`  Day 3 principal:    ${breakdownDay3?.[0]?.UnpaidOverdraftPrincipal}`);
    console.log(`  API balance after:  ${searchAfterRepayment?.overdrawnAmount}`);
    console.log('══════════════════════════════════════════\n');
  });
});
