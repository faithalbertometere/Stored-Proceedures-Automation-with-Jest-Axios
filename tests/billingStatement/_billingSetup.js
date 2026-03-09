/**
 * _billingSetup.js
 * Shared EOD runner for billing statement tests.
 * Runs DebtHistory daily from drawdown → statementRunDate,
 * then BillingStatement on statementRunDate only.
 */

const dayjs = require('dayjs');
const {
  PROCS,
  runEODUntil,
  continueEODUntil,
  getNextStatementRunDate,
  getPaymentDates,
} = require('../../helpers/eodRunner');

async function runBillingEOD(account) {
  const { statementDay, gracePeriodInDays, optInDate } = account.searchResponse;

  const statementRunDate   = getNextStatementRunDate(account.drawdownDate, statementDay);
  const statementStampDate = dayjs(statementRunDate).add(1, 'day').format('YYYY-MM-DD');
  const { paymentDueDate } = getPaymentDates(statementStampDate, gracePeriodInDays);
  const cycleStartDate     = dayjs(optInDate).format('YYYY-MM-DD');
  const cycleEndDate       = statementRunDate;

  console.log(`  [billing] optInDate:         ${cycleStartDate}`);
  console.log(`  [billing] cycleEndDate:      ${cycleEndDate}`);
  console.log(`  [billing] statementRunDate:  ${statementRunDate}`);
  console.log(`  [billing] statementStamp:    ${statementStampDate}`);
  console.log(`  [billing] paymentDueDate:    ${paymentDueDate}`);

  await runEODUntil({
    fromDate: account.drawdownDate,
    toDate:   statementRunDate,
    procs:    [PROCS.DEBT_HISTORY],
  });

  await continueEODUntil({
    lastDate: dayjs(statementRunDate).subtract(1, 'day').format('YYYY-MM-DD'),
    toDate:   statementRunDate,
    procs:    [PROCS.BILLING_STATEMENT],
  });

  return { statementRunDate, statementStampDate, paymentDueDate, cycleStartDate, cycleEndDate };
}

function calcDailyInterest(principal, rate) {
  return parseFloat(((principal * rate) / 100 / 30).toFixed(2));
}

function calcCycleInterest(principal, rate, cycleStartDate, cycleEndDate) {
  const days = dayjs(cycleEndDate).diff(dayjs(cycleStartDate), 'day') + 1;
  return parseFloat(((principal * rate) / 100 / 30 * days).toFixed(2));
}

function calcMinimumPayment({ principal, rate, minPaymentPct, cycleStartDate, cycleEndDate }) {
  const cycleInterest       = calcCycleInterest(principal, rate, cycleStartDate, cycleEndDate);
  const principalMinPayment = parseFloat(((minPaymentPct / 100) * principal).toFixed(2));
  const totalMinimumPayment = parseFloat((principalMinPayment + cycleInterest).toFixed(2));
  return { principalMinPayment, cycleInterest, totalMinimumPayment };
}

module.exports = { runBillingEOD, calcDailyInterest, calcCycleInterest, calcMinimumPayment };
