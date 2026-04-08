/**
 * overdraftSetup.js
 *
 * Reusable fixture that provisions a fully ready Smart OD account:
 *   Create Customer → Create Account → Create Smart OD
 *   → Opt-In → Consent → Drawdown
 *
 * Usage in any test file:
 *
 *   const { setupOverdraftAccount } = require('../fixtures/overdraftSetup');
 *
 *   describe('My Test', () => {
 *     let account;
 *
 *     beforeAll(async () => {
 *       account = await setupOverdraftAccount();
 *     });
 *
 *     test('something', () => {
 *       console.log(account.odAccountNumber);
 *       console.log(account.linkedAccountNumber);
 *       console.log(account.drawdownDate);
 *     });
 *   });
 *
 * Returns:
 *   {
 *     customerId,
 *     linkedAccountNumber,   // savings account e.g. 250xxxxxxx
 *     odAccountNumber,       // smart OD account e.g. 377xxxxxxx
 *     drawdownDate,          // YYYY-MM-DD
 *     drawdownAmount,        // number
 *     searchResponse,        // raw SearchOverdraft API response data[0]
 *   }
 */

const dayjs  = require('dayjs');
const api    = require('../helpers/apiHelper');
const config = require('../config');
const {
  generateCustomerPayload,
  generateAccountPayload,
  generateSmartODPayload,
  generateInstrumentNumber,
} = require('../data/testData');

// ─────────────────────────────────────────────
// Individual setup steps — exported so they can
// also be called independently if needed
// ─────────────────────────────────────────────

/**
 * Step 1a: Create a customer and return the customerId + contact info
 */
async function createCustomer() {
  const payload  = generateCustomerPayload();
  const response = await api.createCustomer(payload);

  const customerId = response?.data?.customerID ?? response?.customerID

  if (!customerId) throw new Error(`createCustomer failed — no customerId in response: ${JSON.stringify(response)}`);

  return {
    customerId,
    phone: payload._phone,
    email: payload._email,
    lastname:   payload.lastname,
    otherNames: payload.otherNames,
  };
}

/**
 * Step 1b: Create a customer savings account and return the account number
 */
async function createCustomerAccount({ customerId, phone, email, lastname, otherNames }) {
  const payload  = generateAccountPayload({ customerId, phone, email, lastname, otherNames });
  const response = await api.createCustomerAccount(payload);

  const linkedAccountNumber = response?.data?.accountNumber
                           ?? response?.accountNumber;

  if (!linkedAccountNumber) throw new Error(`createCustomerAccount failed — no accountNumber in response: ${JSON.stringify(response)}`);

  return { linkedAccountNumber };
}

/**
 * Step 1c: Create a Smart OD account and return the OD account number
 */
async function createSmartODAccount({ linkedAccountNumber, minimumPaymentPercentage, incomeRecognitionStop, defaultArrearsBucket }) {
  const payload  = generateSmartODPayload({ linkedAccountNumber, minimumPaymentPercentage, incomeRecognitionStop, defaultArrearsBucket });

  const response = await api.createSmartOD(payload);

  const odAccountNumber = response.successfulModels[0].accountNumber

  if (!odAccountNumber) throw new Error(`createSmartODAccount failed — no accountNumber in response: ${JSON.stringify(response)}`);

  return { odAccountNumber };
}

/**
 * Step 2a: Opt-In the OD account
 */
async function optIn({ odAccountNumber }) {
  const response = await api.optIn(odAccountNumber);
  if (!response.isSuccessful) throw new Error(`optIn failed: ${response.message}`);
  return response;
}

/**
 * Step 2b: Consent to the full OD limit
 */
async function consent({ odAccountNumber }) {
  const response = await api.consent(odAccountNumber, config.smartOD.limit);
  if (!response.isSuccessful) throw new Error(`consent failed: ${response.message}`);
  return response;
}

/**
 * Step 2c: Post a drawdown against the linked account
 */
async function drawdown({ linkedAccountNumber, amount }) {
  const drawdownDate = dayjs().format('YYYY-MM-DD');
  const response     = await api.drawdown({
    linkedAccountNumber,
    amount,
    instrumentNumber: generateInstrumentNumber(),
  });

  const ok = response?.isSuccessful ?? response?.success ?? response?.statusCode === 'k00';
  if (!ok) throw new Error(`drawdown failed: ${JSON.stringify(response)}`);

  return { drawdownDate, drawdownAmount: amount };
}

/**
 * Step 3: Search for the OD account and return the first result
 */
async function searchOverdraft({ odAccountNumber }) {
  const result = await api.searchOverdraft(odAccountNumber);
  if (!result) throw new Error(`searchOverdraft returned no record for ${odAccountNumber}`);
  return result;
}

// ─────────────────────────────────────────────
// Main fixture — runs all steps in sequence
// ─────────────────────────────────────────────

/**
 * Provisions a fully ready Smart OD account end-to-end.
 *
 * @param {object}  options
 * @param {number}  [options.drawAmount]   Override the default drawdown amount
 * @param {boolean} [options.withSearch]   Set false to skip SearchOverdraft call (default: true)
 * @returns {Promise<object>}              Account state object
 */
async function setupOverdraftAccount({ drawAmount, minimumPaymentPercentage, incomeRecognitionStop, defaultArrearsBucket,  withSearch = true } = {}) {
  const amount = drawAmount ?? config.smartOD.drawAmount;

  const customer = await createCustomer();

  const { linkedAccountNumber } = await createCustomerAccount(customer);

  const { odAccountNumber } = await createSmartODAccount({ linkedAccountNumber, minimumPaymentPercentage, incomeRecognitionStop, defaultArrearsBucket });

  await optIn({ odAccountNumber });

  await consent({ odAccountNumber });

  const { drawdownDate, drawdownAmount } = await drawdown({ linkedAccountNumber, amount });

  let searchResponse = null;
  if (withSearch) {
    searchResponse = await searchOverdraft({ odAccountNumber });
  }

  console.log('  [setup] ✔ Account ready\n');

  return {
    customerId:          customer.customerId,
    linkedAccountNumber,
    odAccountNumber,
    drawdownDate,
    drawdownAmount,
    searchResponse,
  };
}

async function setupAccountNoDrawdown() {
  const customer = await createCustomer();

  const { linkedAccountNumber } = await createCustomerAccount(customer);

  const { odAccountNumber } = await createSmartODAccount({ linkedAccountNumber });

  await optIn({ odAccountNumber });

  const searchResponse = await searchOverdraft({ odAccountNumber });

  return {
    customerId: customer.customerId,
    linkedAccountNumber,
    odAccountNumber,
    searchResponse,
  };
}

module.exports = {
  setupOverdraftAccount,
  setupAccountNoDrawdown,
  createCustomer,
  createCustomerAccount,
  createSmartODAccount,
  optIn,
  consent,
  drawdown,
  searchOverdraft,
};
