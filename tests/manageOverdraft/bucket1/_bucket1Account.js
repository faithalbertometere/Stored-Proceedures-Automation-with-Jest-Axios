const db  = require('../../../helpers/dbHelper');
const { PROCS, runEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount } = require('../../../fixtures/overdraftSetup');
const {
  runToPaymentDueDate,
  getMilestoneDates,
  fetchBucketState,
} = require('../_manageSetup');

let _initialized = false;
let _account, _dates;
let _stateYetUnDue, _stateAtDPD1BeforeManage, _stateAtDPD1, _stateAtDPD30, _statement;

async function getAccount() {
  // if (_initialized) return {
  //   account:                 _account,
  //   dates:                   _dates,
  //   stateLastSafeDate:       _stateYetUnDue,
  //   stateAtDPD1BeforeManage: _stateAtDPD1BeforeManage,
  //   stateAtDPD1:             _stateAtDPD1,
  //   stateAtDPD30:            _stateAtDPD30,
  // };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  // Phase 1+2: drawdown → paymentDueDate
  await runToPaymentDueDate(_account);
  _stateYetUnDue = await fetchBucketState(_account.odAccountNumber, _dates.lastSafeDate);

  // Boundary 1: dpd1Date — capture state before and after ManageOverdraft
  await runEODUntil({
    fromDate: _dates.paymentDueDate,
    toDate:   _dates.paymentDueDate,
    procs:    [PROCS.DEBT_HISTORY],
  });
  _stateAtDPD1BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd1Date);

  await runEODUntil({
    fromDate: _dates.paymentDueDate,
    toDate:   _dates.paymentDueDate,
    procs:    [PROCS.BILLING_STATEMENT, PROCS.MANAGE_OVERDRAFT],
  });
  _stateAtDPD1 = await fetchBucketState(_account.odAccountNumber, _dates.paymentDueDate);

  const statement = await db.getOverdraftStatement(_account.odAccountNumber, _dates.statementStampDate);

  // Boundary 2: dpd30Date
  await runEODUntil({ fromDate: _dates.dpd30Date, toDate: _dates.dpd30Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD30BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd30Date); 
  await runEODUntil({ fromDate: _dates.dpd30Date, toDate: _dates.dpd30Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD30 = await fetchBucketState(_account.odAccountNumber, _dates.dpd30Date);

  // _initialized = true;
  return {
    account:                 _account,
    dates:                   _dates,
    stateLastSafeDate:       _stateYetUnDue,
    stateAtDPD1BeforeManage: _stateAtDPD1BeforeManage,
    stateAtDPD1:             _stateAtDPD1,
    stateAtDPD30:            _stateAtDPD30,
    statement
  };
}

module.exports = { getAccount };