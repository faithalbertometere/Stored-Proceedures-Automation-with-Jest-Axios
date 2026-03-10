/**
 * CREDIT-TC-2009
 * Verify Account Transition to Arrears Bucket with Partial Payment for Multiple Cycle Minimum Payment Debt
 *
 * Scenario:
 *   Cycle 1 min payment missed → DPD=1, Bucket 1
 *   Cycle 2 min payment missed → DPD=31, Bucket 2
 *   Partial payment made (less than Bucket 1 full amount)
 *   → Account should remain in Bucket 2 (partial does not clear bucket)
 *   Full Bucket 1 + partial Bucket 2 payment
 *   → Account should drop to Bucket 1
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2009 --runInBand
 */
const dayjs = require('dayjs');
const db    = require('../../../helpers/dbHelper');
const api   = require('../../../helpers/apiHelper');
const { PROCS, continueEODUntil } = require('../../../helpers/eodRunner');
const { setupOverdraftAccount }    = require('../../../fixtures/overdraftSetup');
const { generateInstrumentNumber } = require('../../../data/testData');
const { runToPaymentDueDate, runOnDate, getMilestoneDates, fetchBucketState } = require('../_manageSetup');

let account, dates;
let stateAtBucket2, stateAfterSmallPayment, stateAfterBucket1Payment;

beforeAll(async () => {
  await db.connect();
  account = await setupOverdraftAccount();
  dates   = getMilestoneDates(account);
  await runToPaymentDueDate(account);

  // Advance to DPD=31 boundary (Bucket 2) without any payment
  await runOnDate(dates.paymentDueDate, dates.dpd1Date,  account, dates);
  await runOnDate(dates.dpd1Date,       dates.dpd30Date, account, dates);
  const dpd31Date = await runOnDate(dates.dpd30Date, dates.dpd31Date, account, dates);
  stateAtBucket2  = await fetchBucketState(account.odAccountNumber, dpd31Date);

  // Small partial payment (5% — not enough to clear any bucket)
  const smallPayment = parseFloat((account.searchResponse.overdrawnAmount * 0.05).toFixed(2));
  console.log(`  [TC-2009] Small partial payment: ${smallPayment}`);
  await api.makeRepayment(account.linkedAccountNumber, smallPayment, generateInstrumentNumber());
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance: account.searchResponse.overdrawnAmount - smallPayment });

  const nextDay1 = dayjs(dpd31Date).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: dpd31Date, toDate: nextDay1, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterSmallPayment = await fetchBucketState(account.odAccountNumber, nextDay1);

  // Now pay full Bucket 1 + partial Bucket 2
  const stmt1        = await db.getOverdraftStatement(account.odAccountNumber, dates.statementStampDate);
  const bucket1Full  = stmt1?.MinimumPaymentBalance ?? account.searchResponse.paymentDueInfo?.[0]?.minimumPaymentBalance;
  console.log(`  [TC-2009] Full Bucket 1 + partial Bucket 2 payment: ${bucket1Full}`);
  await api.makeRepayment(account.linkedAccountNumber, bucket1Full, generateInstrumentNumber());
  await api.waitForRepaymentProcessed({ accountNumber: account.odAccountNumber, expectedBalance: stateAfterSmallPayment.searchResponse.overdrawnAmount - bucket1Full });

  const nextDay2 = dayjs(nextDay1).add(1, 'day').format('YYYY-MM-DD');
  await continueEODUntil({ lastDate: nextDay1, toDate: nextDay2, procs: [PROCS.DEBT_HISTORY, PROCS.MANAGE_OVERDRAFT] });
  stateAfterBucket1Payment = await fetchBucketState(account.odAccountNumber, nextDay2);
}, 3_600_000);

afterAll(async () => { await db.disconnect(); });

describe('CREDIT-TC-2009 — Multi-Cycle Partial Payment Bucket Transitions', () => {

  test('At DPD=31: ArrearsBucket = 2 (two cycles missed)', () => {
    expect(stateAtBucket2.dbRecord.ArrearsBucket).toBe(2);
  });

  test('After small partial payment: ArrearsBucket still = 2', () => {
    expect(stateAfterSmallPayment.dbRecord.ArrearsBucket).toBe(2);
  });

  test('After small partial payment: API arrearsBucket still = 2', () => {
    expect(stateAfterSmallPayment.searchResponse.arrearsBucket).toBe(2);
  });

  test('After Bucket 1 full payment: ArrearsBucket drops to 1', () => {
    expect(stateAfterBucket1Payment.dbRecord.ArrearsBucket).toBe(1);
  });

  test('After Bucket 1 full payment: API arrearsBucket = 1', () => {
    expect(stateAfterBucket1Payment.searchResponse.arrearsBucket).toBe(1);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  CREDIT-TC-2009 — Summary');
    console.log('══════════════════════════════════════════════════');
    console.log(`  OD Account:             ${account?.odAccountNumber}`);
    console.log(`  Bucket at DPD=31:       ${stateAtBucket2?.dbRecord?.ArrearsBucket}`);
    console.log(`  Bucket after small pay: ${stateAfterSmallPayment?.dbRecord?.ArrearsBucket}`);
    console.log(`  Bucket after B1 pay:    ${stateAfterBucket1Payment?.dbRecord?.ArrearsBucket}`);
    console.log('══════════════════════════════════════════════════\n');
  });
});
