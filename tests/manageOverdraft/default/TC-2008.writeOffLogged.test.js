/**
 * CREDIT-TC-2008
 * Verify written off account is logged on activity log
 * Boundary: log entry should appear at dpd456Date, not before
 *
 * Shares the same account progression as TC-2007 but provisions independently.
 * Run both together: npx jest tests/manageOverdraft/default/ --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const { setupOverdraftAccount }  = require('../../../fixtures/overdraftSetup');
const {
  runToPaymentDueDate,
  runOnDate,
  getMilestoneDates,
  fetchBucketState,
} = require('../_manageSetup');

let account, dates, stateAtDPD455, stateAtDPD456;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);

  await runToPaymentDueDate(account);

  const boundaries = [
    dates.dpd1Date, dates.dpd30Date, dates.dpd31Date,
    dates.dpd60Date, dates.dpd61Date, dates.dpd89Date, dates.dpd90Date,
  ];
  let last = dates.paymentDueDate;
  for (const d of boundaries) {
    await runOnDate(last, d, account, dates);
    last = d;
  }

  const dpd455Date = dayjs(dates.dpd1Date).add(454, 'day').format('YYYY-MM-DD');
  await runOnDate(last, dpd455Date, account, dates);
  stateAtDPD455 = await fetchBucketState(account.odAccountNumber, dpd455Date);

  await runOnDate(dpd455Date, dates.dpd456Date, account, dates);
  stateAtDPD456 = await fetchBucketState(account.odAccountNumber, dates.dpd456Date);
}, 900_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-2008 — Write-Off Logged at DPD=456 Boundary', () => {

  test('No write-off log entry at DPD=455', () => {
    const entries = stateAtDPD455.activityLog.filter(e =>
      e.transactionType === 'Write-off' || e.description?.toLowerCase().includes('write')
    );
    expect(entries.length).toBe(0);
  });

  test('Write-off log entry exists at DPD=456', () => {
    expect(stateAtDPD456.activityLog.some(e =>
      e.transactionType === 'Write-off' ||
      e.transactionType === 'Account Write-off' ||
      e.description?.toLowerCase().includes('write')
    )).toBe(true);
  });

  test('Write-off entry is on the correct account', () => {
    const entry = stateAtDPD456.activityLog.find(e =>
      e.transactionType === 'Write-off' || e.description?.toLowerCase().includes('write')
    );
    expect(entry).toBeDefined();
    expect(entry.accountNumber).toBe(account.odAccountNumber);
  });

  afterAll(() => {
    const entry = stateAtDPD456.activityLog?.find(e => e.description?.toLowerCase().includes('write'));
    console.log(`\n  TC-2008 | Write-off log: ${entry?.transactionType} — ${entry?.description}\n`);
  });
});
