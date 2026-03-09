/**
 * CREDIT-TC-2002
 * Verify accountstatus is DebtDisabledDefault (8) when DPD >= 90
 * Boundary: dpd89Date (status=7) → dpd90Date (status=8)
 *
 * Run: npx jest tests/manageOverdraft/default/TC-2002 --runInBand
 */
const db = require('../../../helpers/dbHelper');
const { getAccount } = require('./_defaultAccount');
const { assertStatus, assertAccountDefault, STATUS } = require('../_manageSetup');

let ctx;
beforeAll(async () => { ctx = await getAccount(); }, 900_000);
afterAll(async ()  => { await db.disconnect(); });

describe('CREDIT-TC-2002 — Status = DebtDisabledDefault at DPD=90', () => {

  describe('Boundary: dpd89Date — status still DebtDisabled (DPD=89)', () => {
    assertStatus(() => ctx.stateAtDPD89, STATUS.DEBT_DISABLED, 'DebtDisabled (not yet Default)');
  });

  describe('Boundary: dpd90Date — status transitions to DebtDisabledDefault (DPD=90)', () => {
    assertStatus(() => ctx.stateAtDPD90, STATUS.DEBT_DISABLED_DEFAULT, 'DebtDisabledDefault (status=8)');
    assertAccountDefault(() => ctx.stateAtDPD90);
  });

  afterAll(() => {
    console.log('\n══════════════════════════════════════════');
    console.log('  CREDIT-TC-2002 — Boundary Summary');
    console.log('══════════════════════════════════════════');
    console.log(`  dpd89Date: status=${ctx?.stateAtDPD89?.searchResponse?.status}`);
    console.log(`  dpd90Date: status=${ctx?.stateAtDPD90?.searchResponse?.status}`);
    console.log('══════════════════════════════════════════\n');
  });
});
