/**
 * _billingSetup.js
 * Shared date calculations and formula helpers for billing statement tests.
 * Each test file is responsible for its own EOD proc orchestration.
 */

const dayjs = require('dayjs');
const {
  getNextStatementRunDate,
  getPaymentDates,
} = require('../../helpers/eodRunner');

function getBillingDates(account) {
  const { statementDay, gracePeriodInDays, optInDate } = account.searchResponse;

  const cycleStartDate     = dayjs(optInDate).format('YYYY-MM-DD');
  const statementRunDate   = getNextStatementRunDate(cycleStartDate, statementDay);
  const statementStampDate = dayjs(statementRunDate).add(1, 'day').format('YYYY-MM-DD');
  const { paymentDueDate } = getPaymentDates(statementStampDate, gracePeriodInDays);
  const cycleEndDate       = statementRunDate;

  console.log(`  [billing] cycleStartDate:    ${cycleStartDate}`);
  console.log(`  [billing] cycleEndDate:      ${cycleEndDate}`);
  console.log(`  [billing] statementRunDate:  ${statementRunDate}`);
  console.log(`  [billing] statementStamp:    ${statementStampDate}`);
  console.log(`  [billing] paymentDueDate:    ${paymentDueDate}`);

  return { cycleStartDate, cycleEndDate, statementRunDate, statementStampDate, paymentDueDate };
}

function calcDailyInterest(principal, rate) {
  return (principal * rate) / 100 / 30;
}

// function calcCycleInterest(principal, rate, cycleStartDate, cycleEndDate) {
//   const days = dayjs(cycleEndDate).diff(dayjs(cycleStartDate), 'day') + 1;
//   return (principal * rate) / 100 / 30 * days;
// }

function calcMinimumPayment({ principal, minPaymentRate }) {
  return (minPaymentRate / 100) * principal;
}

module.exports = { getBillingDates, calcDailyInterest, calcMinimumPayment };