# Woolly Protocol Simulation Engine

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Status: pre-COMPAG submission](https://img.shields.io/badge/Status-pre--submission-orange)]()

Reference simulation engine for the **Woolly Protocol** — a sovereign-chain blockchain architecture for sustainable food systems with novel Proof-of-Nourishment consensus, multi-agent on-chain auditability, avoided-emissions life-cycle dMRV, seed-to-fork chain of custody, and an effort-based food mining economic model.

This repository accompanies the manuscript submitted to *Computers and Electronics in Agriculture* (Elsevier) — submission scheduled for week of 22–28 June 2026.

## What this simulation produces

Running `npm run simulate` regenerates the manuscript's headline tables from first principles. Outputs are committed to `simulation-output/` and include:

- Per-cycle telemetry across 10 simulated farms × 6 crop cycles × 3 crop types (60 total cycles)
- Four-mechanism revenue decomposition (channel substitution, spoilage reduction, contract pricing optimization, batch coordination)
- Per-farm summary statistics
- Crop-type aggregates
- PoN consensus scores and validator authority weights
- dMRV accuracy and verification cost
- Scale projections to 50,000-farm ecosystem maturity

## Reproducing the manuscript results

From a clean clone:

```bash
npm install
npm run simulate
```

This produces 10 CSV files in `simulation-output/`. The headline figures from the manuscript (water reduction, nutrient cost savings, yield improvement, dMRV verification accuracy) are calibrated within published CEA hydroponic literature ranges and emerge in the simulation outputs within ±2pp of cited literature targets per lesson L011.

To run the integration test suite (52 assertions across consensus, tokens, contracts, food access, and the four-mechanism revenue decomposition):

```bash
npm test
```

## Repository structure

```
woolly-chain/
├── src/
│   ├── core/                # Chain, state, types, crypto, block
│   ├── consensus/           # PoN BFT, validator selection, epoch management, scoring
│   ├── tokens/              # WOOLLY, FARM-{id}, Crop-Cycle Yield, IP-NFT, WOOLLY-CARBON
│   ├── contracts/           # Build, Crop Cycle, Profit Sharing, Contribution
│   ├── api/                 # Express REST API (chain queries, transaction submission)
│   ├── node/                # Block producer
│   ├── simulation-runner.ts # Manuscript-table-generating simulation
│   └── test.ts              # Integration test suite
├── farm-node/               # Raspberry Pi sensor node (ECDSA identity, separate package)
├── website/                 # Static landing site + nginx config
├── simulation-output/       # Generated CSVs (gitignored from check-in, regenerable)
└── docs/                    # Methodology, parameter provenance
```

## Manuscript correspondence

| Manuscript artifact | Source in this repo |
|---|---|
| §3.2 PoN consensus formula (W = 0.25P + 0.40S + 0.35C) | `src/consensus/scoring.ts` |
| §3.6.2 multi-agent on-chain auditability | `src/api/routes.ts` (telemetry commit endpoints) |
| §3.7 avoided-emissions dMRV | `src/simulation-runner.ts` (dMRV computation; v0.2: separate LCA module) |
| §3.8 token model | `src/tokens/*.ts` |
| §3.9 seed-to-fork provenance | v0.2 — under construction |
| §4.1 Table 1 agent vs human baseline | `simulation-output/crop_type_summary.csv` |
| §4.3 Table 9 four-mechanism revenue decomposition | `simulation-output/raw_cycle_data.csv` (columns 33–37) |
| §4.4 Table 4 DePIN cross-validation | `simulation-output/pon_scores.csv` |
| §4.6 Table 6 dMRV accuracy by verification stage | `simulation-output/dmrv_accuracy.csv` |

## Versioning

| Tag | Purpose | Status |
|---|---|---|
| `v0.1-development` | Development working tag, Week 1 of v0.2 build | Current |
| `v0.1-compag-submission` | Frozen release accompanying COMPAG submission | Reserved — assigned at submission |
| `v0.2-multi-agent` | Multi-agent decision-making + production-grade ECDSA chain core | Roadmap |

## Calibration parameters

All simulation parameters are sourced from peer-reviewed literature or public industry data. See `docs/parameter_provenance.md` for the full mapping. Notable parameters:

- Water/nutrient/yield improvement targets (27.7% / 24.4% / 22.9%) calibrated within published CEA hydroponic ranges (Sharma et al. 2018; Resh 2022; Engler & Krarti 2021)
- Avoided-emissions factors from IPCC (2019, 2021), DEFRA (2023), CEA India (2024)
- Q-commerce platform commissions (22–30%) from Indian platform terms-of-service and Inc42 (2024) market reports
- Demand-model parameters (60% contracted + 40% pooled, Gaussian σ=0.15, ±20% seasonal sine, salad peak week 18) from Doc 2 of the manuscript supporting documents

## Citation

If you use this software, please cite both the manuscript and the software:

```bibtex
@software{woolly_protocol_sim_2026,
  author = {Nithun},
  title = {{Woolly Protocol Simulation Engine}},
  version = {0.1},
  date = {2026-06-XX},
  url = {https://github.com/Hunger-Free-Protocol/woolly-chain},
  doi = {10.5281/zenodo.XXXXXXX}
}

@article{woolly_protocol_2026,
  author = {Nithun},
  title = {{Woolly Protocol: A Proof-of-Nourishment Blockchain Architecture for Autonomous, Verifiable, Affordable, and Sustainable Food Systems}},
  journal = {Computers and Electronics in Agriculture},
  year = {2026},
  status = {in review}
}
```

## Acknowledgments

This work was developed by Woolly Farms, Bengaluru, India. The simulation calibration draws on six years of operational research data (2016–2022) from an 80,000 sq ft controlled-environment agriculture hydroponic facility. Hardware integration was developed in collaboration with **uFarms** (Richard) — see manuscript §3.4 for the Pi + HAT + RS485 hybrid sensor node architecture.

## License

Apache 2.0 — see `LICENSE`.

This license grants permission to use, modify, and distribute the code, with an explicit patent grant. Selected for the protocol's institutional positioning and potential commercialization pathway.

## Contact

Nithun — nithun@realexi.com — [Woolly Farms](https://woolly.earth)
