/**
 * _bucket3Account.js
 * Boundary dates for Bucket 3:
 *   dpd60Date  → DPD=60, Bucket=2  (last day before transition)
 *   dpd61Date  → DPD=61, Bucket=3  (entry boundary)
 *   dpd89Date  → DPD=89, Bucket=3  (exit boundary — last day before default)
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
let _stateAtDPD60, _stateAtDPD61, _stateAtDPD89;

async function getAccount() {
  if (_initialized) return { account: _account, dates: _dates, stateAtDPD60: _stateAtDPD60, stateAtDPD61: _stateAtDPD61, stateAtDPD89: _stateAtDPD89 };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  await runToPaymentDueDate(_account);

  // Jump through each bucket entry boundary
  await runOnDate(_dates.paymentDueDate, _dates.dpd1Date,  _account, _dates);
  await runOnDate(_dates.dpd1Date,       _dates.dpd30Date, _account, _dates);
  await runOnDate(_dates.dpd30Date,      _dates.dpd31Date, _account, _dates);
  await runOnDate(_dates.dpd31Date,      _dates.dpd60Date, _account, _dates);
  _stateAtDPD60 = await fetchBucketState(_account.odAccountNumber, _dates.dpd60Date);

  await runOnDate(_dates.dpd60Date, _dates.dpd61Date, _account, _dates);
  _stateAtDPD61 = await fetchBucketState(_account.odAccountNumber, _dates.dpd61Date);

  await runOnDate(_dates.dpd61Date, _dates.dpd89Date, _account, _dates);
  _stateAtDPD89 = await fetchBucketState(_account.odAccountNumber, _dates.dpd89Date);

  _initialized = true;
  return { account: _account, dates: _dates, stateAtDPD60: _stateAtDPD60, stateAtDPD61: _stateAtDPD61, stateAtDPD89: _stateAtDPD89 };
}

module.exports = { getAccount };
