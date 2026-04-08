/**
 * dbHelper.js
 * Manages the MSSQL connection pool and exposes
 * reusable query / proc execution methods.
 */

const sql    = require('mssql');
const config = require('../config');

let pool;

async function connect() {
  if (!pool) {
    pool = await sql.connect(config.db);
  }
  return pool;
}

async function disconnect() {
  await sql.close();
  pool = null;
}

/**
 * Run an EOD stored procedure.
 * @param {string} procName   e.g. 'dbo.EOD_OverdraftDebtHistory'
 * @param {string} finDate    ISO date string e.g. '2026-04-09'
 * @returns {{ returnCode: number, successInd: boolean }}
 */

async function runEODProc(procName, finDate) {
  const p   = await connect();
  const req = p.request();
  req.input('FinDate', sql.DateTime, new Date(finDate));

  // EOD_SmartOverdraftInterestAccrual requires an extra RefNumber param
  if (procName === process.env.INTEREST_ACCRUAL) {
    req.input('RefNumber', sql.NVarChar(20), `EOD-${finDate}`);
  }

  // Reconciliation proc does not use @successInd
  if (procName === process.env.RECONCILIATION) {
    const result = await req.execute(procName);
    return {
      returnCode: result.returnValue,
      successInd: true,
    };
  }

  req.output('successInd', sql.Bit);
  const result = await req.execute(procName);
  return {
    returnCode: result.returnValue,
    successInd: result.output.successInd,
  };
}


async function getDebtHistoryRecord(accountNumber, financialDate) {
  const p      = await connect();
  const result = await p.request()
    .input('AccountNumber', sql.VarChar, accountNumber)
    .input('FinancialDate', sql.Date,    new Date(financialDate))
    .query(`
      SELECT TOP 1
        CAST(FinancialDate AS DATE)   AS FinancialDate,
        AccountNumber,
        UnpaidOverdraftPrincipal,
        UnpaidOverdraftInterest,
        UnpaidOverdraftPenalty,
        UnpaidDefaultingInterest,
        DrawDownDate,
        CAST(DaysAtRisk    AS INT) AS DaysAtRisk,
        CAST(DaysPastDue   AS INT) AS DaysPastDue,
        CAST(ArrearsBucket AS INT) AS ArrearsBucket,
        CAST(MinimumPayment AS DECIMAL(18,2)) AS MinimumPayment,
        CAST(AmountOverDue AS DECIMAL(18,2)) AS AmountOverDue,
        CAST(PaymentDueDate  AS DATE)   AS PaymentDueDate,
        CAST(NextStatementDate AS DATE) AS NextStatementDate,
        CAST(PreviousStatementDate AS DATE) AS PreviousStatementDate,
        CAST(BillingCycleLength AS INT) AS BillingCycleLength
      FROM ${config.tables.BalanceHistory}
      WHERE AccountNumber              = @AccountNumber
        AND CAST(FinancialDate AS DATE) = @FinancialDate
      ORDER BY FinancialDate DESC
    `);
  return result.recordset[0] ?? null;
}

async function getDebtBreakdownRecords(accountNumber, realDate) {
  const p      = await connect();
  const result = await p.request()
    .input('AccountNumber', sql.VarChar, accountNumber)
    .input('RealDate',      sql.Date,    new Date(realDate))
    .query(`
      SELECT
        ID,
        AccountNumber,
        UnpaidOverdraftPrincipal,
        UnpaidOverdraftInterest,
        CAST(RealDate AS DATE) AS RealDate,
        ReferenceNumber,
        RepaymentStatus
        FROM ${config.tables.OverdraftDebtBreakdowns}
        WHERE AccountNumber          = @AccountNumber
        AND CAST(RealDate AS DATE) = @RealDate
        ORDER BY CreationDate DESC
    `);
  return result.recordset;
}


async function getDebtBreakdownRange(accountNumber, fromDate, toDate) {
  const p      = await connect();
  const result = await p.request()
    .input('AccountNumber', sql.VarChar, accountNumber)
    .input('FromDate',      sql.Date,    new Date(fromDate))
    .input('ToDate',        sql.Date,    new Date(toDate))
    .query(`
      SELECT
        ID,
        AccountNumber,
        UnpaidOverdraftPrincipal,
        UnpaidOverdraftInterest,
        CAST(RealDate AS DATE) AS RealDate,
        ReferenceNumber,
        RepaymentStatus
        FROM ${config.tables.OverdraftDebtBreakdowns}
        WHERE AccountNumber          = @AccountNumber
        AND CAST(RealDate AS DATE) BETWEEN @FromDate AND @ToDate
        ORDER BY RealDate ASC
    `);
  return result.recordset;
}

/**
 * Fetch the OverdraftStatements record for a given account + financial date.
 * FinancialDate on the statement = statementDay (proc runs on statementDay-1).
 * @param {string} accountNumber
 * @param {string} financialDate   ISO date string — the stamp date (statementDay)
 * @returns {object|null}
 */
async function getOverdraftStatement(accountNumber, financialDate) {
  const p      = await connect();
  const result = await p.request()
    .input('AccountNumber', sql.VarChar, accountNumber)
    .input('FinancialDate', sql.Date,    new Date(financialDate))
    .query(`
      SELECT TOP 1
        ID,
        AccountNumber,
        LinkedAccountNumber,
        CAST(BillingCycleStartDate AS DATE) AS BillingCycleStartDate,
        CAST(BillingCycleEndDate   AS DATE) AS BillingCycleEndDate,
        InterestCharged,
        OverdraftUtilized,
        PrincipalMinimumPayment,
        TotalMinimumPayment,
        MinimumPaymentBalance,
        CAST(PaymentDueDate  AS DATE)   AS PaymentDueDate,
        CAST(FinancialDate   AS DATE)   AS FinancialDate,
        OutstandingPrincipal,
        PreviousOutstandingPrincipal,
        UnpaidInterest,
        CreationDate
      FROM ${config.tables.Statement}
      WHERE AccountNumber              = @AccountNumber
        AND CAST(FinancialDate AS DATE) = @FinancialDate
      ORDER BY FinancialDate DESC
    `);
  return result.recordset[0] ?? null;
}

/**
 * Fetch all OverdraftStatements for an account across a date range.
 * Useful for TC-945 carryover assertions.
 * @param {string} accountNumber
 * @param {string} fromDate   ISO date string
 * @param {string} toDate     ISO date string
 * @returns {Array}
 */
async function getOverdraftStatementRange(accountNumber, fromDate, toDate) {
  const p      = await connect();
  const result = await p.request()
    .input('AccountNumber', sql.VarChar, accountNumber)
    .input('FromDate',      sql.Date,    new Date(fromDate))
    .input('ToDate',        sql.Date,    new Date(toDate))
    .query(`
      SELECT
        ID,
        AccountNumber,
        LinkedAccountNumber,
        CAST(BillingCycleStartDate AS DATE) AS BillingCycleStartDate,
        CAST(BillingCycleEndDate   AS DATE) AS BillingCycleEndDate,
        InterestCharged,
        OverdraftUtilized,
        PrincipalMinimumPayment,
        TotalMinimumPayment,
        MinimumPaymentBalance,
        CAST(PaymentDueDate  AS DATE)   AS PaymentDueDate,
        CAST(FinancialDate   AS DATE)   AS FinancialDate,
        OutstandingPrincipal,
        PreviousOutstandingPrincipal,
        UnpaidInterest
      FROM ${config.tables.Statement}
      WHERE AccountNumber              = @AccountNumber
        AND CAST(FinancialDate AS DATE) BETWEEN @FromDate AND @ToDate
      ORDER BY FinancialDate ASC
    `);
  return result.recordset;
}

/**
 * Fetch PostingHistory GL entries for interest accrual validation (TC-818).
 * Queries GL accounts 10231 (debit) and 40429 (credit) for a given financial
 * date, filtered by a creationDate window to isolate this test run's postings.
 *
 * @param {string} glAccountNumber   '10231' or '40429'
 * @param {string} financialDate     ISO date string e.g. '2026-04-09'
 * @param {Date}   createdAfter      timestamp captured just before EOD ran
 * @returns {Array}
 */
async function getGLPostings(glAccountNumber, financialDate, createdAfter) {
  const p      = await connect();
  const result = await p.request()
    .input('GLAccountNumber', sql.VarChar,  glAccountNumber)
    .input('FinancialDate',   sql.Date,     new Date(financialDate))
    .input('CreatedAfter',    sql.DateTime, createdAfter)
    .query(`
      SELECT
        ID,
        AccountNumber,
        FinancialDate,
        RealDate,
        Amount,
        EntryCode,
        Narration,
        CreationDate,
        ReferenceNumber
      FROM ${config.tables.Postings_History}
      WHERE AccountNumber              = @GLAccountNumber
        AND CAST(FinancialDate AS DATE) = @FinancialDate
        AND CreationDate               >= @CreatedAfter
      ORDER BY CreationDate ASC
    `);
  return result.recordset;
}

async function getActivityLogTotals(financialDate, createdAfter) {
  const p      = await connect();
  const result = await p.request()
    .input('FinancialDate', sql.Date,     new Date(financialDate))
    .input('CreatedAfter',  sql.DateTime, createdAfter)
    .query(`
      SELECT SUM(Amount) AS TotalInterest
      FROM ${config.tables.SmartODActivity}
      WHERE TransactionType  = 'Interest Accrual'
        AND CreationDate                 >= @CreatedAfter
    `);
  return result.recordset[0]?.TotalInterest ?? 0;
}

async function deleteDebtHistoryByDate(finDate) {
  const p = await connect();
  await p.request()
    .input('FinancialDate', sql.Date, new Date(finDate))
    .query(`
      DELETE FROM ${config.tables.BalanceHistory}
      WHERE CAST(FinancialDate AS DATE) >= @FinancialDate
    `);
  console.log(`  [cleanup] Deleted OverdraftDebtHistory records for ${finDate}`);
}

async function deleteStatementByDate(finDate) {
  const p = await connect();
  await p.request()
    .input('BillingCycleEndDate', sql.Date, new Date(finDate))
    .query(`
      DELETE FROM ${config.tables.Statement}
      WHERE CAST(BillingCycleEndDate AS DATE) >= @BillingCycleEndDate
    `);
  console.log(`  [cleanup] Deleted OverdraftStatement records for ${finDate}`);
}

module.exports = {
  connect,
  disconnect,
  runEODProc,
  getDebtHistoryRecord,
  getDebtBreakdownRecords,
  getDebtBreakdownRange,
  getOverdraftStatement,
  getOverdraftStatementRange,
  getGLPostings,
  getActivityLogTotals,
  deleteDebtHistoryByDate,
  deleteStatementByDate
};
