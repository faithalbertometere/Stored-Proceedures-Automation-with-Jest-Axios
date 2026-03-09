/**
 * CREDIT-TC-2007
 * Verify account is flagged written off when it hits 456 days and above
 * Boundaries: dpd455Date (last day before write-off) → dpd456Date (write-off entry)
 *
 * ⚠️  This test runs EOD on only 2 boundary dates (455 + 456) after advancing
 *     through all prior bucket boundaries. Still a long test — run in isolation.
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2007 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const { setupOverdraftAccount }  = require('../../../fixtures/overdraftSetup');
const {
  runToPaymentDueDate,
  runOnDate,
  getMilestoneDates,
  fetchBucketState,
  assertStatus,
  STATUS,
} = require('../_manageSetup');

let account, dates, stateAtDPD455, stateAtDPD456;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);

  await runToPaymentDueDate(account);

  // Jump through all bucket entry boundaries
  const boundaries = [
    dates.dpd1Date, dates.dpd30Date, dates.dpd31Date,
    dates.dpd60Date, dates.dpd61Date, dates.dpd89Date, dates.dpd90Date,
  ];
  let last = dates.paymentDueDate;
  for (const d of boundaries) {
    await runOnDate(last, d, account, dates);
    last = d;
  }

  // Write-off boundaries
  const dpd455Date = dayjs(dates.dpd1Date).add(454, 'day').format('YYYY-MM-DD');
  await runOnDate(last, dpd455Date, account, dates);
  stateAtDPD455 = await fetchBucketState(account.odAccountNumber, dpd455Date);

  await runOnDate(dpd455Date, dates.dpd456Date, account, dates);
  stateAtDPD456 = await fetchBucketState(account.odAccountNumber, dates.dpd456Date);
}, 900_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-2007 — Account Written Off at DPD=456', () => {

  describe('Boundary: DPD=455 — last day before write-off', () => {
    test('status = DebtDisabledDefault (not yet written off)', () => {
      expect(stateAtDPD455.searchResponse.status).toBe(STATUS.DEBT_DISABLED_DEFAULT);
    });
    test('DaysPastDue = 455', () => {
      expect(stateAtDPD455.dbRecord.DaysPastDue).toBe(455);
    });
  });

  describe('Boundary: DPD=456 — write-off entry', () => {
    assertStatus(() => stateAtDPD456, STATUS.WRITE_OFF, 'Write-off (status=9)');
    test('DaysPastDue >= 456', () => {
      expect(stateAtDPD456.dbRecord.DaysPastDue).toBeGreaterThanOrEqual(456);
    });
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-2007 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  DPD=455: status=${stateAtDPD455?.searchResponse?.status}`);
    console.log(`  DPD=456: status=${stateAtDPD456?.searchResponse?.status}`);
    console.log('══════════════════════════════════════════\n');
  });
});
