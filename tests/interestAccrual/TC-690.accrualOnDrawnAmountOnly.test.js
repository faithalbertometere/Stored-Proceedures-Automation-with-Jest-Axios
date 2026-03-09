/**
 * CREDIT-TC-690
 * Verify interest is accrued based on the actual outstanding balance (drawn amount),
 * not the full OD limit
 *
 * Run: npx jest tests/interestAccrual/TC-690 --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const api   = require('../../helpers/apiHelper');

function calcDailyInterest(principal, rate) {
  return (principal * rate) / 100 / 30;
}

let account, eodFinDate, searchAfterEOD, breakdownRecords, expectedInterest;

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-690 — Interest Accrues on Drawn Amount Only, Not the Full Limit', () => {

    beforeAll(async () => {
      account   = await setupOverdraftAccount({ drawAmount: 2500000 });
      eodFinDate  = account.drawdownDate;

      const { overdrawnAmount, interestRate } = account.searchResponse;
      expectedInterest = calcDailyInterest(overdrawnAmount, interestRate);

      // Day 1 — DebtHistory records principal, InterestAccrual accrues interest
      await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });

      [searchAfterEOD, breakdownRecords] = await Promise.all([
        api.searchOverdraft(account.odAccountNumber),
        db.getDebtBreakdownRecords(account.odAccountNumber, eodFinDate),
      ]);
    }, 120_000);

  test('overdrawnAmount = drawn amount (not the full limit)', () => {
    expect(account.searchResponse.overdrawnAmount).toBe(2500000);
  });

  test('SearchOverdraft interest matches formula on drawn amount', () => {
    expect(searchAfterEOD.accruedODInterest).toBe(expectedInterest);
  });

  test('DebtBreakdown interest matches formula on drawn amount', () => {
    const interestRecord = breakdownRecords.find(r => r.UnpaidOverdraftInterest > 0);
    
    expect(interestRecord.UnpaidOverdraftInterest).toBe(expectedInterest);
  });

  test('Interest is NOT calculated on the full limit', () => {
    const { interestRate, limit } = account.searchResponse;
    const interestOnLimit = calcDailyInterest(limit, interestRate);
    
    expect(searchAfterEOD.accruedODInterest).not.toBe(interestOnLimit);
  });

  afterAll(async() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-690 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:        ${account?.odAccountNumber}`);
    console.log(`  Drawn amount:      ${account?.searchResponse?.overdrawnAmount}`);
    console.log(`  OD Limit:          ${account?.searchResponse?.limit}`);
    console.log(`  Expected interest: ${expectedInterest}`);
    console.log(`  Search interest:   ${searchAfterEOD?.accruedODInterest}`);
    console.log(`  Breakdown interest:${breakdownRecords?.find(r => r.UnpaidOverdraftInterest > 0)?.UnpaidOverdraftInterest}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodFinDate)
  });

});
