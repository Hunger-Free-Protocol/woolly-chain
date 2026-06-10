#!/usr/bin/env bash
# verify.sh — executable convention-lint suite for CLAUDE.md §3 hard conventions.
# T3/G6 (docs/tasks/framework-gap-fixes-2026-06-10.md): turns the prompt-enforced
# conventions into greppable gates. Run via `npm run verify` from woolly-chain/.
#
# Exit code: non-zero on any violation (fail-loud, same philosophy as the L3
# manuscript gate per §3.d.2). Manuscript checks degrade to SKIP when the
# manuscript is absent (standalone public clone of woolly-chain).

set -u

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(dirname "$CHAIN_DIR")"
MANUSCRIPT="${MANUSCRIPT_PATH:-$ROOT_DIR/woolly2_paper.tex}"
SELF="scripts/verify.sh"

PASS=0; FAIL=0; SKIP=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  \033[31m✗ FAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
skip() { printf '  ⊘ SKIP %s\n' "$1"; SKIP=$((SKIP+1)); }
section() { printf '\n▸ %s\n' "$1"; }

# lint_absent <rationale> <pattern> <allow-pattern|-> <file...>
# Fails if <pattern> matches any line NOT matching <allow-pattern> ('-' = no allowance).
lint_absent() {
  local rationale="$1" pattern="$2" allow="$3"; shift 3
  local hits
  hits=$(grep -rniE "$pattern" "$@" 2>/dev/null || true)
  if [ -n "$allow" ] && [ "$allow" != "-" ]; then
    hits=$(printf '%s' "$hits" | grep -viE "$allow" || true)
  fi
  if [ -n "$hits" ]; then
    fail "$rationale"
    printf '%s\n' "$hits" | sed 's/^/      /' | head -5
  else
    pass "$rationale"
  fi
}

echo '══════════════════════════════════════════════════'
echo '  WOOLLY — §3 convention-lint suite (npm run verify)'
echo '══════════════════════════════════════════════════'

# ── 1. Secret scan (§3.g / §9: key material never tracked or packaged) ──────
section '1. Secret scan (§3.g/§9 — identity.json, gcp-key.json, .env, key blobs)'

# 1a. Forbidden filenames in tracked files (both repos when present)
for repo in "$CHAIN_DIR" "$ROOT_DIR"; do
  [ -d "$repo/.git" ] || continue
  tracked_secrets=$(git -C "$repo" ls-files | grep -E '(^|/)(identity\.json|gcp-key\.json|\.env)$' || true)
  if [ -n "$tracked_secrets" ]; then
    fail "no secret-named file tracked in $(basename "$repo") — these are always gitignored (§9)"
    printf '%s\n' "$tracked_secrets" | sed 's/^/      /'
  else
    pass "no identity.json / gcp-key.json / .env tracked in $(basename "$repo")"
  fi
done

# 1b. Credential/PEM content in tracked text files.
# Allow-listed: this script and the code-reviewer skill prompt (pattern catalogs, not secrets).
TOKEN_RE='ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
for repo in "$CHAIN_DIR" "$ROOT_DIR"; do
  [ -d "$repo/.git" ] || continue
  blob_hits=$(git -C "$repo" grep -I -l -E "$TOKEN_RE" -- . 2>/dev/null \
    | grep -v -e "$SELF" -e 'paper_orchestra/skills/code_reviewer/v1.md' || true)
  if [ -n "$blob_hits" ]; then
    fail "credential-shaped content in tracked files of $(basename "$repo") (PAT/API-key/PEM patterns per L047)"
    printf '%s\n' "$blob_hits" | sed 's/^/      /'
  else
    pass "no PAT / API-key / PEM-block content tracked in $(basename "$repo")"
  fi
done

# 1c. Archives at project root must not package secrets (H1 regression guard —
# the 2026-06-10 review found a root tarball carrying the farm-node private key).
archive_fail=0; archive_seen=0
for f in "$ROOT_DIR"/*.tar.gz "$ROOT_DIR"/*.tgz; do
  [ -e "$f" ] || continue
  archive_seen=1
  if tar tzf "$f" 2>/dev/null | grep -qE 'identity\.json|gcp-key|\.env$|\.pem$'; then
    fail "archive $(basename "$f") packages secret-named files (H1: delete or rebuild without them)"
    archive_fail=1
  fi
done
for f in "$ROOT_DIR"/*.zip; do
  [ -e "$f" ] || continue
  archive_seen=1
  if command -v unzip >/dev/null && unzip -l "$f" 2>/dev/null | grep -qE 'identity\.json|gcp-key|\.env$|\.pem$'; then
    fail "archive $(basename "$f") packages secret-named files (H1: delete or rebuild without them)"
    archive_fail=1
  fi
done
[ "$archive_fail" -eq 0 ] && { [ "$archive_seen" -eq 1 ] && pass 'root archives carry no secret-named entries' || pass 'no archives at project root (nothing to scan)'; }

# ── 2. Manuscript + sim-source grep gates (§3.a / §3.d / d.1 / d.4 / d.5) ──
section '2. Convention grep gates (manuscript + sim source)'

if [ -f "$MANUSCRIPT" ]; then
  # d.1 — V2 carbon is avoided-emissions LCA; soil-sequestration wording is V1 legacy.
  # Provenance/negation lines ("Replaces V1 soil-sequestration framing", L026) are allowed.
  # (negation contexts allowed: provenance comments, the test that asserts the purge)
  lint_absent 'd.1: no soil-sequestration framing in manuscript or sim source (avoided-emissions LCA is canonical, L026)' \
    'soil[- ]sequestration' 'replac|L026|legacy|instead|purg|assert\(!' "$MANUSCRIPT" "$CHAIN_DIR/src"

  # d.4 — "food pension", never "lifetime subscription" (L042).
  lint_absent 'd.4: no "lifetime subscription" wording (use food pension, L042)' \
    'lifetime[- ]subscription' '-' "$MANUSCRIPT" "$CHAIN_DIR/src"

  # d — four revenue mechanisms; "three mechanism" is V1 legacy (allowed only in version comparisons).
  lint_absent 'd: no "three mechanism" framing outside version comparisons (four mechanisms are canonical)' \
    'three[- ]mechanism' 'V1|version|legacy' "$MANUSCRIPT" "$CHAIN_DIR/src"

  # d — +22.9% V1 uplift only in version comparisons. 22.9% as the YIELD literature
  # anchor (L039) is legitimate; a 22.9 uplift/revenue claim not tied to the +14.6%
  # V2 headline or a V1 comparison is the violation.
  lint_absent 'd: no +22.9% revenue-uplift claim outside version comparisons (V2 headline is +14.6%)' \
    '22\.9.*(uplift|revenue)|((uplift|revenue).*22\.9)' '14\.6|V1|version' "$MANUSCRIPT"

  # d.5 — 5 contribution paths (L045); "three contribution paths" is V1 legacy.
  lint_absent 'd.5: no three-path contribution wording in manuscript (5 paths per L045)' \
    '(three|3)[- ]contribution[- ]path' 'V1|version|legacy|original three' "$MANUSCRIPT"

  # d.6 — title includes "Affordable" (L043).
  if grep -E '\\title\{[^}]*Affordable' "$MANUSCRIPT" >/dev/null; then
    pass 'd.6: manuscript \title contains "Affordable" (L043)'
  else
    fail 'd.6: manuscript \title must contain "Affordable" (L043)'
  fi
else
  skip "manuscript not found at $MANUSCRIPT — manuscript gates skipped (standalone clone?); set MANUSCRIPT_PATH to override"
fi

# §3.a — batch is the unit: batch count must be demand-derived, and cyclesPerYear
# (cycle *timing* only) must never feed a revenue computation.
SIM="$CHAIN_DIR/src/simulation-runner.ts"
if grep -qE 'demand-derived' "$SIM" && grep -qE 'batchesPerYear' "$SIM"; then
  pass 'a: sim derives batch count from demand (batchesPerYear, demand-pull contract)'
else
  fail 'a: sim must derive batch count from demand (batchesPerYear via weekly demand × 52 / batch yield)'
fi
lint_absent 'a: cyclesPerYear is cycle-timing only — never a revenue driver (batch is the unit)' \
  'revenue.*cyclesPerYear|cyclesPerYear.*revenue' '-' "$CHAIN_DIR/src"

# d.5 — ContributionContract supports all 5 paths (capital/land/labor/marketing/innovation).
CONTRIB="$CHAIN_DIR/src/contracts/contribution.ts"
if grep -q "'marketing'" "$CONTRIB" && grep -q "'innovation'" "$CONTRIB"; then
  pass 'd.5: ContributionContract has marketing + innovation paths (5-path model, L045)'
else
  fail 'd.5: ContributionContract missing marketing/innovation path types (L045 5-path model)'
fi

# ── 3. API deploy gates (§3.h) ──────────────────────────────────────────────
section '3. API deploy gates (§3.h — all three must be present in src/api/)'
grep -rq 'express-rate-limit' "$CHAIN_DIR/src/api/" \
  && pass 'h: express-rate-limit present in src/api/' \
  || fail 'h: express-rate-limit missing from src/api/ (third deploy gate)'
grep -rq 'CORS_ORIGIN' "$CHAIN_DIR/src/api/" \
  && pass 'h: CORS_ORIGIN gate present in src/api/' \
  || fail 'h: CORS_ORIGIN gate missing from src/api/'
grep -rq 'WOOLLY_API_KEY' "$CHAIN_DIR/src/api/" \
  && pass 'h: WOOLLY_API_KEY middleware present in src/api/' \
  || fail 'h: WOOLLY_API_KEY middleware missing from src/api/'

# ── 4. L3 reproducibility gate (§3.d.2 / §3.f — fail-loud CSV diff) ────────
section '4. L3 manuscript⇄CSV gate (§3.d.2 — manuscript_csv_diff, fail-loud)'
if (cd "$CHAIN_DIR" && npm run --silent verify:manuscript >/tmp/verify_manuscript_out.txt 2>&1); then
  pass "d.2: manuscript_csv_diff green ($(grep -oE '[0-9]+ checks within tolerance' /tmp/verify_manuscript_out.txt | head -1 || echo 'PASS'))"
else
  fail 'd.2: manuscript_csv_diff reports out-of-tolerance cells — release is blocked (green=false, L027)'
  tail -15 /tmp/verify_manuscript_out.txt | sed 's/^/      /'
fi

# ── 5. Doc freshness (T8/G4 — warnings only, never affects exit code) ──────
section '5. Doc freshness (L003 — advisory, non-failing)'
if [ -f "$ROOT_DIR/scripts/doc_freshness.sh" ]; then
  bash "$ROOT_DIR/scripts/doc_freshness.sh" | sed 's/^/  /'
else
  skip 'scripts/doc_freshness.sh not present (standalone clone) — freshness advisory skipped'
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo
echo '══════════════════════════════════════════════════'
printf '  verify: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
echo '══════════════════════════════════════════════════'
[ "$FAIL" -eq 0 ] || exit 1
