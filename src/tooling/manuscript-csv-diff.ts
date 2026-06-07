/**
 * Woolly Chain — Manuscript ⇄ CSV reconciliation gate (Layer 3 release gate)
 *
 * Module 13 (csv_to_table_aligner): resolves a manuscript paper-table header to
 *   its CSV column name via the L036 synonym dictionary
 *   (paper_orchestra/skills/csv_header_mapper/woolly_synonyms.json). Fail-loud:
 *   an unmapped header throws rather than silently guessing.
 *
 * Module 14 (manuscript_csv_diff): a fail-loud byte/tolerance gate (L024, L027).
 *   Each manifest entry asserts a number cited in woolly2_paper.tex against the
 *   corresponding cell/aggregate of a regenerated simulation-output CSV. Any
 *   out-of-tolerance cell exits non-zero so the Releaser sets green=false
 *   (L027 — no "ship anyway" without a journaled, user-approved exception).
 *
 * Tolerance policy: ±2.0 pp for headline efficiency / dMRV figures (L011);
 *   ±2.5 pp for the four-mechanism revenue decomposition (manuscript-stated band).
 *
 * Run after `npm run simulate`:  npm run verify:manuscript
 *
 * The manifest below is the maintained contract: any new manuscript table cell
 * gets an entry here (and any new paper header gets a synonym-dict entry) before
 * this gate can pass. It is intentionally explicit rather than auto-parsed from
 * LaTeX, so each checked claim is auditable.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'simulation-output');
const SYNONYMS_PATH = path.resolve(
  __dirname, '..', '..', '..',
  'paper_orchestra', 'skills', 'csv_header_mapper', 'woolly_synonyms.json'
);

// ─────────────────────────────────────────────────────────────────────────
// Module 13 — csv_to_table_aligner
// ─────────────────────────────────────────────────────────────────────────
interface SynonymTable {
  csv_source: string;
  header_map: Record<string, string>;
  [k: string]: unknown;
}

let synonyms: Record<string, SynonymTable> | null = null;

function loadSynonyms(): Record<string, SynonymTable> {
  if (synonyms) return synonyms;
  if (!fs.existsSync(SYNONYMS_PATH)) {
    throw new Error(`[aligner] synonym dictionary not found at ${SYNONYMS_PATH} (L036)`);
  }
  synonyms = JSON.parse(fs.readFileSync(SYNONYMS_PATH, 'utf-8')) as Record<string, SynonymTable>;
  return synonyms;
}

/** Resolve a manuscript paper-table header → CSV column name (fail-loud, L036). */
export function csvToTableAligner(tableKey: string, paperHeader: string): string {
  const dict = loadSynonyms();
  const table = dict[tableKey];
  if (!table) {
    throw new Error(`[aligner] no synonym entry for table "${tableKey}" (L036)`);
  }
  const col = table.header_map[paperHeader];
  if (!col) {
    throw new Error(
      `[aligner] header "${paperHeader}" not mapped for table "${tableKey}". ` +
      `Add it to woolly_synonyms.json before the diff gate can pass (L036).`
    );
  }
  return col;
}

// ─────────────────────────────────────────────────────────────────────────
// Minimal CSV reader (handles double-quoted fields)
// ─────────────────────────────────────────────────────────────────────────
interface Csv { headers: string[]; rows: Record<string, string>[]; }

function unquote(s: string): string {
  const t = s.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function readCsv(file: string): Csv {
  const p = path.join(OUTPUT_DIR, file);
  if (!fs.existsSync(p)) {
    throw new Error(`[diff] CSV not found: ${file} — run \`npm run simulate\` first (L024)`);
  }
  const lines = fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim().length > 0);
  const headers = lines[0].split(',').map(unquote);
  const rows = lines.slice(1).map(line => {
    const cells = line.split(',').map(unquote);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = cells[i]; });
    return rec;
  });
  return { headers, rows };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

// ─────────────────────────────────────────────────────────────────────────
// Module 14 — manuscript_csv_diff manifest
// ─────────────────────────────────────────────────────────────────────────
type Aggregate =
  | { kind: 'rowValue'; matchCol: string; matchVal: string; col: string; scale?: number }
  | { kind: 'mean'; col: string; scale?: number }
  | { kind: 'meanAcrossSynonym'; tableKey: string; paperHeader: string; scale?: number };

interface Check {
  label: string;
  csv: string;
  manuscript: number;   // value as written in woolly2_paper.tex
  tolerancePp: number;
  agg: Aggregate;
}

const MANIFEST: Check[] = [
  // ── §4.3 Table 9 four-mechanism decomposition (±2.5pp band) ──
  // Seeded sim (WOOLLY_SIM_SEED=42) → deterministic CSV; manuscript values match exactly.
  { label: '§4.3 channel substitution', csv: 'four_mechanism_summary.csv', manuscript: 1.13, tolerancePp: 0.5,
    agg: { kind: 'rowValue', matchCol: 'mechanism', matchVal: 'channel_substitution', col: 'mean_contribution_pp' } },
  { label: '§4.3 spoilage reduction', csv: 'four_mechanism_summary.csv', manuscript: 8.44, tolerancePp: 0.5,
    agg: { kind: 'rowValue', matchCol: 'mechanism', matchVal: 'spoilage_reduction', col: 'mean_contribution_pp' } },
  { label: '§4.3 contract pricing', csv: 'four_mechanism_summary.csv', manuscript: 2.25, tolerancePp: 0.5,
    agg: { kind: 'rowValue', matchCol: 'mechanism', matchVal: 'contract_pricing', col: 'mean_contribution_pp' } },
  { label: '§4.3 batch coordination', csv: 'four_mechanism_summary.csv', manuscript: 4.51, tolerancePp: 0.5,
    agg: { kind: 'rowValue', matchCol: 'mechanism', matchVal: 'batch_coordination', col: 'mean_contribution_pp' } },
  { label: '§4.3 total uplift (eco mean 16.33)', csv: 'four_mechanism_summary.csv', manuscript: 16.33, tolerancePp: 0.5,
    agg: { kind: 'rowValue', matchCol: 'mechanism', matchVal: 'total_uplift', col: 'mean_contribution_pp' } },

  // ── §4.1 crop-cycle efficiency: sim values cited in parentheses (±2pp, L011) ──
  // Column resolved via the M13 aligner from the manuscript paper header.
  { label: '§4.1 water reduction (sim 26.4)', csv: 'crop_type_summary.csv', manuscript: 26.4, tolerancePp: 2.0,
    agg: { kind: 'meanAcrossSynonym', tableKey: 'table1', paperHeader: 'Water reduction %' } },
  { label: '§4.1 nutrient reduction (sim 23.3)', csv: 'crop_type_summary.csv', manuscript: 23.3, tolerancePp: 2.0,
    agg: { kind: 'meanAcrossSynonym', tableKey: 'table1', paperHeader: 'Nutrient reduction %' } },
  { label: '§4.1 yield increase (sim 21.7)', csv: 'crop_type_summary.csv', manuscript: 21.7, tolerancePp: 2.0,
    agg: { kind: 'meanAcrossSynonym', tableKey: 'table1', paperHeader: 'Yield increase %' } },

  // ── §4.6 dMRV accuracy 97.1% (±2pp) ──
  { label: '§4.6 dMRV accuracy (97.1)', csv: 'dmrv_accuracy.csv', manuscript: 97.1, tolerancePp: 2.0,
    agg: { kind: 'mean', col: 'dmrv_accuracy', scale: 100 } },

  // ── §4.6 cross-validation @ 5 nodes/km² = 95.4% (±2pp) ──
  { label: '§4.6 cross-val @5 nodes (95.4)', csv: 'cross_validation_summary.csv', manuscript: 95.4, tolerancePp: 2.0,
    agg: { kind: 'rowValue', matchCol: 'node_density_per_km2', matchVal: '5', col: 'cross_validation_accuracy_pct' } },

  // ── §4.2 authority ablation: DECLARED design-target values (authority-level
  // behavior is not yet modeled in the sim — see §4.2 caption + Doc 5 §4.2).
  // Gated exact-match (tol 0.05) so the declared CSV cannot silently drift from
  // manuscript Table 2 — closes the gap where the gate previously exempted this
  // table entirely (code-review BLOCKER, L024/L027). v0.2 replaces with a real
  // authority_ablation_emitter. ──
  { label: '§4.2 authority: full-autonomy water (declared 23.1)', csv: 'authority_ablation_summary.csv', manuscript: 23.1, tolerancePp: 0.05,
    agg: { kind: 'rowValue', matchCol: 'authority_level', matchVal: 'full_autonomy', col: 'water_saved_pct' } },
  { label: '§4.2 authority: HITL>$50 water (declared 22.4)', csv: 'authority_ablation_summary.csv', manuscript: 22.4, tolerancePp: 0.05,
    agg: { kind: 'rowValue', matchCol: 'authority_level', matchVal: 'hitl_gt_50usd', col: 'water_saved_pct' } },
  { label: '§4.2 authority: advisory-only water (declared 8.2)', csv: 'authority_ablation_summary.csv', manuscript: 8.2, tolerancePp: 0.05,
    agg: { kind: 'rowValue', matchCol: 'authority_level', matchVal: 'advisory_only', col: 'water_saved_pct' } },
];

// Calibration-band claims (L039/L011): the literature anchor must sit within
// tolerance of the SIMULATION value the manuscript reports. The sim side is read
// LIVE from the CSV via evaluate() (not a source literal) — otherwise this would
// be a tautology that always passes regardless of sim output (code-review P1).
const CALIBRATION: { label: string; anchor: number; tolerancePp: number; csv: string; agg: Aggregate }[] = [
  { label: 'water 27.7 lit ↔ sim', anchor: 27.7, tolerancePp: 2.0, csv: 'crop_type_summary.csv',
    agg: { kind: 'meanAcrossSynonym', tableKey: 'table1', paperHeader: 'Water reduction %' } },
  { label: 'nutrient 24.4 lit ↔ sim', anchor: 24.4, tolerancePp: 2.0, csv: 'crop_type_summary.csv',
    agg: { kind: 'meanAcrossSynonym', tableKey: 'table1', paperHeader: 'Nutrient reduction %' } },
  { label: 'yield 22.9 lit ↔ sim', anchor: 22.9, tolerancePp: 2.0, csv: 'crop_type_summary.csv',
    agg: { kind: 'meanAcrossSynonym', tableKey: 'table1', paperHeader: 'Yield increase %' } },
  { label: 'uplift 14.6 headline ↔ eco-mean', anchor: 14.6, tolerancePp: 2.5, csv: 'four_mechanism_summary.csv',
    agg: { kind: 'rowValue', matchCol: 'mechanism', matchVal: 'total_uplift', col: 'mean_contribution_pp' } },
];

// ─────────────────────────────────────────────────────────────────────────
// Evaluate
// ─────────────────────────────────────────────────────────────────────────
function evaluate(check: Check): number {
  const csv = readCsv(check.csv);
  const a = check.agg;
  if (a.kind === 'rowValue') {
    const row = csv.rows.find(r => r[a.matchCol] === a.matchVal);
    if (!row) throw new Error(`[diff] ${check.csv}: no row where ${a.matchCol}=${a.matchVal}`);
    return parseFloat(row[a.col]) * (a.scale ?? 1);
  }
  if (a.kind === 'mean') {
    return mean(csv.rows.map(r => parseFloat(r[a.col]))) * (a.scale ?? 1);
  }
  // meanAcrossSynonym: resolve the column via the M13 aligner, then mean it
  const col = csvToTableAligner(a.tableKey, a.paperHeader);
  return mean(csv.rows.map(r => parseFloat(r[col]))) * (a.scale ?? 1);
}

function main(): void {
  const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', RST = '\x1b[0m';
  console.log('▸ manuscript_csv_diff — Layer 3 reproducibility gate (L024/L027)\n');

  const failures: string[] = [];

  for (const c of MANIFEST) {
    let actual: number;
    try {
      actual = evaluate(c);
    } catch (err: any) {
      failures.push(`${c.label}: ${err.message}`);
      console.log(`  ${RED}✗${RST} ${c.label} — ${err.message}`);
      continue;
    }
    const delta = Math.abs(actual - c.manuscript);
    const ok = delta <= c.tolerancePp + 1e-9;
    const line = `${c.label}: manuscript ${c.manuscript} vs CSV ${actual.toFixed(2)} ` +
      `(Δ${delta.toFixed(2)} ≤ ${c.tolerancePp})`;
    if (ok) {
      console.log(`  ${GREEN}✓${RST} ${line}`);
    } else {
      failures.push(line);
      console.log(`  ${RED}✗${RST} ${line}`);
    }
  }

  console.log(`\n  ${DIM}Calibration-band claims (literature anchor ↔ CSV-derived sim, L039/L011):${RST}`);
  for (const cb of CALIBRATION) {
    let sim: number;
    try {
      sim = evaluate({ label: cb.label, csv: cb.csv, manuscript: cb.anchor, tolerancePp: cb.tolerancePp, agg: cb.agg });
    } catch (err: any) {
      failures.push(`${cb.label}: ${err.message}`);
      console.log(`  ${RED}✗${RST} ${cb.label} — ${err.message}`);
      continue;
    }
    const delta = Math.abs(cb.anchor - sim);
    const ok = delta <= cb.tolerancePp + 1e-9;
    const line = `${cb.label}: anchor ${cb.anchor} ↔ CSV-sim ${sim.toFixed(2)} (Δ${delta.toFixed(2)} ≤ ${cb.tolerancePp})`;
    if (ok) {
      console.log(`  ${GREEN}✓${RST} ${line}`);
    } else {
      failures.push(line);
      console.log(`  ${RED}✗${RST} ${line}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════');
  if (failures.length === 0) {
    console.log(`  ${GREEN}PASS${RST} — ${MANIFEST.length + CALIBRATION.length} checks within tolerance. green=true`);
    console.log('══════════════════════════════════════════════════');
    process.exit(0);
  } else {
    console.log(`  ${RED}FAIL${RST} — ${failures.length} out-of-tolerance cell(s). green=false (L027)`);
    console.log('  Manuscript and CSVs have drifted. Fix the manuscript to match the');
    console.log('  CSVs (not the other way around) or correct the emitter, then re-run.');
    console.log('══════════════════════════════════════════════════');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
