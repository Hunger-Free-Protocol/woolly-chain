#!/bin/bash
#
# Woolly Protocol — One-time public repo setup.
#
# Run this ONCE from /Users/nithun/Documents/Claude/Projects/PaperOrchestra/woolly-chain/
# on your Mac terminal (not from the Claude sandbox).
#
# Prerequisites:
#   1. GitHub Personal Access Token with `repo` + `workflow` scopes
#      (or `public_repo` + `workflow` if the repo will be public)
#   2. `gh` CLI installed: brew install gh
#   3. Authenticate `gh` ONCE with: gh auth login
#      (paste your PAT when prompted — it gets stored in macOS Keychain,
#       NEVER appears in shell history, NEVER pasted into Claude chat)
#
# What this script does:
#   - Removes any stale .git directory left by the Claude sandbox
#   - Initializes a fresh local git repo with main branch
#   - Makes the initial commit with Module 1 four_mechanism_emitter
#   - Creates the public repo on GitHub under your account/org
#   - Pushes the initial commit
#   - Tags v0.1-development
#
# After this runs once, ongoing workflow is just:
#   cd woolly-chain
#   git status                   # see what Claude changed
#   git add -A
#   git commit -m "Module N: ..."
#   git push
#
set -euo pipefail

# Configuration — edit these before running if needed
REPO_OWNER="Hunger-Free-Protocol"   # GitHub organization (locked 2026-05-28)
REPO_NAME="woolly-chain"
REPO_DESCRIPTION="Woolly chain — sovereign blockchain for sustainable food systems. PoN consensus, four-mechanism revenue decomposition, food mining model. COMPAG 2026 submission."
REPO_VISIBILITY="public"            # public | private
INITIAL_TAG="v0.1-development"
DEFAULT_BRANCH="main"

# ── Sanity check: are we in the right directory? ──
if [[ ! -f "package.json" || ! -d "src" || ! -f "src/simulation-runner.ts" ]]; then
  echo "ERROR: This script must be run from the woolly-chain/ directory."
  echo "  cd /Users/nithun/Documents/Claude/Projects/PaperOrchestra/woolly-chain"
  echo "  ./SETUP_REPO.sh"
  exit 1
fi

echo "▸ Cleaning up any stale .git state from the Claude sandbox..."
rm -rf .git

echo "▸ Initializing fresh git repository..."
git init -b "$DEFAULT_BRANCH" -q
git config user.email "nithun@realexi.com"
git config user.name "Nithun"

echo "▸ Staging files (respecting .gitignore)..."
git add -A
echo "  Staged $(git status --short | wc -l | tr -d ' ') files"

echo "▸ Making initial commit..."
git commit -q -m "Initial commit — Woolly Protocol simulation engine v0.1-development

Sovereign-chain blockchain architecture for sustainable food systems:
- Proof-of-Nourishment consensus (manuscript §3.2)
- Multi-agent on-chain auditability (§3.6.2)
- Avoided-emissions life-cycle dMRV (§3.7)
- Seed-to-fork chain of custody (§3.9)
- Effort-based food mining model (§4.8 + Appendix C)
- Four-mechanism revenue decomposition (§4.3)

Module 1 (four_mechanism_emitter) complete. Test suite 52/54 passing
(2 pre-existing failures per L010, separately tracked).

Manuscript: Computers and Electronics in Agriculture (Elsevier)
Submission target: week of 22-28 June 2026"

echo "▸ Checking gh CLI auth state..."
if ! gh auth status >/dev/null 2>&1; then
  echo ""
  echo "  ⚠  gh CLI is not authenticated. Run this first, then re-run SETUP_REPO.sh:"
  echo ""
  echo "    gh auth login"
  echo ""
  echo "  Choose: GitHub.com → HTTPS → Paste an authentication token → paste your PAT"
  echo "  The token gets stored in macOS Keychain, never in shell history."
  echo ""
  exit 1
fi

echo "▸ Creating GitHub repository $REPO_OWNER/$REPO_NAME ($REPO_VISIBILITY)..."
if gh repo view "$REPO_OWNER/$REPO_NAME" >/dev/null 2>&1; then
  echo "  Repository already exists. Configuring remote and pushing."
else
  gh repo create "$REPO_OWNER/$REPO_NAME" \
    --"$REPO_VISIBILITY" \
    --description "$REPO_DESCRIPTION" \
    --homepage "https://woolly.earth"
fi

echo "▸ Configuring remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$REPO_OWNER/$REPO_NAME.git"

echo "▸ Pushing $DEFAULT_BRANCH branch..."
git push -u origin "$DEFAULT_BRANCH"

echo "▸ Tagging $INITIAL_TAG..."
git tag -a "$INITIAL_TAG" -m "Development tag, Week 1 of v0.2 build.

Module 1 (four_mechanism_emitter) complete.
Modules 2-10 to follow in Weeks 2-4.
v0.1-compag-submission tag will be applied at the COMPAG submission point (Week 6)."
git push origin "$INITIAL_TAG"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✓ Repository setup complete"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Repository: https://github.com/$REPO_OWNER/$REPO_NAME"
echo "  Branch:     $DEFAULT_BRANCH"
echo "  Tag:        $INITIAL_TAG"
echo ""
echo "  Going forward, ongoing workflow:"
echo "    cd $(pwd)"
echo "    git status         # see what Claude has changed"
echo "    git add -A"
echo "    git commit -m \"Module N: <description>\""
echo "    git push"
echo ""
echo "  Zenodo DOI: hold off until Week 6 (v0.1-compag-submission tag)"
echo "════════════════════════════════════════════════════════════════"
