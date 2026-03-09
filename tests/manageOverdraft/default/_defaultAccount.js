/**
 * _defaultAccount.js
 * Boundary dates for Default:
 *   dpd89Date  → DPD=89, Bucket=3  (last day before default)
 *   dpd90Date  → DPD=90, Default   (entry boundary — status=8)
 *
 * TC-2007/2008 (DPD=456, write-off) provision their own accounts
 * since that boundary is far enough to warrant isolation.
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
let _stateAtDPD89, _stateAtDPD90;

async function getAccount() {
  if (_initialized) return { account: _account, dates: _dates, stateAtDPD89: _stateAtDPD89, stateAtDPD90: _stateAtDPD90 };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  await runToPaymentDueDate(_account);

  await runOnDate(_dates.paymentDueDate, _dates.dpd1Date,  _account, _dates);
  await runOnDate(_dates.dpd1Date,       _dates.dpd30Date, _account, _dates);
  await runOnDate(_dates.dpd30Date,      _dates.dpd31Date, _account, _dates);
  await runOnDate(_dates.dpd31Date,      _dates.dpd60Date, _account, _dates);
  await runOnDate(_dates.dpd60Date,      _dates.dpd61Date, _account, _dates);
  await runOnDate(_dates.dpd61Date,      _dates.dpd89Date, _account, _dates);
  _stateAtDPD89 = await fetchBucketState(_account.odAccountNumber, _dates.dpd89Date);

  await runOnDate(_dates.dpd89Date, _dates.dpd90Date, _account, _dates);
  _stateAtDPD90 = await fetchBucketState(_account.odAccountNumber, _dates.dpd90Date);

  _initialized = true;
  return { account: _account, dates: _dates, stateAtDPD89: _stateAtDPD89, stateAtDPD90: _stateAtDPD90 };
}

module.exports = { getAccount };
