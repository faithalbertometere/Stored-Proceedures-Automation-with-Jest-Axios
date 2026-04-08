/**
 * eodRunner.js
 *
 * Runs EOD stored procedures day-by-day from a start date up to a target date.
 * Each proc depends on the previous one, so they always run in order:
 *   1. EOD_OverdraftDebtHistory     — always required
 *   2. EOD_OverdraftBillingStatement — required for MinimumPayment, PaymentDueDate, NextStatementDate
 *   3. EOD_ManageSmartOverdraft      — required for AmountOverDue, account status updates
 *
 * Usage:
 *
 *   const { runEODUntil, PROCS } = require('../helpers/eodRunner');
 *
 *   // Run only DebtHistory up to a date (e.g. for DebtHistory tests)
 *   await runEODUntil({
 *     fromDate:  account.drawdownDate,
 *     toDate:    '2026-04-09',           // payment due date
 *     procs:     [PROCS.DEBT_HISTORY],
 *   });
 *
 *   // Run all 3 procs (e.g. for BillingStatement or ManageOverdraft tests)
 *   await runEODUntil({
 *     fromDate:  account.drawdownDate,
 *     toDate:    '2026-04-09',
 *     procs:     [PROCS.DEBT_HISTORY, PROCS.BILLING_STATEMENT, PROCS.MANAGE_OVERDRAFT],
 *   });
 *
 *   // Convenience shorthand — run all 3
 *   await runEODUntil({ fromDate, toDate, procs: PROCS.ALL });
 *
 * Returns:
 *   Array of daily snapshots:
 *   [
 *     { date: '2026-03-26', results: { debtHistory: { successInd, returnCode }, ... } },
 *     ...
 *   ]
 */

const dayjs = require('dayjs');
const db    = require('./dbHelper');
const config = require('../config');

// ─────────────────────────────────────────────
// Proc name constants
// ─────────────────────────────────────────────
const PROCS = {
  RECONCILIATION:    config.procs.RECONCILIATION,
  DEBT_HISTORY:      config.procs.DEBT_HISTORY,
  INTEREST_ACCRUAL:  config.procs.INTEREST_ACCRUAL,
  BILLING_STATEMENT: config.procs.BILLING_STATEMENT,
  MANAGE_OVERDRAFT:  config.procs.MANAGE_OVERDRAFT,
  // Shorthand to run all 3 in the correct order
  get ALL() {
    return [this.RECONCILIATION, this.DEBT_HISTORY, this.BILLING_STATEMENT, this.MANAGE_OVERDRAFT];
  },
};


// Map proc name → a short key used in the snapshot result object
const PROC_KEY = {
  [PROCS.DEBT_HISTORY]:      'debtHistory',
  [PROCS.BILLING_STATEMENT]: 'billingStatement',
  [PROCS.MANAGE_OVERDRAFT]:  'manageOverdraft',
  [PROCS.INTEREST_ACCRUAL]:  'interestAccrual',
  [PROCS.RECONCILIATION]:    'reconciliation',
};

// ─────────────────────────────────────────────
// Core runner
// ─────────────────────────────────────────────

/**
 * Runs one or more EOD procs for every date from fromDate to toDate (inclusive).
 * Procs run in the order supplied — always pass them in dependency order.
 *
 * @param {object}   options
 * @param {string}   options.fromDate   Start date YYYY-MM-DD (inclusive)
 * @param {string}   options.toDate     End date   YYYY-MM-DD (inclusive)
 * @param {string[]} options.procs      Ordered list of proc names to run each day
 * @param {boolean}  [options.stopOnFailure=true]  Throw if any proc returns successInd=false
 *
 * @returns {Promise<Array<{ date: string, results: object }>>}
 */
async function runEODUntil({ fromDate, toDate, procs, stopOnFailure = true }) {
  if (!fromDate) throw new Error('runEODUntil: fromDate is required');
  if (!toDate)   throw new Error('runEODUntil: toDate is required');
  if (!procs || procs.length === 0) throw new Error('runEODUntil: at least one proc is required');

  const snapshots = [];
  let   current   = dayjs(fromDate);
  const end       = dayjs(toDate);

  if (current.isAfter(end)) {
    throw new Error(`runEODUntil: fromDate (${fromDate}) is after toDate (${toDate})`);
  }

  const totalDays = end.diff(current, 'day') + 1;

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const date    = current.format('YYYY-MM-DD');
    const results = {};

    for (const proc of procs) {
      const key    = PROC_KEY[proc] ?? proc;
      const result = await db.runEODProc(proc, date);
      results[key] = result;

      if (stopOnFailure && result.successInd === false) {
        throw new Error(
          `runEODUntil: ${proc} failed on ${date} ` +
          `(successInd=false, returnCode=${result.returnCode})`
        );
      }
    }

    console.log(`  [eod] ${date} ✔  ${Object.keys(results).join(', ')}`);
    snapshots.push({ date, results });
    current = current.add(1, 'day');
  }

  console.log(`  [eod] Done — ${snapshots.length} day(s) processed\n`);
  return snapshots;
}

/**
 * Convenience: advance from the last run date to a new target date.
 * Useful when a test already ran up to one checkpoint and needs to continue.
 *
 * @param {object}   options
 * @param {string}   options.lastDate   The date already processed (exclusive start)
 * @param {string}   options.toDate     New target date (inclusive)
 * @param {string[]} options.procs
 * @param {boolean}  [options.stopOnFailure=true]
 */
async function continueEODUntil({ lastDate, toDate, procs, stopOnFailure = true }) {
  const nextDate = dayjs(lastDate).add(1, 'day').format('YYYY-MM-DD');
  return runEODUntil({ fromDate: nextDate, toDate, procs, stopOnFailure });
}

/**
 * Derive the next statement date from the account's statementDay config.
 * Returns the first occurrence of that day-of-month on or after fromDate.
 *
 * @param {string} fromDate     YYYY-MM-DD — start looking from this date
 * @param {number} statementDay Day of month the statement generates (e.g. 25)
 * @param {number} [monthsAhead=1] How many statement cycles ahead to look
 * @returns {string} YYYY-MM-DD — the EOD run date that generates the statement
 *                               (one day before the stamped statement date)
 */
function getNextStatementRunDate(fromDate, statementDay, monthsAhead = 1) {
  // Statement is stamped on statementDay, but proc runs on statementDay - 1
  let nextstatementdate = dayjs(fromDate).date(statementDay);
  if (nextstatementdate.isBefore(dayjs(fromDate), 'day') || nextstatementdate.isSame(dayjs(fromDate), 'day')) {
    nextstatementdate = nextstatementdate.add(monthsAhead, 'month');
  }
  // Return the day BEFORE the statement stamp date (the actual EOD run date)
  return nextstatementdate.subtract(1, 'day').format('YYYY-MM-DD');
}

/**
 * Derive the payment due date: statementDate + gracePeriodInDays
 * DPD=1 starts the day AFTER paymentDueDate.
 *
 * @param {string} statementDate     YYYY-MM-DD — the stamped statement date
 * @param {number} gracePeriodInDays From the SearchOverdraft API response
 * @returns {{ paymentDueDate: string, dpd1Date: string }}
 */
function getPaymentDates(statementDate, gracePeriodInDays) {
  const paymentDueDate = dayjs(statementDate).add(gracePeriodInDays, 'day').format('YYYY-MM-DD');
  const lastSafeDate   = dayjs(paymentDueDate).subtract(1, 'day').format('YYYY-MM-DD');
  return { paymentDueDate, lastSafeDate };
}

/**
 * Derive the DPD=31 (Bucket 2 entry) date from DPD=1 date.
 *
 * @param {string} dpd1Date   YYYY-MM-DD
 * @returns {string}          YYYY-MM-DD
 */
function getDPD31Date(dpd1Date) {
  return dayjs(dpd1Date).add(30, 'day').format('YYYY-MM-DD');
}



module.exports = {
  PROCS,
  runEODUntil,
  continueEODUntil,
  getNextStatementRunDate,
  getPaymentDates,
  getDPD31Date,
};
