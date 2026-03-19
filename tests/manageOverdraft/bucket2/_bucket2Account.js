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
let _stateAtDPD30BeforeManage, _stateAtDPD30;
let _stateAtDPD31BeforeManage, _stateAtDPD31;
let _stateAtDPD60BeforeManage, _stateAtDPD60;

async function getAccount() {
  if (_initialized) return {
    account:                  _account,
    dates:                    _dates,
    stateAtDPD30BeforeManage: _stateAtDPD30BeforeManage,
    stateAtDPD30:             _stateAtDPD30,
    stateAtDPD31BeforeManage: _stateAtDPD31BeforeManage,
    stateAtDPD31:             _stateAtDPD31,
    stateAtDPD60BeforeManage: _stateAtDPD60BeforeManage,
    stateAtDPD60:             _stateAtDPD60,
  };

  await db.connect();
  _account = await setupOverdraftAccount();
  _dates   = getMilestoneDates(_account);

  await runToPaymentDueDate(_account);

  // dpd1Date — not a boundary we assert on, run both together
  await runEODUntil({
    fromDate: _dates.dpd1Date,
    toDate:   _dates.dpd1Date,
    procs:    [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT],
  });

  // dpd30Date — last day in bucket 1
  await runEODUntil({ fromDate: _dates.dpd30Date, toDate: _dates.dpd30Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD30BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd30Date);
  await runEODUntil({ fromDate: _dates.dpd30Date, toDate: _dates.dpd30Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD30 = await fetchBucketState(_account.odAccountNumber, _dates.dpd30Date);

  // dpd31Date — bucket 2 entry
  await runEODUntil({ fromDate: _dates.dpd31Date, toDate: _dates.dpd31Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD31BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd31Date);
  await runEODUntil({ fromDate: _dates.dpd31Date, toDate: _dates.dpd31Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD31 = await fetchBucketState(_account.odAccountNumber, _dates.dpd31Date);

  // dpd60Date — last day in bucket 2
  await runEODUntil({ fromDate: _dates.dpd60Date, toDate: _dates.dpd60Date, procs: [PROCS.DEBT_HISTORY] });
  _stateAtDPD60BeforeManage = await fetchBucketState(_account.odAccountNumber, _dates.dpd60Date);
  await runEODUntil({ fromDate: _dates.dpd60Date, toDate: _dates.dpd60Date, procs: [PROCS.MANAGE_OVERDRAFT] });
  _stateAtDPD60 = await fetchBucketState(_account.odAccountNumber, _dates.dpd60Date);

  _initialized = true;
  return {
    account:                  _account,
    dates:                    _dates,
    stateAtDPD30BeforeManage: _stateAtDPD30BeforeManage,
    stateAtDPD30:             _stateAtDPD30,
    stateAtDPD31BeforeManage: _stateAtDPD31BeforeManage,
    stateAtDPD31:             _stateAtDPD31,
    stateAtDPD60BeforeManage: _stateAtDPD60BeforeManage,
    stateAtDPD60:             _stateAtDPD60,
  };
}

module.exports = { getAccount };