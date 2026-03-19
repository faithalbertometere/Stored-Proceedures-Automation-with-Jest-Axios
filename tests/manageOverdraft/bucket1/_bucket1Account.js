const db  = require('../../../helpers/dbHelper');
const api = require('../../../helpers/apiHelper');
const { PROCS, runEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../../fixtures/overdraftSetup');
const {
  runToPaymentDueDate,
  runOnDate,
  getMilestoneDates,
  fetchBucketState,
} = require('../_manageSetup');

let _initialized = false;
let _account, _dates;
let _stateAtDue, _stateAtDPD1BeforeManage, _stateAtDPD1, _stateAtDPD30;

async function getAccount() {
  if (_initialized) return {
    account:                 _account,
    dates:                   _dates,
    stateAtDue:              _stateAtDue,
    stateAtDPD1BeforeManage: _stateAtDPD1BeforeManage,
    stateAtDPD1:             _stateAtDPD1,
    stateAtDPD30:            _stateAtDPD30,
  };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  // Phase 1+2: drawdown → paymentDueDate
  await runToPaymentDueDate(_account);
  _stateAtDue = await fetchBucketState(_account.odAccountNumber, _dates.paymentDueDate);

  // Boundary 1: dpd1Date — capture state before and after ManageOverdraft
  await runEODUntil({
    fromDate: _dates.dpd1Date,
    toDate:   _dates.dpd1Date,
    procs:    [PROCS.DEBT_HISTORY],
  });
  _stateAtDPD1BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd1Date);

  await runEODUntil({
    fromDate: _dates.dpd1Date,
    toDate:   _dates.dpd1Date,
    procs:    [PROCS.MANAGE_OVERDRAFT],
  });
  _stateAtDPD1 = await fetchBucketState(_account.odAccountNumber, _dates.dpd1Date);

  // Boundary 2: dpd30Date
  await runOnDate(_dates.dpd30Date, _account, _dates);
  _stateAtDPD30 = await fetchBucketState(_account.odAccountNumber, _dates.dpd30Date);

  _initialized = true;
  return {
    account:                 _account,
    dates:                   _dates,
    stateAtDue:              _stateAtDue,
    stateAtDPD1BeforeManage: _stateAtDPD1BeforeManage,
    stateAtDPD1:             _stateAtDPD1,
    stateAtDPD30:            _stateAtDPD30,
  };
}

module.exports = { getAccount };