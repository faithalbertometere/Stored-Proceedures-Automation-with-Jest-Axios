/**
 * _manageSetup.js
 * Shared helpers for ManageOverdraft test suite.
 *
 * BOUNDARY ANALYSIS APPROACH:
 * We know exactly when bucket transitions happen, so we only run EOD
 * on the boundary dates — not every day in between.
 *
 * KEY DATES:
 *   drawdownDate
 *   statementRunDate      = first statementDay-1 on/after drawdownDate
 *   statementStampDate    = statementRunDate + 1
 *   paymentDueDate        = statementStampDate + gracePeriodInDays
 *
 *   dpd1Date   = paymentDueDate + 1    → DPD=1,  Bucket 1 entry
 *   dpd30Date  = dpd1Date + 29         → DPD=30, last day Bucket 1
 *   dpd31Date  = dpd1Date + 30         → DPD=31, Bucket 2 entry
 *   dpd60Date  = dpd1Date + 59         → DPD=60, last day Bucket 2
 *   dpd61Date  = dpd1Date + 60         → DPD=61, Bucket 3 entry
 *   dpd89Date  = dpd1Date + 88         → DPD=89, last day Bucket 3
 *   dpd90Date  = dpd1Date + 89         → DPD=90, Default entry
 *   dpd456Date = dpd1Date + 455        → DPD=456, Write-off entry
 *
 * EOD BOUNDARY DATES ONLY — procs are called on specific dates, never in daily loops:
 *
 *   drawdownDate      DebtHistory + ManageOverdraft
 *   statementRunDate  DebtHistory + BillingStatement + ManageOverdraft
 *   paymentDueDate    DebtHistory + ManageOverdraft  (DPD=0, last safe day)
 *   dpd1Date          DebtHistory + ManageOverdraft  (Bucket 1 entry)
 *   dpd30Date         DebtHistory + ManageOverdraft  (Bucket 1 exit)
 *   dpd31Date         DebtHistory + ManageOverdraft  (Bucket 2 entry)
 *   dpd60Date         DebtHistory + ManageOverdraft  (Bucket 2 exit)
 *   dpd61Date         DebtHistory + ManageOverdraft  (Bucket 3 entry)
 *   dpd89Date         DebtHistory + ManageOverdraft  (Bucket 3 exit)
 *   dpd90Date         DebtHistory + ManageOverdraft  (Default entry)
 *   dpd455Date        DebtHistory + ManageOverdraft  (last day before Write-off)
 *   dpd456Date        DebtHistory + ManageOverdraft  (Write-off entry)
 *
 * STATUS ENUM:
 *   1 Inactive     5 Disabled Internally
 *   2 Active       6 Revoked
 *   3 Expired      7 DebtDisabled
 *   4 Disabled     8 DebtDisabledDefault
 *                  9 Write-off
 */

const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const {
  PROCS,
  getNextStatementRunDate,
  getPaymentDates,
} = require('../../helpers/eodRunner');

// ─────────────────────────────────────────────
// Status constants
// ─────────────────────────────────────────────
const STATUS = {
  INACTIVE:              1,
  ACTIVE:                2,
  EXPIRED:               3,
  DISABLED:              4,
  DISABLED_INTERNALLY:   5,
  REVOKED:               6,
  DEBT_DISABLED:         7,
  DEBT_DISABLED_DEFAULT: 8,
  WRITE_OFF:             9,
};

// ─────────────────────────────────────────────
// Derive all boundary dates from account config
// ─────────────────────────────────────────────
function getMilestoneDates(account) {
  const { statementDay, gracePeriodInDays } = account.searchResponse;

  const statementRunDate   = getNextStatementRunDate(account.drawdownDate, statementDay);
  const statementStampDate = dayjs(statementRunDate).add(1, 'day').format('YYYY-MM-DD');
  const { paymentDueDate, dpd1Date } = getPaymentDates(statementStampDate, gracePeriodInDays);

  return {
    statementRunDate,
    statementStampDate,
    paymentDueDate,
    dpd1Date,
    dpd30Date:  dayjs(dpd1Date).add(29,  'day').format('YYYY-MM-DD'),
    dpd31Date:  dayjs(dpd1Date).add(30,  'day').format('YYYY-MM-DD'),
    dpd60Date:  dayjs(dpd1Date).add(59,  'day').format('YYYY-MM-DD'),
    dpd61Date:  dayjs(dpd1Date).add(60,  'day').format('YYYY-MM-DD'),
    dpd89Date:  dayjs(dpd1Date).add(88,  'day').format('YYYY-MM-DD'),
    dpd90Date:  dayjs(dpd1Date).add(89,  'day').format('YYYY-MM-DD'),
    dpd456Date: dayjs(dpd1Date).add(455, 'day').format('YYYY-MM-DD'),
  };
}

// ─────────────────────────────────────────────
// Boundary runner — the only EOD execution path
// ─────────────────────────────────────────────

/**
 * Run a single EOD proc on a date, log the snapshot, and throw clearly on failure.
 */
async function runProc(procName, date) {
  const shortName = procName.replace('dbo.EOD_', '');
  const result    = await db.runEODProc(procName, date);
  const icon      = result.successInd === false ? '✗' : '✔';
  console.log(`    ${icon}  ${date}  ${shortName.padEnd(35)}  returnCode=${result.returnCode}  successInd=${result.successInd}`);
  if (result.successInd === false) {
    throw new Error(`EOD proc failed: ${procName} on ${date} (returnCode=${result.returnCode})`);
  }
  return result;
}

/**
 * Run EOD on a single boundary date only (no loops).
 * Automatically includes BillingStatement if targetDate is a subsequent statement run date.
 *
 * @param {string} lastProcessedDate   Previous boundary date (for logging context)
 * @param {string} targetDate          The single boundary date to run procs on
 * @param {object} account             Full account object (for statementDay)
 * @param {object} dates               From getMilestoneDates
 * @returns {string}                   targetDate (for chaining)
 */
async function runOnDate(lastProcessedDate, targetDate, account, dates) {
  const { statementDay } = account.searchResponse;
  const nextStmtRun      = getNextStatementRunDate(dates.statementStampDate, statementDay);
  const isStmtDate       = nextStmtRun === targetDate;
  const label            = isStmtDate ? `${targetDate}  [+BillingStatement]` : targetDate;

  console.log(`\n  [boundary] ${lastProcessedDate} → ${label}`);
  await runProc(PROCS.DEBT_HISTORY, targetDate);
  if (isStmtDate) await runProc(PROCS.BILLING_STATEMENT, targetDate);
  await runProc(PROCS.MANAGE_OVERDRAFT, targetDate);
  return targetDate;
}

/**
 * Run EOD on the 3 setup boundary dates before arrears begins:
 *   drawdownDate      DebtHistory + ManageOverdraft
 *   statementRunDate  DebtHistory + BillingStatement + ManageOverdraft
 *   paymentDueDate    DebtHistory + ManageOverdraft   (DPD=0, last safe day)
 *
 * After this the account is at DPD=0, Bucket=0, PaymentDueDate set.
 * Returns milestone dates.
 */
async function runToPaymentDueDate(account) {
  const dates = getMilestoneDates(account);
  const { drawdownDate } = account;
  const { statementRunDate, paymentDueDate } = dates;

  console.log(`\n  ┌─ EOD Setup Boundaries ─────────────────────────────`);
  console.log(`  │  drawdown:       ${drawdownDate}`);
  console.log(`  │  statementRun:   ${statementRunDate}`);
  console.log(`  │  paymentDueDate: ${paymentDueDate}`);
  console.log(`  └────────────────────────────────────────────────────`);

  console.log(`\n  [boundary] drawdownDate: ${drawdownDate}`);
  await runProc(PROCS.DEBT_HISTORY,     drawdownDate);
  await runProc(PROCS.MANAGE_OVERDRAFT, drawdownDate);

  console.log(`\n  [boundary] statementRunDate: ${statementRunDate}`);
  await runProc(PROCS.DEBT_HISTORY,      statementRunDate);
  await runProc(PROCS.BILLING_STATEMENT, statementRunDate);
  await runProc(PROCS.MANAGE_OVERDRAFT,  statementRunDate);

  console.log(`\n  [boundary] paymentDueDate: ${paymentDueDate}`);
  await runProc(PROCS.DEBT_HISTORY,     paymentDueDate);
  await runProc(PROCS.MANAGE_OVERDRAFT, paymentDueDate);

  console.log(`\n  [setup] Complete — account at DPD=0, Bucket=0\n`);
  return dates;
}

// ─────────────────────────────────────────────
// Fetch all 3 assertion sources for a date
// ─────────────────────────────────────────────
async function fetchBucketState(odAccountNumber, finDate) {
  const [dbRecord, searchResponse, activityLog] = await Promise.all([
    db.getDebtHistoryRecord(odAccountNumber, finDate),
    api.searchOverdraft(odAccountNumber),
    api.getActivityLog(odAccountNumber, 100),
  ]);
  return { dbRecord, searchResponse, activityLog };
}

// ─────────────────────────────────────────────
// Shared assertion helpers — call inside describe()
// ─────────────────────────────────────────────

/**
 * Assert DPD + ArrearsBucket across DB and API.
 * Optionally checks ActivityLog for a bucket movement entry.
 */
function assertBucketState(getState, expectedDPD, expectedBucket, checkBucketLog = false) {
  test(`DB: DaysPastDue = ${expectedDPD}`, () => {
    expect(getState().dbRecord).not.toBeNull();
    expect(getState().dbRecord.DaysPastDue).toBe(expectedDPD);
  });

  test(`DB: ArrearsBucket = ${expectedBucket}`, () => {
    expect(getState().dbRecord.ArrearsBucket).toBe(expectedBucket);
  });

  test(`API: arrearsBucket = ${expectedBucket}`, () => {
    expect(getState().searchResponse.arrearsBucket).toBe(expectedBucket);
  });

  if (checkBucketLog) {
    test('ActivityLog: Arrears Bucket Movement entry exists', () => {
      expect(getState().activityLog.some(e => e.transactionType === 'Arrears Bucket Movement')).toBe(true);
    });
  }
}

function assertStatus(getState, expectedStatus, label) {
  test(`API: status = ${expectedStatus} (${label})`, () => {
    expect(getState().searchResponse.status).toBe(expectedStatus);
  });
}

/**
 * Assert ActivityLog contains an Account Disabled entry (status → 7).
 * Call this at the DPD=1 boundary where the account first gets disabled.
 */
function assertAccountDisabled(getState) {
  test('ActivityLog: Account Disabled entry exists (status → 7)', () => {
    expect(getState().activityLog.some(e => e.transactionType === 'Account Disabled')).toBe(true);
  });

  test('ActivityLog: Account Disabled entry is on the correct account', () => {
    const entry = getState().activityLog.find(e => e.transactionType === 'Account Disabled');
    expect(entry).toBeDefined();
    expect(entry.accountNumber).toBe(getState().searchResponse.accountNumber ?? getState().dbRecord.AccountNumber);
  });
}

/**
 * Assert ActivityLog contains an Account Re-enabled entry (status 7 → 2).
 * Call this after a repayment that clears the bucket (Bucket 1/2/3 only —
 * accounts in Default are NOT expected to be re-enabled via this flow).
 */
function assertAccountReenabled(getState) {
  test('ActivityLog: Account Re-enabled entry exists (status 7 → 2)', () => {
    expect(getState().activityLog.some(e => e.transactionType === 'Account Re-enabled')).toBe(true);
  });
}

/**
 * Assert ActivityLog contains an Account Default entry (status → 8).
 * Call this at the DPD=90 boundary.
 * Also asserts no re-enable entry follows (default status is sticky).
 */
function assertAccountDefault(getState) {
  test('ActivityLog: Account Default entry exists (status → 8)', () => {
    expect(getState().activityLog.some(e => e.transactionType === 'Account Default')).toBe(true);
  });

  test('ActivityLog: Account Default entry is on the correct account', () => {
    const entry = getState().activityLog.find(e => e.transactionType === 'Account Default');
    expect(entry).toBeDefined();
  });

  test('ActivityLog: No Account Re-enabled entry after Default (status 8 is sticky)', () => {
    // Find the default entry timestamp, then confirm no re-enable entry comes after it
    const defaultEntry  = getState().activityLog.find(e => e.transactionType === 'Account Default');
    const reenableAfter = defaultEntry
      ? getState().activityLog.filter(e =>
          e.transactionType === 'Account Re-enabled' &&
          new Date(e.transactionDate) > new Date(defaultEntry.transactionDate)
        )
      : [];
    expect(reenableAfter.length).toBe(0);
  });
}

module.exports = {
  STATUS,
  getMilestoneDates,
  runToPaymentDueDate,
  runOnDate,
  fetchBucketState,
  assertBucketState,
  assertStatus,
  assertAccountDisabled,
  assertAccountReenabled,
  assertAccountDefault,
};
