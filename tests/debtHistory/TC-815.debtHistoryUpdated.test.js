/**
 * CREDIT-TC-815
 * Verify Overdraft Debt History Table is Updated After Running EOD_OverdraftDebtHistory
 *
 * Run: npx jest tests/debtHistory/TC-815 --runInBand
 */

const dayjs = require('dayjs');
const { getNextEODDate } = require('../../data/testData');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, dbRecord, searchAfterEOD, eodFinDate;
eodFinDate = getNextEODDate();

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-815 — Debt History Table Updated After EOD_OverdraftDebtHistory', () => {

  beforeAll(async () => {
    account    = await setupOverdraftAccount();
    eodFinDate = account.drawdownDate;

    await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY] });

    [dbRecord, searchAfterEOD] = await Promise.all([
      db.getDebtHistoryRecord(account.odAccountNumber, eodFinDate),
      api.searchOverdraft(account.odAccountNumber),
    ]);
  }, 120_000);

  describe('Record created', () => {
    test('Record exists in OverdraftDebtHistory for the EOD financial date', () => {
      expect(dbRecord).not.toBeNull();
    });

    test('FinancialDate matches EOD run date', () => {
      expect(dayjs(dbRecord.FinancialDate).format('YYYY-MM-DD')).toBe(eodFinDate);
    });
  });

  describe('Debt values match SearchOverdraft', () => {
    test('UnpaidOverdraftPrincipal = overdrawnAmount from API', () => {
      expect(dbRecord.UnpaidOverdraftPrincipal).toBe(account.searchResponse.overdrawnAmount);
    });

    test('UnpaidOverdraftInterest = accruedODInterest from API (after EOD)', () => {
      expect(dbRecord.UnpaidOverdraftInterest).toBeCloseTo(searchAfterEOD.accruedODInterest, 2);
    });
  });

  describe('Business rule fields', () => {
    test('DaysAtRisk = 1 (first day since drawdown)', () => {
      expect(dbRecord.DaysAtRisk).toBe(1);
    });

    test('DaysPastDue = 0 (payment not yet due)', () => {
      expect(dbRecord.DaysPastDue).toBe(0);
    });

    test('ArrearsBucket = 0 (not past due)', () => {
      expect(dbRecord.ArrearsBucket).toBe(0);
    });

    test('DrawDownDate recorded and matches drawdown day', () => {
      expect(dbRecord.DrawDownDate).not.toBeNull();
      expect(dayjs(dbRecord.DrawDownDate).format('YYYY-MM-DD')).toBe(account.drawdownDate);
    });

    test('UnpaidOverdraftPenalty = 0 (no penalty on day 1)', () => {
      expect(dbRecord.UnpaidOverdraftPenalty).toBe(0);
    });
  });

  describe('BillingStatement fields are null (proc not yet run)', () => {
    test('MinimumPayment is null',    () => expect(dbRecord.MinimumPayment).toBeNull());
    test('PaymentDueDate is null',    () => expect(dbRecord.PaymentDueDate).toBeNull());
    test('NextStatementDate is null', () => expect(dbRecord.NextStatementDate).toBeNull());
    test('AmountOverDue is null',     () => expect(dbRecord.AmountOverDue).toBeNull());
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-815 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:    ${account?.odAccountNumber}`);
    console.log(`  EOD FinDate:   ${eodFinDate}`);
    console.log(`  Principal:     ${dbRecord?.UnpaidOverdraftPrincipal}`);
    console.log(`  Interest:      ${dbRecord?.UnpaidOverdraftInterest}`);
    console.log(`  DaysAtRisk:    ${dbRecord?.DaysAtRisk}`);
    console.log(`  DaysPastDue:   ${dbRecord?.DaysPastDue}`);
    console.log(`  ArrearsBucket: ${dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodFinDate);

  });
});
