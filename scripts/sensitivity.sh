#!/usr/bin/env bash
# Sensitivity sweep for the V2 revenue-uplift headline (#59).
# Runs the seeded deterministic sim (WOOLLY_SIM_SEED=42) with one parameter
# perturbed across its Doc 3 §12 range at a time (others held central), reading
# the ecosystem-mean four-mechanism uplift (total_uplift) from the emitted CSV.
# Drives figures/fig_sensitivity_tornado.png. Run from the woolly-chain repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
u() { grep '"total_uplift"' simulation-output/four_mechanism_summary.csv | cut -d, -f2; }
run() { env "$@" npm run simulate >/dev/null 2>&1; }

echo "param,value,uplift_pp"
run; echo "baseline,central,$(u)"
run WOOLLY_SENS_BATCH_MULT=0.6;    echo "batch_coordination,low,$(u)"
run WOOLLY_SENS_BATCH_MULT=1.4;    echo "batch_coordination,high,$(u)"
run WOOLLY_SENS_SPOILAGE_MULT=0.7; echo "spoilage_reduction,low,$(u)"
run WOOLLY_SENS_SPOILAGE_MULT=1.3; echo "spoilage_reduction,high,$(u)"
run WOOLLY_SENS_PRICE_REL=0.75;    echo "channel_affordability,low,$(u)"
run WOOLLY_SENS_PRICE_REL=0.90;    echo "channel_affordability,high,$(u)"
run WOOLLY_SENS_CONTRACT_MULT=0.6; echo "contract_pricing,low,$(u)"
run WOOLLY_SENS_CONTRACT_MULT=1.4; echo "contract_pricing,high,$(u)"
run WOOLLY_SENS_QC_COMMISSION=0.22; echo "qcommerce_commission,low,$(u)"
run WOOLLY_SENS_QC_COMMISSION=0.30; echo "qcommerce_commission,high,$(u)"
run; echo "restore,central,$(u)"
