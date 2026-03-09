# Overdraft Test Suite

Automated Jest tests for the Overdraft EOD proc pipeline and API validation.

## Project Structure

```
overdraft-tests/
├── config/
│   └── index.js                          # All URLs, headers, IDs, DB config (reads from .env)
├── data/
│   └── testData.js                       # Payload generators (unique per run)
├── fixtures/
│   └── overdraftSetup.js                 # Reusable account provisioning fixtures
├── helpers/
│   ├── apiHelper.js                      # Axios wrappers for all API calls
│   ├── dbHelper.js                       # MSSQL connection + query helpers
│   └── eodRunner.js                      # EOD proc runner (runEODUntil, PROCS)
├── scripts/
│   └── cleanup.js                        # Deletes test records by date
├── tests/
│   ├── debtHistory/
│   │   ├── TC-815.debtHistoryUpdated
│   │   └── TC-816.allActiveAccountsRecorded
│   ├── interestAccrual/
│   │   ├── TC-686.correctAccrualOnOverdrawn
│   │   ├── TC-687.noAccrualBeforeWithdrawal
│   │   ├── TC-688.dailyAccrualWhileInDebt
│   │   ├── TC-689.noAccrualAfterFullRepayment
│   │   ├── TC-690.accrualOnDrawnAmountOnly
│   │   ├── TC-691.noAccrualWhenUnused
│   │   ├── TC-692.interestOnlyRepayment
│   │   ├── TC-693.partialInterestRepayment
│   │   ├── TC-694.newDrawdownAfterRepayment
│   │   ├── TC-817.activityLogUpdated
│   │   ├── TC-818.glPostingsAfterInterestAccrual
│   │   └── TC-819.debtBreakdownUpdated
│   ├── debtBreakdown/
│   │   ├── TC-813.drawdownStoredInBreakdown
│   │   └── TC-814.repaymentUpdatesBreakdown
│   ├── billingStatement/
│   │   ├── TC-546.minimumPaymentFormula
│   │   ├── TC-696.calculatedPerCycle
│   │   ├── TC-942.zeroMinPayBeforeWithdrawal
│   │   ├── TC-943.zeroMinPayAfterFullRepayment
│   │   ├── TC-944.partialRepaymentCalculation
│   │   └── TC-945.carryoverNextMonth
│   └── manageOverdraft/
│       ├── TC-552.arrearsConfigurable
│       ├── TC-553-554.bucket0Stays
│       ├── bucket1/   (TC-555, TC-714 to TC-719)
│       ├── bucket2/   (TC-720 to TC-725, TC-1992)
│       ├── bucket3/   (TC-1993 to TC-2000)
│       └── default/   (TC-2001 to TC-2009)
├── reports/                              # Generated HTML test reports (gitignored)
├── .env                                  # Credentials — never commit (gitignored)
├── package.json
└── README.md
```

## Setup

```bash
npm install
```

Create a `.env` file in the project root with your credentials:

```
DB_SERVER=your_db_server
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_DATABASE=Kuda.CBA.PostingManagement

API_BASE_URL=your_api_base_url
clientId=your_client_id
```

## Running Tests

```bash
# Run all tests
npm test

# Run by category
npm run test:debt
npm run test:interest
npm run test:breakdown
npm run test:billing
npm run test:manage

# Run a single test file
npm run test:interest:688
npm run test:manage:555
```

## EOD Proc Execution Order

Each test runs EOD procs in the correct order for the scenario being tested:

```
1. EOD_OverdraftDebtHistory        — records principal snapshot (runs every day)
2. EOD_SmartOverdraftInterestAccrual — accrues interest on principal (runs every day, after DebtHistory)
3. EOD_OverdraftBillingStatement   — generates statement (runs on statementDay-1 only)
4. EOD_ManageSmartOverdraft        — manages arrears buckets and account status (runs every day)
```

> **Important:** Interest accrued on Day N only appears in DebtHistory on Day N+1.
> Tests that assert `UnpaidOverdraftInterest` must run DebtHistory on the following day to see the value.

## Interest Accrual Formula

```javascript
dailyInterest = (principal * interestRate) / 100 / 30
```

Amounts are stored as whole kobo values — no rounding with `toFixed`. Use `Math.round()` only when the principal is a non-round number (e.g. after partial repayment).

## Repayment Offset Rule

Repayments clear **interest first**, then principal:

```
Customer owes: 5,000 principal + 1,000 interest
  repay 1,000  → clears 1,000 interest,  principal stays at 5,000
  repay 1,500  → clears 1,000 interest + 500 principal → 4,500 remaining
  repay 6,000  → clears everything → 0 principal, 0 interest
```

## Fixtures

### `setupOverdraftAccount(options)`

Provisions a fully ready Smart OD account end-to-end:

```javascript
account = await setupOverdraftAccount();
// or with a custom draw amount:
account = await setupOverdraftAccount({ drawAmount: 2500000 });

// Returns:
// {
//   customerId, linkedAccountNumber, odAccountNumber,
//   drawdownDate, drawdownAmount, searchResponse
// }
```

### `setupAccountNoDrawdown()`

Provisions an account that has opted in but has not drawn down. Used to verify no interest accrues on accounts with zero debt.

## EOD Runner

```javascript
const { PROCS, runEODUntil } = require('./helpers/eodRunner');

// Run DebtHistory + InterestAccrual for a single day
await runEODUntil({
  fromDate: '2026-04-01',
  toDate:   '2026-04-01',
  procs: [PROCS.DEBT_HISTORY, PROCS.INTEREST_ACCRUAL],
});

// Run DebtHistory only for multiple consecutive days
await runEODUntil({
  fromDate: '2026-04-01',
  toDate:   '2026-04-03',
  procs: [PROCS.DEBT_HISTORY],
});
```

Available procs: `PROCS.DEBT_HISTORY`, `PROCS.INTEREST_ACCRUAL`, `PROCS.BILLING_STATEMENT`, `PROCS.MANAGE_OVERDRAFT`.

> `PROCS.ALL` does not include `INTEREST_ACCRUAL` — include it explicitly when needed.

## Cleanup

Test records can be deleted by date to keep the database clean:

```bash
# Preview what will be deleted
npm run cleanup:dry -- --date 2026-04-01

# Delete records from that date onwards
npm run cleanup -- --date 2026-04-01
```

Each test file also calls `db.deleteDebtHistoryByDate(startDate)` in its `afterAll` to clean up automatically after the run.

## Test Report

Reports are generated automatically after each run using `jest-html-reporters`. Open the report in your browser:

```
reports/test-report.html
```

## Notes

- `--runInBand` is required — EOD procs are sequential and tests share database state
- `testTimeout` is set to 120s (some tests with repayment polling use up to 900s per suite)
- Each run generates a unique customer via timestamp-based data in `testData.js`
- Never commit `.env` — it contains DB credentials and API keys
- The `reports/` folder is gitignored — reports are for local viewing only