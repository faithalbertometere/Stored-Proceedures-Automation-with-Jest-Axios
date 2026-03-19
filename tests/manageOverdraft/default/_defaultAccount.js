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
let _stateAtDPD89BeforeManage, _stateAtDPD89;
let _stateAtDPD90BeforeManage, _stateAtDPD90;

async function getAccount() {
  if (_initialized) return {
    account:                  _account,
    dates:                    _dates,
    stateAtDPD89BeforeManage: _stateAtDPD89BeforeManage,
    stateAtDPD89:             _stateAtDPD89,
    stateAtDPD90BeforeManage: _stateAtDPD90BeforeManage,
    stateAtDPD90:             _stateAtDPD90,
  };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  await runToPaymentDueDate(_account);

  // dpd1Date through dpd61Date — not boundary assertions, run both together
  await runEODUntil({
    fromDate: _dates.dpd1Date,
    toDate:   _dates.dpd1Date,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  await runEODUntil({
    fromDate: _dates.dpd30Date,
    toDate:   _dates.dpd30Date,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  await runEODUntil({
    fromDate: _dates.dpd31Date,
    toDate:   _dates.dpd31Date,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  await runEODUntil({
    fromDate: _dates.dpd60Date,
    toDate:   _dates.dpd60Date,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  await runEODUntil({
    fromDate: _dates.dpd61Date,
    toDate:   _dates.dpd61Date,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  // dpd89Date — last day in bucket 3
  await runEODUntil({ fromDate: _dates.dpd89Date, toDate: _dates.dpd89Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD89BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd89Date);
  await runEODUntil({ fromDate: _dates.dpd89Date, toDate: _dates.dpd89Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD89 = await fetchBucketState(_account.odAccountNumber, _dates.dpd89Date);

  // dpd90Date — default entry
  await runEODUntil({ fromDate: _dates.dpd90Date, toDate: _dates.dpd90Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD90BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd90Date);
  await runEODUntil({ fromDate: _dates.dpd90Date, toDate: _dates.dpd90Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD90 = await fetchBucketState(_account.odAccountNumber, _dates.dpd90Date);

  _initialized = true;
  return {
    account:                  _account,
    dates:                    _dates,
    stateAtDPD89BeforeManage: _stateAtDPD89BeforeManage,
    stateAtDPD89:             _stateAtDPD89,
    stateAtDPD90BeforeManage: _stateAtDPD90BeforeManage,
    stateAtDPD90:             _stateAtDPD90,
  };
}

module.exports = { getAccount };