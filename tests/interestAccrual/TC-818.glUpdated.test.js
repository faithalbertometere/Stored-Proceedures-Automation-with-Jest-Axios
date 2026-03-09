const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const { PROCS, runEODUntil } = require('../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../fixtures/overdraftSetup');

let account, eodFinDate, eodStartedAt;
let glDebit, glCredit;
let expectedTotalInterest;

const GL_DEBIT  = '10231';
const GL_CREDIT = '40429';

beforeAll(async () => { await db.connect(); }, 15_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-818 — GL Accounts Updated After Interest Accrual', () => {

  beforeAll(async () => {
    account    = await setupOverdraftAccount();
    eodFinDate = account.drawdownDate;

    // Capture timestamp just before EOD so we can isolate this run's postings
    eodStartedAt = new Date();

    await runEODUntil({ fromDate: eodFinDate, toDate: eodFinDate, procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL] });

    [expectedTotalInterest, glDebit, glCredit] = await Promise.all([
      db.getActivityLogTotals(eodFinDate, eodStartedAt),
      db.getGLPostings(GL_DEBIT,  eodFinDate, eodStartedAt),
      db.getGLPostings(GL_CREDIT, eodFinDate, eodStartedAt),
    ]);
  }, 120_000);

  describe('Activity Log', () => {
    test('Total interest in ActivityLog is greater than 0', () => {
      expect(expectedTotalInterest).toBeGreaterThan(0);
    });
  });

  describe(`GL ${GL_DEBIT} — Debit side`, () => {
    test('One posting exists', () => {
      expect(glDebit.length).toBe(1);
    });

    test('EntryCode is D126', () => {
      expect(glDebit[0].EntryCode).toBe('D126');
    });

    test('Narration contains "Daily Accrued Interest on" and the financial date', () => {
      const dateStr = dayjs(eodFinDate).format('MM/DD/YYYY');
      expect(glDebit[0].Narration).toContain('Daily Accrued Interest on');
      expect(glDebit[0].Narration).toContain(dateStr);
    });

    test(`GL ${GL_DEBIT} amount matches total interest in ActivityLog`, () => {
      expect(glDebit[0].Amount).toBe(expectedTotalInterest);
    });
  });

  describe(`GL ${GL_CREDIT} — Credit side`, () => {
    test('One posting exists', () => {
      expect(glCredit.length).toBe(1);
    });

    test('EntryCode is C126', () => {
      expect(glCredit[0].EntryCode).toBe('C126');
    });

    test('Narration contains "Daily Accrued Interest on" and the financial date', () => {
      const dateStr = dayjs(eodFinDate).format('MM/DD/YYYY');
      expect(glCredit[0].Narration).toContain('Daily Accrued Interest on');
      expect(glCredit[0].Narration).toContain(dateStr);
    });

    test(`GL ${GL_CREDIT} amount matches total interest in ActivityLog`, () => {
      expect(glCredit[0].Amount).toBe(expectedTotalInterest);
    });
  });

  describe('Debit and Credit sides balance', () => {
    test('Debit amount = Credit amount', () => {
      expect(glDebit[0].Amount).toBe(glCredit[0].Amount);
    });
  });

  afterAll(async () => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-818 — Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  OD Account:             ${account?.odAccountNumber}`);
    console.log(`  Financial date:         ${eodFinDate}`);
    console.log(`  Activity log total:     ${expectedTotalInterest}`);
    console.log(`  GL 10231 amount:        ${glDebit?.[0]?.Amount}`);
    console.log(`  GL 10231 entry code:    ${glDebit?.[0]?.EntryCode}`);
    console.log(`  GL 40429 amount:        ${glCredit?.[0]?.Amount}`);
    console.log(`  GL 40429 entry code:    ${glCredit?.[0]?.EntryCode}`);
    console.log('══════════════════════════════════════════\n');
    await db.deleteDebtHistoryByDate(eodFinDate);
  });
});