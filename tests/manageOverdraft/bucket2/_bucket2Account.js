/**
 * _bucket2Account.js
 * Boundary dates for Bucket 2:
 *   dpd30Date  → DPD=30, Bucket=1  (last day before transition)
 *   dpd31Date  → DPD=31, Bucket=2  (entry boundary)
 *   dpd60Date  → DPD=60, Bucket=2  (exit boundary — last day in Bucket 2)
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
let _stateAtDPD30, _stateAtDPD31, _stateAtDPD60;

async function getAccount() {
  if (_initialized) return { account: _account, dates: _dates, stateAtDPD30: _stateAtDPD30, stateAtDPD31: _stateAtDPD31, stateAtDPD60: _stateAtDPD60 };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  await runToPaymentDueDate(_account);

  await runOnDate(_dates.paymentDueDate, _dates.dpd1Date,  _account, _dates);
  await runOnDate(_dates.dpd1Date,       _dates.dpd30Date, _account, _dates);
  _stateAtDPD30 = await fetchBucketState(_account.odAccountNumber, _dates.dpd30Date);

  await runOnDate(_dates.dpd30Date, _dates.dpd31Date, _account, _dates);
  _stateAtDPD31 = await fetchBucketState(_account.odAccountNumber, _dates.dpd31Date);

  await runOnDate(_dates.dpd31Date, _dates.dpd60Date, _account, _dates);
  _stateAtDPD60 = await fetchBucketState(_account.odAccountNumber, _dates.dpd60Date);

  _initialized = true;
  return { account: _account, dates: _dates, stateAtDPD30: _stateAtDPD30, stateAtDPD31: _stateAtDPD31, stateAtDPD60: _stateAtDPD60 };
}

module.exports = { getAccount };
