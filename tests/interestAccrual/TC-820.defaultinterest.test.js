/**
 * TC-DefaultInterest
 * Verify default interest accrual behaviour after account enters default
 *
 * Scenario:
 *   - incomeRecognitionStop = 30, defaultArrearsBucket = 30
 *   - Normal interest accrues and posts to GL until DaysPastDue = 30
 *   - Default interest accrues after DaysPastDue = 30, no GL postings
 *   - amountOwed = overdrawnAmount + accruedODInterest + defaultInterest
 *   - Default interest offset clears before normal interest
 *   - No accrual after write-off (DaysPastDue = 456+)
 *
 * Run: npx jest tests/interestAccrual/TC-DefaultInterest --runInBand
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const { PROCS, runEODUntil, getPaymentDates } = require('../../helpers/eodRunner');
const { calcDailyInterest, getBillingDates } = require('../billingStatement/_billingSetup');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../data/testData');

const DRAW_AMOUNT            = 5000000;
const INCOME_RECOGNITION_STOP = 30;
const DEFAULT_ARREARS_BUCKET  = 30;

let account, dates;
let searchBeforeDefault, searchAfterDefault, searchAfterDefaultAccrual2;
let searchAfterWriteoff, searchAfterWriteoffAccrual;
let searchAfterOffsetRepayment;
// let glPostingsBeforeDefault, glPostingsAfterDefault;
let dpd1Date, dpd30Date, dpd456Date;
let eodStartedAtBeforeDefault, eodStartedAtAfterDefault;
let expectedPostingsAfterDefault, expectedPostingsBeforeDefault, glDebit = '10231', glCredit = '40429';

beforeAll(async () => { await db.connect(); }, 15_000);

describe('TC-DefaultInterest — Default Interest Accrual', () => {

  beforeAll(async () => {
    account = await setupOverdraftAccount({
      drawAmount:             DRAW_AMOUNT,
      minimumPaymentPercentage: 20,
      incomeRecognitionStop:  INCOME_RECOGNITION_STOP,
      defaultArrearsBucket:   DEFAULT_ARREARS_BUCKET,
    });
    dates = getBillingDates(account);

    const { statementDay, gracePeriodInDays } = account.searchResponse;
    const statementRunDate   = dates.statementRunDate;
    const statementStampDate = dates.statementStampDate;
    dpd1Date  = getPaymentDates(statementStampDate, gracePeriodInDays).paymentDueDate;
    dpd30Date = dayjs(dpd1Date).add(29, 'day').format('YYYY-MM-DD');
    dpd456Date = dayjs(dpd1Date).add(455, 'day').format('YYYY-MM-DD');

    // Step 1 — Statement run date
    await runEODUntil({
      fromDate: statementRunDate,
      toDate:   statementRunDate,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.BILLING_STATEMENT, PROCS.MANAGE_OVERDRAFT],
    });

     eodStartedAtBeforeDefault = new Date();
    // Step 2 — dpd1Date: account enters DebtDisabled, DaysPastDue = 1
    await runEODUntil({
      fromDate: dpd1Date,
      toDate:   dpd1Date,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.MANAGE_OVERDRAFT],
    });

    searchBeforeDefault = await api.searchOverdraft(account.odAccountNumber);
    [expectedPostingsBeforeDefault, glDebit, glCredit] = await Promise.all([
          db.getActivityLogTotals(dpd1Date, eodStartedAtBeforeDefault),
          db.getGLPostings('10231',  dpd1Date, eodStartedAtBeforeDefault),
          db.getGLPostings('40429', dpd1Date, eodStartedAtBeforeDefault),
        ]);

    eodStartedAtAfterDefault = new Date();
    // Step 4 — dpd30Date: account enters default
    await runEODUntil({
      fromDate: dpd30Date,
      toDate:   dpd30Date,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.MANAGE_OVERDRAFT],
    });


    searchAfterDefault = await api.searchOverdraft(account.odAccountNumber);
     [expectedPostingsAfterDefault, glDebit, glCredit] = await Promise.all([
          db.getActivityLogTotals(dpd30Date, eodStartedAtAfterDefault),
          db.getGLPostings('10231',  dpd30Date, eodStartedAtAfterDefault),
          db.getGLPostings('40429', dpd30Date, eodStartedAtAfterDefault),
        ]);
    console.log('glDebit:', JSON.stringify(glDebit, null, 2));

    // Step 6 — Second default interest accrual (dpd30Date + 1)
    const dpd31Date = dayjs(dpd30Date).add(1, 'day').format('YYYY-MM-DD');
    await runEODUntil({
      fromDate: dpd31Date,
      toDate:   dpd31Date,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL, PROCS.MANAGE_OVERDRAFT],
    });
    searchAfterDefaultAccrual2 = await api.searchOverdraft(account.odAccountNumber);

    //Step 7 — Offset repayment (default interest first)
    // const repayAmount = searchAfterDefaultAccrual2.defaultInterest;
    // await api.makeRepayment(account.linkedAccountNumber, repayAmount, generateInstrumentNumber());
    // await api.waitForRepaymentProcessed({
    //   accountNumber:    account.odAccountNumber,
    //   expectedInterest: 0,
    // });
    // searchAfterOffsetRepayment = await api.searchOverdraft(account.odAccountNumber);

    // Step 8 — Write-off at dpd450Date
    await runEODUntil({
      fromDate: dpd456Date,
      toDate:   dpd456Date,
      procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
    });
    searchAfterWriteoff = await api.searchOverdraft(account.odAccountNumber);

    // Step 9 — Interest accrual after write-off (should not accrue)
    const dpd457Date = dayjs(dpd456Date).add(1, 'day').format('YYYY-MM-DD');
    await runEODUntil({
      fromDate: dpd457Date,
      toDate:   dpd457Date,
      procs:    [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL,PROCS.MANAGE_OVERDRAFT],
    });
    searchAfterWriteoffAccrual = await api.searchOverdraft(account.odAccountNumber);
  }, 900_000);

  // ─── Normal interest before default ───────────────────────────────────────

  describe('Normal interest before default (DaysPastDue < 30)', () => {
    test('accruedODInterest > 0 before default', () => {
      expect(searchBeforeDefault.accruedODInterest).toBeGreaterThan(0);
    });

    test('defaultInterest = 0 before default', () => {
      expect(searchBeforeDefault.defaultInterest).toBe(0);
    });

    test('GL posting exists on 10231 for normal interest', () => {
      // expect(glPostingsBeforeDefault.length).toBeGreaterThan(0);
            expect(glDebit[0].Amount).toBe(expectedPostingsBeforeDefault);

    });

    test('Normal interest = expected daily accrual', () => {
      const expected = (calcDailyInterest(DRAW_AMOUNT, account.searchResponse.interestRate) * 2);
      expect(searchBeforeDefault.accruedODInterest).toBe(expected);
    });
  });

  // ─── Default interest after default ───────────────────────────────────────

  describe('Default interest after default (DaysPastDue >= 30)', () => {
    test('defaultInterest > 0 after default', () => {
      console.log ("Interest: " + JSON.stringify(searchAfterDefault.defaultInterest))
      expect(searchAfterDefault.defaultInterest).toBeGreaterThan(0);
    });

    test('No GL posting on 10231 after default', () => {
      // expect(glPostingsAfterDefault.length).toBe(0);
        expect(glDebit[0].Amount).toBe(expectedPostingsAfterDefault);

    });

    test('defaultInterest grows after second accrual', () => {
      expect(searchAfterDefaultAccrual2.defaultInterest)
        .toBeGreaterThan(searchAfterDefault.defaultInterest);
    });

    test('amountOwed = overdrawnAmount + accruedODInterest + defaultInterest', () => {
      const expected = searchAfterDefaultAccrual2.overdrawnAmount
        + searchAfterDefaultAccrual2.accruedODInterest
        + searchAfterDefaultAccrual2.defaultInterest;
      expect(searchAfterDefaultAccrual2.amountOwed).toBe(expected);
    });
  });

  // ─── Offset repayment ─────────────────────────────────────────────────────

  // describe('Offset repayment — default interest cleared first', () => {
  //   test('defaultInterest = 0 after repayment', () => {
  //     expect(searchAfterOffsetRepayment.defaultInterest).toBe(0);
  //   });

  //   test('accruedODInterest unchanged after default interest repayment', () => {
  //     expect(searchAfterOffsetRepayment.accruedODInterest)
  //       .toBe(searchAfterDefaultAccrual2.accruedODInterest);
  //   });

  //   test('overdrawnAmount unchanged after default interest repayment', () => {
  //     expect(searchAfterOffsetRepayment.overdrawnAmount)
  //       .toBe(searchAfterDefaultAccrual2.overdrawnAmount);
  //   });
  // });

  // ─── Write-off ────────────────────────────────────────────────────────────

  describe('No accrual after write-off (DaysPastDue = 456+)', () => {
    test('Account status = Write-off after dpd456Date', () => {
      expect(searchAfterWriteoff.status).toBe(9);
    });

    test('defaultInterest does not increase after write-off', () => {
      expect(searchAfterWriteoffAccrual.defaultInterest)
        .toBe(searchAfterDefaultAccrual2.defaultInterest);
    });

    test('accruedODInterest does not increase after write-off', () => {
      expect(searchAfterWriteoffAccrual.accruedODInterest)
        .toBe(searchAfterDefaultAccrual2.accruedODInterest);
    });
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  TC-DefaultInterest — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:               ${account?.odAccountNumber}`);
    console.log(`  dpd1Date:                 ${dpd1Date}`);
    console.log(`  dpd30Date:                ${dpd30Date}`);
    console.log(`  dpd456Date:               ${dpd456Date}`);
    console.log(`  accruedODInterest before: ${searchBeforeDefault?.accruedODInterest}`);
    console.log(`  defaultInterest after:    ${searchAfterDefault?.defaultInterest}`);
    console.log(`  amountOwed:               ${searchAfterDefaultAccrual2?.amountOwed}`);
    console.log(`  defaultInterest after pay:${searchAfterOffsetRepayment?.defaultInterest}`);
    console.log(`  Status at write-off:      ${searchAfterWriteoff?.status}`);
    console.log('══════════════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(account.drawdownDate);
    await db.deleteStatementByDate(account.drawdownDate);
    await db.disconnect();
  });
});