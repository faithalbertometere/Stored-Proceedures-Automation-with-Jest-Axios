/**
 * _bucket1Account.js
 * Provisions an account and runs EOD on boundary dates for Bucket 1:
 *   paymentDueDate  → DPD=0,  Bucket=0  (last safe day)
 *   dpd1Date        → DPD=1,  Bucket=1  (entry boundary)
 *   dpd30Date       → DPD=30, Bucket=1  (exit boundary — last day in Bucket 1)
 *
 * All Bucket 1 tests share this singleton. EOD runs once per session.
 */

const db  = require('../../../helpers/dbHelper');
const { setupOverdraftAccount } = require('../../../fixtures/overdraftSetup');
const {
  runToPaymentDueDate,
  runOnDate,
  getMilestoneDates,
  fetchBucketState,
} = require('../_manageSetup');

let _initialized = false;
let _account, _dates;
let _stateAtDue, _stateAtDPD1, _stateAtDPD30;

async function getAccount() {
  if (_initialized) return { account: _account, dates: _dates, stateAtDue: _stateAtDue, stateAtDPD1: _stateAtDPD1, stateAtDPD30: _stateAtDPD30 };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  // Phase 1+2: drawdown → paymentDueDate (daily EOD)
  await runToPaymentDueDate(_account);
  _stateAtDue = await fetchBucketState(_account.odAccountNumber, _dates.paymentDueDate);

  // Boundary 1: dpd1Date only
  await runOnDate(_dates.paymentDueDate, _dates.dpd1Date, _account, _dates);
  _stateAtDPD1 = await fetchBucketState(_account.odAccountNumber, _dates.dpd1Date);

  // Boundary 2: dpd30Date only
  await runOnDate(_dates.dpd1Date, _dates.dpd30Date, _account, _dates);
  _stateAtDPD30 = await fetchBucketState(_account.odAccountNumber, _dates.dpd30Date);

  _initialized = true;
  return { account: _account, dates: _dates, stateAtDue: _stateAtDue, stateAtDPD1: _stateAtDPD1, stateAtDPD30: _stateAtDPD30 };
}

module.exports = { getAccount };
