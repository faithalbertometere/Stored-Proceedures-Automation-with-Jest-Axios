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
let _stateAtDPD60BeforeManage, _stateAtDPD60;
let _stateAtDPD61BeforeManage, _stateAtDPD61;
let _stateAtDPD89BeforeManage, _stateAtDPD89;

async function getAccount() {
  if (_initialized) return {
    account:                  _account,
    dates:                    _dates,
    stateAtDPD60BeforeManage: _stateAtDPD60BeforeManage,
    stateAtDPD60:             _stateAtDPD60,
    stateAtDPD61BeforeManage: _stateAtDPD61BeforeManage,
    stateAtDPD61:             _stateAtDPD61,
    stateAtDPD89BeforeManage: _stateAtDPD89BeforeManage,
    stateAtDPD89:             _stateAtDPD89,
  };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  await runToPaymentDueDate(_account);

  // dpd1Date, dpd30Date, dpd31Date — not boundary assertions, run both together
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

  // dpd60Date — last day in bucket 2
  await runEODUntil({ fromDate: _dates.dpd60Date, toDate: _dates.dpd60Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD60BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd60Date);
  await runEODUntil({ fromDate: _dates.dpd60Date, toDate: _dates.dpd60Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD60 = await fetchBucketState(_account.odAccountNumber, _dates.dpd60Date);

  // dpd61Date — bucket 3 entry
  await runEODUntil({ fromDate: _dates.dpd61Date, toDate: _dates.dpd61Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD61BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd61Date);
  await runEODUntil({ fromDate: _dates.dpd61Date, toDate: _dates.dpd61Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD61 = await fetchBucketState(_account.odAccountNumber, _dates.dpd61Date);

  // dpd89Date — last day in bucket 3
  await runEODUntil({ fromDate: _dates.dpd89Date, toDate: _dates.dpd89Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD89BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd89Date);
  await runEODUntil({ fromDate: _dates.dpd89Date, toDate: _dates.dpd89Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD89 = await fetchBucketState(_account.odAccountNumber, _dates.dpd89Date);

  _initialized = true;
  return {
    account:                  _account,
    dates:                    _dates,
    stateAtDPD60BeforeManage: _stateAtDPD60BeforeManage,
    stateAtDPD60:             _stateAtDPD60,
    stateAtDPD61BeforeManage: _stateAtDPD61BeforeManage,
    stateAtDPD61:             _stateAtDPD61,
    stateAtDPD89BeforeManage: _stateAtDPD89BeforeManage,
    stateAtDPD89:             _stateAtDPD89,
  };
}

module.exports = { getAccount };