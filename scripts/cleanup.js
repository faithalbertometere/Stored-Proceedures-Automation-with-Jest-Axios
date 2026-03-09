#!/usr/bin/env node
/**
 * cleanup.js
 * Deletes test-created EOD records from DebtHistory and Statements tables.
 *
 * Usage:
 *   node scripts/cleanup.js --date 2026-03-04           (delete records on/after this date)
 *   node scripts/cleanup.js --date 2026-03-04 --dry-run (preview only — no deletes)
 *
 * npm shortcuts:
 *   npm run cleanup -- --date 2026-03-04
 *   npm run cleanup:dry -- --date 2026-03-04
 *
 * Tables affected:
 *   OverdraftDebtHistory
 *     → DELETE WHERE CAST(FinancialDate AS DATE) >= @testDate
 *
 *  OverdraftStatements
 *     → DELETE WHERE CAST(BillingCycleEndDate AS DATE) >= @testDate
 */

const sql    = require('mssql');
const config = require('../config');

// ─── Parse args ──────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const dateIdx = args.indexOf('--date');
const dateArg = dateIdx !== -1 ? args[dateIdx + 1] : null;
const dryRun  = args.includes('--dry-run') || args.includes('--dry');

if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  console.error('\n  ✗  Usage: node scripts/cleanup.js --date YYYY-MM-DD [--dry-run]\n');
  process.exit(1);
}

const testDate = new Date(dateArg);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function countAndDelete(pool, { table, column, displayName }) {
  const countRes = await pool.request()
    .input('TestDate', sql.Date, testDate)
    .query(`SELECT COUNT(*) AS N FROM ${table} WHERE CAST(${column} AS DATE) >= @TestDate`);

  const count = countRes.recordset[0].N;

  console.log(`\n  Table : ${displayName}`);
  console.log(`  Filter: ${column} >= ${dateArg}`);
  console.log(`  Count : ${count} record(s)`);

  if (count === 0) { console.log('  → Nothing to delete.'); return 0; }

  // Always show a sample of what will be / would be affected
  const sample = await pool.request()
    .input('TestDate', sql.Date, testDate)
    .query(`
      SELECT TOP 5 AccountNumber, CAST(${column} AS DATE) AS FilterDate
      FROM ${table}
      WHERE CAST(${column} AS DATE) >= @TestDate
      ORDER BY ${column} ASC
    `);
  console.log(`  Sample accounts affected:`);
  sample.recordset.forEach(r => console.log(`    ${r.AccountNumber}  (${column}: ${r.FilterDate})`));
  if (count > 5) console.log(`    ... and ${count - 5} more`);

  if (dryRun) {
    console.log(`  → [DRY RUN] Would delete ${count} record(s). No changes made.`);
    return count;
  }

  const del     = await pool.request()
    .input('TestDate', sql.Date, testDate)
    .query(`DELETE FROM ${table} WHERE CAST(${column} AS DATE) >= @TestDate`);
  const deleted = del.rowsAffected[0];
  console.log(`  → Deleted ${deleted} record(s) ✔`);
  return deleted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const modeLabel = dryRun ? 'DRY RUN — preview only, nothing will be deleted'
                           : 'LIVE — records WILL be permanently deleted';

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║      Smart Overdraft EOD Test — DB Cleanup              ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\n  Date threshold : ${dateArg}`);
  console.log(`  Mode           : ${modeLabel}`);

  if (!dryRun) {
    console.log('\n  ⚠  Tip: run with --dry-run first to preview what will be deleted.');
  }

  const TABLES = [
    {
      table:       config.tables.BalanceHistory,
      column:      'FinancialDate',
      displayName: 'OverdraftDebtHistory',
    },
    {
      table:       config.tables.Statement,
      column:      'BillingCycleEndDate',
      displayName: 'OverdraftStatements',
    },
  ];

  let pool;
  try {
    pool = await sql.connect(config.db);
    console.log('\n  Connected to DB ✔');

    let total = 0;
    for (const t of TABLES) {
      total += await countAndDelete(pool, t);
    }

    console.log('\n  ──────────────────────────────────────────────────────');
    if (dryRun) {
      console.log(`  DRY RUN complete — ${total} record(s) identified, none deleted.`);
      console.log('  Re-run without --dry-run to execute.');
    } else {
      console.log(`  Cleanup complete — ${total} record(s) deleted.`);
      console.log('  EOD procs will run normally at end of day. ✔');
    }
    console.log('');

  } catch (err) {
    console.error('\n  ✗  Cleanup failed:', err.message);
    process.exit(1);
  } finally {
    await sql.close().catch(() => {});
  }
}

main();
