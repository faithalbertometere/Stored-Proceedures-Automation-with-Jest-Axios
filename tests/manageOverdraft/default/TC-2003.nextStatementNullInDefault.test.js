/**
 * CREDIT-TC-2003
 * Verify next statement day is null for account in default
 * Boundary: dpd90Date
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2003 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_defaultAccount');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-2003 — NextStatementDate Null in Default', () => {

  test('DB: NextStatementDate is null at dpd90Date', () => {
    expect(ctx.stateAtDPD90.dbRecord.NextStatementDate).toBeNull();
  });

  test('API: newStatementDay is null for defaulted account', () => {
    expect(ctx.stateAtDPD90.searchResponse.newStatementDay).toBeNull();
  });

  test('DB: NextStatementDate was set at dpd89Date (before default)', () => {
    // Confirms the field was populated before default, then cleared on default
    expect(ctx.stateAtDPD89.dbRecord.NextStatementDate).not.toBeNull();
  });

  afterAll(() => {
    console.log(`\n  TC-2003 | dpd89 NextStmt: ${ctx?.stateAtDPD89?.dbRecord?.NextStatementDate} | dpd90 NextStmt: ${ctx?.stateAtDPD90?.dbRecord?.NextStatementDate}\n`);
  });
});
