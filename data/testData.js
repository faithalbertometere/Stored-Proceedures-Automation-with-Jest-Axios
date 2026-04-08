/**
 * testData.js
 * Generates fresh randomised customer data for each test run
 * so tests never conflict with each other in the sandbox.
 */
const dayjs = require('dayjs');

let _dateOffset = 0;
function getNextEODDate() {
  return dayjs().add(_dateOffset++, 'day').format('YYYY-MM-DD');
}
const config = require('../config');

function generateCustomerPayload() {
  const ts    = Date.now();
  const phone = `2347${String(ts).slice(-8)}`;
  const email = `AutoTest.${ts}@mockmail.com`;
  const bvn   = String(ts).slice(-11).padStart(11, '9');

  return {
    address:        '991 Davis Crest',
    auditLogData:   config.audit,
    dateOfBirth:    '2000-01-05',
    email,
    gender:         1,
    lastname:       'AutoTest',
    otherNames:     `User${ts}`,
    passport:       'http://placeimg.com/640/480',
    phoneNumber:    phone,
    title:          'Mr.',
    landmark:       'Test Landmark',
    marritalStatus: 1,
    maidenName:     'Test.Maiden',
    religion:       1,
    signature:      'http://placeimg.com/640/480',
    bvn,
    homeTown:       'Lagos',
    nationality:    'Nigerian',
    state:          'Lagos',
    lga:            'Shomolu LGA',
    meansOfIdentification: 2,
    idNumber:       phone,
    nokName:        'Test NOK',
    nokAddress:     '1 Test Street',
    nokRelationship:'Sister',
    nokPhoneNumber: null,
    nokEmail:       'nok@mockmail.com',
    occupation:     'Others',
    employerName:   'Test Employer',
    employerAddress:'1 Employer Street',
    employerPhoneNumber: null,
    businessName:   'Test Business',
    businessLocation: '',
    schoolName:     'Test University',
    schoolLocation: '',
    industry:       null,
    monthlyIncome:  '₦15,001 - ₦100,000',
    purposesOfAccount: [
      '267C1A8F-868C-42D3-AE20-7C0462640186',
      '56f23f5c-7fc2-4fc4-a217-1c74e1107319',
    ],
    sourcesOfIncome: [
      'C38F1F3A-5CD5-4C38-9ECF-AFF906B2E899',
      'd20c84d7-2583-4e5b-a9c3-08253bdee4e9',
    ],
    employmentStatuses: [
      '2F253B13-BDDF-410B-8ABE-7353B2647854',
      'fc4a8ab2-3977-4238-bcc4-5d18ab739051',
    ],
    // expose for reuse in account creation
    _phone: phone,
    _email: email,
  };
}

function generateAccountPayload({ customerId, phone, email, lastname, otherNames}) {
  return {
    accountName:                `${lastname} ${otherNames}`,
    auditLogData:               config.audit,
    customerID:                 customerId,
    email,
    phoneNumber:                phone,
    accountType:                2,
    accountDomicileBranch:      config.smartOD.branchId,
    ProductType:                config.smartOD.productTypeId,
    accountOfficer:             config.smartOD.accountOfficer,
    statementDeliveryMode:      1,
    statementDeliveryFrequency: 2,
    transactionNotificationMode:1,
    TierLevel:                  3,
    IsCustomerRequest:          true,
  };
}

function generateSmartODPayload({ linkedAccountNumber, minimumPaymentPercentage, incomeRecognitionStop, defaultArrearsBucket }) {
  return {
    auditLogData: config.audit,
    accountSmartOverdrafts: [
      {
        limit:               config.smartOD.limit,
        linkedAccountNumber,
        productId:           config.smartOD.productId,
        sponsorId:           config.smartOD.sponsorId,
        ...(minimumPaymentPercentage !== undefined && { minimumPaymentPercentage }),
        ...(incomeRecognitionStop !== undefined && { incomeRecognitionStop }),
        ...(defaultArrearsBucket !== undefined && { defaultArrearsBucket }),
      },
    ],
    approvedBy: config.smartOD.approvedBy,
    createdBy:  config.smartOD.createdBy,
  };
}

function generateInstrumentNumber() {
  // Simple UUID-style generator without external dependency
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

module.exports = {
  generateCustomerPayload,
  generateAccountPayload,
  generateSmartODPayload,
  generateInstrumentNumber,
  getNextEODDate,
};
