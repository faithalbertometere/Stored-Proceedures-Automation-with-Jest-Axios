/**
 * apiHelper.js
 * Thin wrappers around Axios for all Nerve / Posting API calls.
 */

const axios  = require('axios');
const config = require('../config');

/**
 * Generic POST — throws on non-2xx or API-level failure.
 */
async function post(url, data, headers) {
  const response = await axios.post(url, data, { headers });
  return response.data;
}

// ─────────────────────────────────────────────
// Customer & Account
// ─────────────────────────────────────────────

async function createCustomer(payload) {
  return post(config.urls.createCustomer, payload, config.headers.nerveCreate);
}

async function createCustomerAccount(payload) {
  return post(config.urls.createAccount, payload, config.headers.nerveCreate);
}

// ─────────────────────────────────────────────
// Smart OD lifecycle
// ─────────────────────────────────────────────

async function createSmartOD(payload) {
  return post(config.urls.createSmartOD, payload, config.headers.nerve);
}

async function optIn(accountNumber) {
  return post(config.urls.optIn, { accountNumber }, config.headers.nerve);
}

async function consent(accountNumber, amount) {
  return post(config.urls.consent, { accountNumber, amount }, config.headers.nerve);
}

async function drawdown({ linkedAccountNumber, amount, instrumentNumber }) {
  const now = new Date().toISOString();
  return post(
    config.urls.drawdown,
    {
      PostingEntryViewModel: [
        {
          amount,
          PostingRecordType: 1,
          accountNumber:     linkedAccountNumber,
          Narration:         'Smart OD Auto Test',
          InstrumentNumber:  instrumentNumber,
          EntryCode:         'D338-08',
          Depositor:         'Auto Test',
          BranchID:          config.smartOD.branchId,
        },
        {
          amount,
          PostingRecordType: 2,
          accountNumber:     config.smartOD.glAccount,
          Narration:         'Smart OD Auto Test',
          InstrumentNumber:  instrumentNumber,
          EntryCode:         'C338-08',
          Depositor:         'Auto Test',
          BranchID:          config.smartOD.branchId,
        },
      ],
      PostingBaseViewModel: {
        HasCOTWaiver:  false,
        ForceDebit:    false,
        RealDate:      now,
        FinancialDate: now,
        IPAddress:     '172.31.23.118',
        PostingType:   1,
      },
    },
    config.headers.posting
  );
}

// ─────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────

async function searchOverdraft(accountNumber) {
  const data = await post(
    config.urls.searchOverdraft,
    { searchParams: { accountNumber }, pageSize: 10, pageNumber: 1 },
    config.headers.nerve
  );
  if (!data.isSuccessful) throw new Error(`SearchOverdraft failed: ${data.message}`);
  return data.data[0] ?? null;
}

// ─────────────────────────────────────────────
// Repayment
// Same posting endpoint as drawdown but legs are swapped:
//   linkedAccountNumber → Credit leg  (money coming IN to savings)
//   glAccount           → Debit leg   (reducing OD GL balance)
// ─────────────────────────────────────────────

/**
 * Make a repayment against an OD account.
 * @param {object} params
 * @param {string} params.linkedAccountNumber  Customer savings account
 * @param {number} params.amount               Repayment amount
 * @param {string} params.instrumentNumber     Unique reference
 */
async function makeRepayment(linkedAccountNumber, amount, instrumentNumber) {
  const now = new Date().toISOString();
  return post(
    config.urls.drawdown,   // same endpoint
    {
      PostingEntryViewModel: [
        {
          amount,
          PostingRecordType: 2,              // Credit — money back into savings
          accountNumber:     linkedAccountNumber,
          Narration:         'Smart OD Repayment Auto Test',
          InstrumentNumber:  instrumentNumber,
          EntryCode:         'C338-08',
          Depositor:         'Auto Test',
          BranchID:          config.smartOD.branchId,
        },
        {
          amount,
          PostingRecordType: 1,              // Debit — reducing OD GL
          accountNumber:     config.smartOD.glAccount,
          Narration:         'Smart OD Repayment Auto Test',
          InstrumentNumber:  instrumentNumber,
          EntryCode:         'D338-08',
          Depositor:         'Auto Test',
          BranchID:          config.smartOD.branchId,
        },
      ],
      PostingBaseViewModel: {
        HasCOTWaiver:  false,
        ForceDebit:    false,
        RealDate:      now,
        FinancialDate: now,
        IPAddress:     '172.31.23.118',
        PostingType:   1,
      },
    },
    config.headers.posting
  );
}

// ─────────────────────────────────────────────
// Repayment polling
// Worker runs on 5-min ticks (e.g. 12:00, 12:05, 12:10).
// Repayment posts instantly but balance only drops once the worker runs.
// Worst case: repayment at 12:01 → worker at 12:05 = ~4 min wait.
// Poll every 30s, timeout after 6 minutes to be safe.
// ─────────────────────────────────────────────

/**
 * Wait after repayment until overdrawnAmount drops to expectedBalance.
 * Polls SearchOverdraft every 30s, times out after maxWaitMs (default 6 min).
 *
 * @param {object} params
 * @param {string} params.accountNumber
 * @param {number} params.expectedBalance   The overdrawnAmount you expect after worker runs
 * @param {number} [params.pollIntervalMs]  Default 30000 (30s)
 * @param {number} [params.maxWaitMs]       Default 360000 (6 min)
 * @returns {Promise<object>}               Final SearchOverdraft response
 */

async function waitForRepaymentProcessed({
  accountNumber,
  expectedBalance,
  expectedInterest,
  pollIntervalMs = 30_000,
  maxWaitMs      = 360_000,
  
}) {
  const start = Date.now();
  let   last;

  const balanceLabel  = expectedBalance  !== undefined ? `balance → ${expectedBalance}`  : '';
  const interestLabel = expectedInterest !== undefined ? `interest → ${expectedInterest}` : '';
  console.log(`  [repayment] Waiting for ${[balanceLabel, interestLabel].filter(Boolean).join(', ')}...`);

  while (Date.now() - start < maxWaitMs) {
    last = await searchOverdraft(accountNumber);

    const balanceMatch  = expectedBalance  === undefined || Math.abs(last.overdrawnAmount   - expectedBalance)  < 1;
    const interestMatch = expectedInterest === undefined || Math.abs(last.accruedODInterest - expectedInterest) < 1;

    if (balanceMatch && interestMatch) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`  [repayment] ✔ Confirmed — balance: ${last.overdrawnAmount}  interest: ${last.accruedODInterest} (${elapsed}s)`);
      return last;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`  [repayment] ${elapsed}s — balance: ${last.overdrawnAmount}, interest: ${last.accruedODInterest}...`);
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  throw new Error(
    `waitForRepaymentProcessed timed out after ${maxWaitMs / 1000}s. ` +
    `Last overdrawnAmount: ${last?.overdrawnAmount}, expected: ${expectedBalance}. ` +
    `Last accruedODInterest: ${last?.accruedODInterest}, expected: ${expectedInterest}`
  );
}

// ─────────────────────────────────────────────
// Activity Log
// ─────────────────────────────────────────────

/**
 * Fetch activity log entries for an account.
 * @param {string} accountNumber
 * @param {number} [pageSize=50]   Increase if account has many entries
 * @returns {Array}                Raw data array from the response
 */
async function getActivityLog(accountNumber, pageSize = 50) {
  const data = await post(
    config.urls.activityLog,
    { searchParams: { accountNumber }, pageSize, pageNumber: 1 },
    config.headers.nerve
  );
  if (!data.isSuccessful) throw new Error(`ActivityLog failed: ${data.message}`);
  return data.data ?? [];
}

module.exports = {
  createCustomer,
  createCustomerAccount,
  createSmartOD,
  optIn,
  consent,
  drawdown,
  makeRepayment,
  waitForRepaymentProcessed,
  searchOverdraft,
  getActivityLog,
};
