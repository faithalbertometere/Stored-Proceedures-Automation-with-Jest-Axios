/**
 * Central config — update environment variables or edit defaults here
 */

require('dotenv').config();

module.exports = {
  db: {
    server:   process.env.DB_SERVER,
    user:     process.env.DB_USER,     
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_DATABASE,
    options:  { trustServerCertificate: true, enableArithAbort: true },
  },

  // clientId: process.env.clientId,

  headers: {
    nerve: {
      'Content-Type': 'application/json',
      'Accept':       'text/plain',
      'ClientID':     process.env.clientId,
    },
    nerveCreate: {
      'Content-Type': 'application/json',
      'ClientId':     process.env.clientId,
    }
  },

  urls: {
    createCustomer:  process.env.createCustomer,
    createAccount:   process.env.createAccount,
    createSmartOD:   process.env.createSmartOD,
    optIn:           process.env.optIn,
    consent:         process.env.consent,
    drawdown:        process.env.drawdown,
    searchOverdraft: process.env.searchOverdraft,
    activityLog:     process.env.activityLog,
  },

  smartOD: {
    productId:  process.env.productId,
    sponsorId:  process.env.sponsorId,
    limit:      10000000,
    drawAmount: 5000000,
    glAccount:  process.env.glAccount,
    branchId:   process.env.branchId,
    createdBy:  'EOD_Automation',
    approvedBy: 'EOD_Automation',
    accountOfficer: process.env.accountOfficer,
    productTypeId:   process.env.productTypeId,
  },

  audit: {
    USERID:            process.env.USERID,
    USERNAME:          process.env.USERNAME,
    APPLICATIONID:     process.env.APPLICATIONID,
    SYSTEMIDENTIFIER:  process.env.SYSTEMIDENTIFIER,
    SYSTEMIPADDRESS:   process.env.SYSTEMIPADDRESS,
    SYSTEMMACADDRESS:  process.env.SYSTEMMACADDRESS,
    SYSTEMNAME:        process.env.SYSTEMNAME,
    SUBJECTIDENTIFIER: process.env.SUBJECTIDENTIFIER,
  },

  tables: {
    BalanceHistory: process.env.BalanceHistory,
    OverdraftDebtBreakdowns: process.env.OverdraftDebtBreakdowns,
    Statement: process.env.Statement,
    Postings_History: process.env.Postings_History,
    SmartODActivity: process.env.SmartODActivity,
  },

  procs: {
  RECONCILIATION:    process.env.RECONCILIATION,
  DEBT_HISTORY:      process.env.DEBT_HISTORY,
  INTEREST_ACCRUAL:  process.env.INTEREST_ACCRUAL,
  BILLING_STATEMENT: process.env.BILLING_STATEMENT,
  MANAGE_OVERDRAFT:  process.env.MANAGE_OVERDRAFT,
  }
};
