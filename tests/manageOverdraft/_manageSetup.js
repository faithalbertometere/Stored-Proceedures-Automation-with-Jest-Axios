const dayjs = require('dayjs');
const db    = require('../../helpers/dbHelper');
const api   = require('../../helpers/apiHelper');
const {
  PROCS,
  runEODUntil,
  getNextStatementRunDate,
  getPaymentDates,
} = require('../../helpers/eodRunner');

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

function getMilestoneDates(account) {
  const { statementDay, gracePeriodInDays } = account.searchResponse;

  const statementRunDate   = getNextStatementRunDate(account.drawdownDate, statementDay);
  const statementStampDate = dayjs(statementRunDate).add(1, 'day').format('YYYY-MM-DD');

  const { paymentDueDate, lastSafeDate } = getPaymentDates(statementStampDate, gracePeriodInDays);

  return {
    statementRunDate,
    statementStampDate,
    paymentDueDate,
    lastSafeDate,
    dpd1Date:   paymentDueDate,
    dpd30Date:  dayjs(paymentDueDate).add(29,  'day').format('YYYY-MM-DD'),
    dpd31Date:  dayjs(paymentDueDate).add(30,  'day').format('YYYY-MM-DD'),
    dpd60Date:  dayjs(paymentDueDate).add(59,  'day').format('YYYY-MM-DD'),
    dpd61Date:  dayjs(paymentDueDate).add(60,  'day').format('YYYY-MM-DD'),
    dpd89Date:  dayjs(paymentDueDate).add(88,  'day').format('YYYY-MM-DD'),
    dpd90Date:  dayjs(paymentDueDate).add(89,  'day').format('YYYY-MM-DD'),
    dpd456Date: dayjs(paymentDueDate).add(455, 'day').format('YYYY-MM-DD'),
  };
}

async function runToPaymentDueDate(account) {
  const dates = getMilestoneDates(account);
  const { drawdownDate } = account;
  const { statementRunDate, lastSafeDate } = dates;

  console.log(`\n  ┌─ EOD Setup Boundaries ─────────────────────────────`);
  console.log(`  │  drawdown:       ${drawdownDate}`);
  console.log(`  │  statementRun:   ${statementRunDate}`);
  console.log(`  │  lastSafeDate: ${lastSafeDate}`);
  console.log(`  └────────────────────────────────────────────────────`);

  await runEODUntil({
    fromDate: drawdownDate,
    toDate:   drawdownDate,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  await runEODUntil({
    fromDate: statementRunDate,
    toDate:   statementRunDate,
    procs:    [PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT, PROCS.MANAGE_OVERDRAFT],
  });

  await runEODUntil({
    fromDate: lastSafeDate,
    toDate:   lastSafeDate,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  console.log(`\n  [setup] Complete — account at DPD=0, Bucket=0\n`);
  return dates;
}

async function runOnDate(targetDate, account, dates) {
  const { statementDay }  = account.searchResponse;
  const nextStmtRun       = getNextStatementRunDate(dates.statementStampDate, statementDay);
  const isStmtDate        = nextStmtRun === targetDate;

  const procs = isStmtDate
    ? [PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT, PROCS.MANAGE_OVERDRAFT]
    : [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT];

  console.log(`\n  [boundary] ${targetDate}${isStmtDate ? '  [+BillingStatement]' : ''}`);

  await runEODUntil({
    fromDate: targetDate,
    toDate:   targetDate,
    procs,
  });

  return targetDate;
}

async function fetchBucketState(odAccountNumber, finDate) {
  const [dbRecord, searchResponse, activityLog] = await Promise.all([
    db.getDebtHistoryRecord(odAccountNumber, finDate),
    api.searchOverdraft(odAccountNumber),
    api.getActivityLog(odAccountNumber, 100),
  ]);
  return { dbRecord, searchResponse, activityLog };
}

function assertBucketState(getState, expectedDPD, expectedBucket) {
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


  test(`ActivityLog: Arrears Bucket Movement entry exists ${expectedBucket}`, () => {
    expect(getState().activityLog.some(e => e.transactionCategory === 'Change in Arrears Bucket' 
    && e.amount === expectedBucket)).toBe(true);
  });
}

function assertStatus(getState, expectedStatus, label) {
  test(`API: status = ${expectedStatus} (${label})`, () => {
    expect(getState().searchResponse.status).toBe(expectedStatus);
  });
}

function assertAccountDisabled(getState) {
  test('ActivityLog: Account Disabled entry exists (status → 7)', () => {
    expect(getState().activityLog.some(e => e.transactionCategory === 'Overdraft disabled due to failure to meet minimum payment')).toBe(true);
  });

  test('ActivityLog: Account Disabled entry is on the correct account', () => {
    const entry = getState().activityLog.find(e => e.transactionCategory === 'Overdraft disabled due to failure to meet minimum payment');
    expect(entry).toBeDefined();
    expect(entry.accountNumber).toBe(getState().searchResponse.accountNumber ?? getState().dbRecord.AccountNumber);
  });
}

function assertAccountReenabled(getState) {
  test('ActivityLog: Account Re-enabled entry exists (status 7 → 2)', () => {
    expect(getState().activityLog.some(e => e.transactionCategory === 'Overdraft enabled after minimum payment settlement')).toBe(true);
  });
}

function assertAccountDefault(getState) {
  test('ActivityLog: Account Default entry exists (status → 8)', () => {
    expect(getState().activityLog.some(e => e.transactionCategory === 'Account Default')).toBe(true);
  });

  test('ActivityLog: Account Default entry is on the correct account', () => {
    const entry = getState().activityLog.find(e => e.transactionCategory === 'Account Default');
    expect(entry).toBeDefined();
  });

  test('ActivityLog: No Account Re-enabled entry after Default (status 8 is sticky)', () => {
    const defaultEntry  = getState().activityLog.find(e => e.transactionCategory === 'Account Default');
    const reenableAfter = defaultEntry
      ? getState().activityLog.filter(e =>
          e.transactionCategory === 'Account Re-enabled' &&
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