#!/usr/bin/env python3
"""
Generate the four manuscript figures from Woolly simulation CSVs.

All data is the calibrated simulation output (woolly-chain/simulation-output/*.csv),
which embeds the published-literature anchors documented in literature_baselines.csv
(Barbosa 2015, Massa 2020, Kozai 2019, FAO 2022, etc.). No ad-hoc external data —
the figures are reproducible from `npm run simulate` output, consistent with the
manuscript's calibration framing (L039).

Run: python3 scripts/make_figures.py
"""
import csv, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

SIM = os.path.join(os.path.dirname(__file__), "..", "simulation-output")
OUT = os.path.join(os.path.dirname(__file__), "..", "figures")
os.makedirs(OUT, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

GREEN, GRAY, BLUE, ORANGE, RED = "#2e7d32", "#9e9e9e", "#1565c0", "#ef6c00", "#c62828"
plt.rcParams.update({"font.size": 11, "axes.spptype" if False else "axes.titlesize": 13,
                     "figure.dpi": 150, "savefig.bbox": "tight"})

def rows(name):
    with open(os.path.join(SIM, name)) as f:
        return list(csv.DictReader(f))

def uq(s): return s.strip().strip('"')

# ── Figure 1: Crop-cycle efficiency vs literature anchors ──────────────────
def fig_efficiency():
    data = rows("crop_type_summary.csv")
    crops = [uq(r["crop_type"]) for r in data]
    water = [float(r["avg_water_reduction_pct"]) for r in data]
    nutr  = [float(r["avg_nutrient_reduction_pct"]) for r in data]
    yld   = [float(r["avg_yield_increase_pct"]) for r in data]
    metrics = ["Water\nreduction", "Nutrient\nreduction", "Yield\nincrease"]
    anchors = [27.7, 24.4, 22.9]   # literature anchors (manuscript §4.1)
    sim_means = [np.mean(water), np.mean(nutr), np.mean(yld)]
    percrop = list(zip(water, nutr, yld))

    x = np.arange(len(metrics)); w = 0.22
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    colors = [GREEN, BLUE, ORANGE]
    for i, crop in enumerate(crops):
        ax.bar(x + (i-1)*w, percrop[i], w, label=crop, color=colors[i % 3], alpha=0.85)
    for j, a in enumerate(anchors):
        ax.hlines(a, x[j]-0.4, x[j]+0.4, color=RED, ls="--", lw=1.8,
                  label="Literature anchor" if j == 0 else None)
        ax.text(x[j], a+0.5, f"{a}%", ha="center", color=RED, fontsize=9)
    ax.set_xticks(x); ax.set_xticklabels(metrics)
    ax.set_ylabel("Improvement vs conventional (%)")
    ax.set_title("Crop-cycle efficiency: agent-managed sim vs literature anchors")
    ax.legend(ncol=2, fontsize=9, loc="upper right")
    ax.set_ylim(0, 33); ax.grid(axis="y", alpha=0.3)
    fig.text(0.01, -0.02, "Bars: per-crop simulation means (60 cycles). Dashed: literature anchors "
             "(Barbosa 2015; Massa 2020; Kozai 2019).", fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_efficiency.png")); plt.close(fig)
    print("wrote fig_efficiency.png")

# ── Figure 2: Authority-boundary frontier ──────────────────────────────────
def fig_authority():
    data = rows("authority_ablation_summary.csv")
    labels = {"full_autonomy": "Full\nautonomy", "hitl_gt_50usd": "HITL > $50",
              "hitl_gt_10usd": "HITL > $10", "advisory_only": "Advisory\nonly"}
    order = ["full_autonomy", "hitl_gt_50usd", "hitl_gt_10usd", "advisory_only"]
    d = {uq(r["authority_level"]): r for r in data}
    water = [float(d[k]["water_saved_pct"]) for k in order]
    cata  = [float(d[k]["catastrophic_events"]) for k in order]
    names = [labels[k] for k in order]
    x = np.arange(len(order))
    fig, ax1 = plt.subplots(figsize=(7.2, 4.2))
    bars = ax1.bar(x, water, 0.55, color=[GREEN if k=="hitl_gt_50usd" else GRAY for k in order],
                   alpha=0.9)
    ax1.set_ylabel("Water saved (%)"); ax1.set_ylim(0, 27)
    ax1.set_xticks(x); ax1.set_xticklabels(names)
    ax2 = ax1.twinx()
    ax2.plot(x, cata, "o-", color=RED, lw=2, label="Catastrophic events")
    ax2.set_ylabel("Catastrophic events", color=RED); ax2.set_ylim(-0.3, 4)
    ax2.tick_params(axis="y", labelcolor=RED)
    ax1.annotate("Recommended\n(96.7% of gains,\n0 failures)", xy=(1, water[1]),
                 xytext=(1.5, 24), fontsize=8.5, color=GREEN,
                 arrowprops=dict(arrowstyle="->", color=GREEN))
    ax1.set_title("Authority-boundary frontier (declared design target, §4.2)")
    ax2.legend(loc="upper right", fontsize=9)
    fig.text(0.01, -0.02, "Declared design-target values (authority-level agent-rollback modeling "
             "deferred to v0.2).", fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_authority.png")); plt.close(fig)
    print("wrote fig_authority.png")

# ── Figure 3: Per-cycle on-chain vs manual cost (log scale) ────────────────
def fig_cost():
    data = rows("cost_comparison.csv")
    manual = np.mean([float(r["manual_accounting_usd"]) for r in data])
    onchain = np.mean([float(r["onchain_cost_usd"]) for r in data])
    fig, ax = plt.subplots(figsize=(6.0, 4.2))
    bars = ax.bar(["Manual\naccounting", "On-chain\n(Base L2)"], [manual, onchain],
                  color=[GRAY, GREEN], width=0.55)
    ax.set_yscale("log"); ax.set_ylabel("Cost per cycle (USD, log scale)")
    for b, v in zip(bars, [manual, onchain]):
        ax.text(b.get_x()+b.get_width()/2, v*1.15, f"${v:,.2f}", ha="center", fontsize=10)
    ax.set_title(f"Per-cycle cost: {manual/onchain:,.0f}× reduction on-chain")
    ax.grid(axis="y", which="both", alpha=0.3)
    fig.text(0.01, -0.02, "Simulation means across 60 cycles. Manual baseline: FAO 2022 cost survey.",
             fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_cost_comparison.png")); plt.close(fig)
    print("wrote fig_cost_comparison.png")

# ── Figure 4: Ecosystem-scale projection ───────────────────────────────────
def fig_tokenomics():
    data = rows("scale_projection.csv")
    farms = [float(r["num_farms"]) for r in data]
    fed = [float(r["estimated_people_fed_annually"]) for r in data]
    water = [float(r["estimated_water_saved_ML_per_year"]) for r in data]
    yld = [float(r["estimated_annual_yield_tons"]) for r in data]
    order = np.argsort(farms); farms = np.array(farms)[order]
    fed = np.array(fed)[order]; water = np.array(water)[order]; yld = np.array(yld)[order]
    fig, ax1 = plt.subplots(figsize=(7.2, 4.2))
    ax1.plot(farms, fed, "o-", color=GREEN, lw=2, label="People fed / yr")
    ax1.set_xlabel("Active farms"); ax1.set_ylabel("People fed annually", color=GREEN)
    ax1.tick_params(axis="y", labelcolor=GREEN); ax1.set_xscale("log")
    ax2 = ax1.twinx()
    ax2.plot(farms, yld, "s--", color=BLUE, lw=1.8, label="Yield (tons/yr)")
    ax2.set_ylabel("Annual yield (tons)", color=BLUE); ax2.tick_params(axis="y", labelcolor=BLUE)
    lines = ax1.get_lines() + ax2.get_lines()
    ax1.legend(lines, [l.get_label() for l in lines], loc="upper left", fontsize=9)
    ax1.set_title("Ecosystem-scale projection (demand-pulled batch economics)")
    ax1.grid(alpha=0.3)
    fig.text(0.01, -0.02, "Headline scale projection (v1 fixed cycles/farm assumption; full "
             "demand-pull propagation is a v0.2 refinement).", fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_tokenomics.png")); plt.close(fig)
    print("wrote fig_tokenomics.png")

# ── Figure 5: Four-mechanism revenue decomposition (§4.3) ──────────────────
def fig_four_mechanism():
    data = {uq(r["mechanism"]): float(r["mean_contribution_pp"]) for r in rows("four_mechanism_summary.csv")}
    order = ["channel_substitution", "contract_pricing", "batch_coordination", "spoilage_reduction"]
    labels = {"channel_substitution": "Channel\nsubstitution", "contract_pricing": "Contract\npricing",
              "batch_coordination": "Batch\ncoordination", "spoilage_reduction": "Spoilage\nreduction"}
    vals = [data[k] for k in order]
    total = data.get("total_uplift", sum(vals))
    colors = [GRAY, BLUE, ORANGE, GREEN]
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    bars = ax.barh([labels[k] for k in order], vals, color=colors)
    for b, v in zip(bars, vals):
        ax.text(v+0.15, b.get_y()+b.get_height()/2, f"{v:.2f} pp", va="center", fontsize=9)
    ax.axvline(14.6, color=RED, ls="--", lw=1.8)
    ax.text(14.6, -0.6, "+14.6% headline\n(lit.-anchored)", color=RED, fontsize=8.5, ha="center")
    ax.set_xlabel("Contribution to revenue uplift (percentage points)")
    ax.set_title(f"Four-mechanism revenue decomposition (eco-mean {total:.2f} pp)")
    ax.set_xlim(0, 17); ax.grid(axis="x", alpha=0.3)
    fig.text(0.01, -0.02, "Simulation aggregate (four_mechanism_summary.csv). Spoilage + batch "
             "coordination dominate.", fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_four_mechanism.png")); plt.close(fig)
    print("wrote fig_four_mechanism.png")

# ── Figure 6: dMRV cross-validation accuracy vs node density (§4.6) ─────────
def fig_dmrv_curve():
    data = sorted(rows("cross_validation_summary.csv"), key=lambda r: float(r["node_density_per_km2"]))
    dens = [float(r["node_density_per_km2"]) for r in data]
    acc  = [float(r["cross_validation_accuracy_pct"]) for r in data]
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    ax.plot(dens, acc, "o-", color=GREEN, lw=2.2, markersize=7)
    for x, y in zip(dens, acc):
        ax.annotate(f"{y:.1f}%", (x, y), textcoords="offset points", xytext=(0, 9), fontsize=9, ha="center")
    # highlight the 5-node steady-state target
    i5 = dens.index(5.0)
    ax.scatter([5], [acc[i5]], s=180, facecolors="none", edgecolors=RED, lw=2, zorder=5)
    ax.annotate("Steady-state\ntarget (5/km²)", (5, acc[i5]), xytext=(5.6, 88), fontsize=8.5,
                color=RED, arrowprops=dict(arrowstyle="->", color=RED))
    ax.axhline(95, color=GRAY, ls=":", lw=1.2); ax.text(1, 95.6, "95% insurance-grade", fontsize=8, color="#555")
    ax.set_xlabel("Node density (nodes per km²)"); ax.set_ylabel("Cross-validation accuracy (%)")
    ax.set_title("dMRV cross-validation accuracy vs DePIN node density")
    ax.set_xticks(dens); ax.set_ylim(68, 102); ax.grid(alpha=0.3)
    fig.text(0.01, -0.02, "Simulation (cross_validation_summary.csv). Protocol targets 5 nodes/km² "
             "for urban Indian CEA clusters.", fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_dmrv_curve.png")); plt.close(fig)
    print("wrote fig_dmrv_curve.png")

# ── Figure 7: Seed-to-fork provenance flow (§3.9) ──────────────────────────
# Canonical source is figures/fig_seed_to_fork_flow.mmd (Mermaid). This is a
# faithful matplotlib rendering for the LaTeX PDF (Mermaid cannot be rendered in
# this sandbox: Chromium is firewalled). Regenerate from the .mmd with a Mermaid
# renderer (GitHub / mermaid.live / mmdc) when available — the .mmd is authoritative.
def fig_seed_to_fork():
    from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
    fig, ax = plt.subplots(figsize=(9.2, 3.6)); ax.axis("off")
    ax.set_xlim(0, 10); ax.set_ylim(0, 4)
    def box(x, y, w, h, text, fc, ec):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08",
                                    fc=fc, ec=ec, lw=1.6))
        ax.text(x+w/2, y+h/2, text, ha="center", va="center", fontsize=8.5)
    def arrow(x1, y1, x2, y2, text="", style="-|>", color="#444", ls="-"):
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, color=color,
                                     lw=1.4, ls=ls, mutation_scale=14, shrinkA=2, shrinkB=2))
        if text: ax.text((x1+x2)/2, (y1+y2)/2+0.12, text, ha="center", fontsize=6.8, color=color)
    NFT, EXT, TRC = "#e8f5e9", "#e3f2fd", "#fff3e0"
    GN, BL, OR = "#2e7d32", "#1565c0", "#ef6c00"
    box(0.1, 1.5, 1.7, 1.0, "Tier-1 Breeder\nCooperative", EXT, BL)
    box(2.2, 1.5, 1.6, 1.0, "SeedLotNFT\nERC-721", NFT, GN)
    box(4.2, 1.5, 1.7, 1.0, "CropCycleContract\nper cycle", NFT, GN)
    box(6.3, 1.5, 1.7, 1.0, "Yield Token\nERC-1155", NFT, GN)
    box(8.4, 1.5, 1.5, 1.0, "Consumer /\nFood-Pension", EXT, BL)
    box(6.3, 0.05, 1.7, 0.85, "Chain-of-custody\ntrace", TRC, OR)
    box(2.2, 3.0, 1.6, 0.85, "Breeder royalty\nwallet (ERC-2981)", EXT, BL)
    box(8.3, 3.0, 1.6, 0.85, "Corporate Scope-3\npartner", EXT, BL)
    arrow(1.8, 2.0, 2.2, 2.0, "CoA hash")
    arrow(3.8, 2.0, 4.2, 2.0, "anchors lot")
    arrow(5.9, 2.0, 6.3, 2.0, "mints batch")
    arrow(8.0, 2.0, 8.4, 2.0, "redeem")
    arrow(7.15, 1.5, 7.15, 0.9, "attest")
    arrow(3.0, 2.5, 3.0, 3.0, "royalty", style="-|>", color=GN, ls="--")
    arrow(7.4, 0.9, 8.7, 3.0, "Scope-3", style="-|>", color=OR, ls="--")
    ax.set_title("Seed-to-fork provenance: breeder seed lot → consumer redemption (§3.9)", fontsize=11)
    fig.text(0.01, 0.005, "Canonical source: figures/fig_seed_to_fork_flow.mmd (Mermaid).",
             fontsize=7, color="#555")
    fig.savefig(os.path.join(OUT, "fig_seed_to_fork_flow.png")); plt.close(fig)
    print("wrote fig_seed_to_fork_flow.png")

# ── Figure 8: Food-mining sensitivity — equity subscribers vs phi_profit (§4.8) ──
def fig_food_mining_sensitivity():
    # Theorem 1 (Doc 7 §6.2, R_farm decision 2026-06-12): N_eq = min(V/E_thr(phi), N_reserve)
    # E_thr(phi) = eps(phi)*V with eps = C_food_eff/(R*phi), so uncapped capacity = R*phi/C_food_eff
    R, V = 42500.0, 200000.0                              # worked-example params (sim/Doc 7 canonical)
    C_EFF = 0.70 * 1.00 * 200.0 * 0.36                    # rho_bar*Pi_bar*a*C_food = $50.40/yr (Eq. 9)
    RESERVE_CAP = 250.0                                   # market-bounded pool closure (Theorem 4)
    phi = np.linspace(0.70, 0.90, 41)
    uncapped = phi * R / C_EFF                            # V/E_thr(phi): 590 -> 759
    neq = np.minimum(uncapped, RESERVE_CAP)
    fig, ax = plt.subplots(figsize=(7.2, 4.2))
    ax.plot(phi, uncapped, color=BLUE, lw=2, label=r"Uncapped capacity  $V_{farm}/E_{thr}(\varphi)$")
    ax.plot(phi, neq, color=GREEN, lw=2.6, label=r"$N_{eq}$ (binding min)")
    ax.hlines(RESERVE_CAP, 0.70, 0.90, color=GRAY, ls="--", lw=1.6, zorder=4,
              label=f"Reserve closure (Thm 4; N = {RESERVE_CAP:.0f} at φ=0.80)")
    ax.scatter([0.80], [0.80*R/C_EFF], s=90, color=RED, zorder=5)
    ax.annotate(f"worked example\n(φ=0.80: uncapped ≈{0.80*R/C_EFF:.0f} → 250 reserve-capped)",
                (0.80, 0.80*R/C_EFF), xytext=(0.812, 520), fontsize=8.5, color=RED,
                arrowprops=dict(arrowstyle="->", color=RED))
    ax.set_xlabel(r"Profit-distribution share $\varphi_{profit}$")
    ax.set_ylabel("Equity-tier subscribers per farm")
    ax.set_title("Food-mining sensitivity: equity subscribers vs profit share (Theorem 1)")
    ax.set_xlim(0.70, 0.90); ax.set_ylim(150, 820); ax.legend(fontsize=8.5, loc="upper left"); ax.grid(alpha=0.3)
    fig.text(0.01, -0.02, "Doc 7 §6.2 params (R=\\$42,500, V_farm=\\$200,000, a=200 kg, C_food=\\$0.36/kg, mean redemption 0.70; E_thr(0.80)=\\$296). "
             "Reserve closure computed at the φ=0.80 operating point.",
             fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_food_mining_sensitivity.png")); plt.close(fig)
    print("wrote fig_food_mining_sensitivity.png")

# ── Figure 9: Carbon-economics three-scenario range (§4.7 Table 7) ──────────
def fig_carbon_scenarios():
    scen = ["Conservative\n(Tier 2, 0% rooftop)", "Default\n(Tier 1, 70% rooftop)", "Optimistic\n(Tier 1, 100% rooftop)"]
    net_climate = [-447, 163, 163]   # g CO2e/kg (non-UHI net)
    uhi = [0, 1491, 3550]            # rooftop UHI co-benefit
    totals = [n+u for n, u in zip(net_climate, uhi)]
    x = np.arange(len(scen))
    fig, ax = plt.subplots(figsize=(7.4, 4.4))
    ax.bar(x, net_climate, 0.55, label="Net climate (non-UHI)", color=[RED, BLUE, BLUE])
    ax.bar(x, uhi, 0.55, bottom=[max(0, n) for n in net_climate], label="Rooftop UHI co-benefit", color=GREEN, alpha=0.85)
    for i, t in enumerate(totals):
        ax.text(x[i], t + (60 if t >= 0 else -120), f"{t:+,} total", ha="center", fontsize=9,
                color=("#c62828" if t < 0 else "#1b5e20"))
    ax.axhline(0, color="#333", lw=1)
    ax.set_xticks(x); ax.set_xticklabels(scen, fontsize=9)
    ax.set_ylabel(r"Avoided emissions (g CO$_2$e kg$^{-1}$)")
    ax.set_title("Carbon-economics three-scenario range (lettuce, §4.7)")
    ax.legend(fontsize=9, loc="upper left"); ax.grid(axis="y", alpha=0.3)
    fig.text(0.01, -0.02, "Default is the submission-level Path E claim; Conservative is the Tier-2 "
             "fall-back. From manuscript Table 7.", fontsize=7.5, color="#555")
    fig.savefig(os.path.join(OUT, "fig_carbon_scenarios.png")); plt.close(fig)
    print("wrote fig_carbon_scenarios.png")

# ── Figure 10: Sensitivity tornado — revenue uplift vs parameter ranges (§4) ──
# Data is a real seeded-sim sweep (WOOLLY_SIM_SEED=42) via the env-override hooks
# in simulation-runner.ts; reproduce with scripts/sensitivity.sh. Baseline 16.33pp.
def fig_sensitivity_tornado():
    base = 16.33
    # (param label, low_uplift, high_uplift, range_note)
    rows = [
        ("Batch coordination β\n(×0.6–1.4)",            14.52, 18.13),
        ("Spoilage-reduction rate\n(woolly ×0.7–1.3)",  14.92, 17.73),
        ("Channel affordability\n(D2C price-rel 0.75–0.90)", 15.19, 17.78),
        ("Contract pricing α\n(×0.6–1.4)",              15.43, 17.22),
        ("q-commerce commission\n(0.22–0.30)",          15.19, 16.71),
    ]
    rows.sort(key=lambda r: (r[2] - r[1]))  # ascending swing → largest on top in barh
    labels = [r[0] for r in rows]
    y = np.arange(len(rows))
    fig, ax = plt.subplots(figsize=(7.6, 4.4))
    for i, (_, lo, hi) in enumerate(rows):
        ax.barh(i, hi - lo, left=lo, height=0.6, color=GREEN, alpha=0.85)
        ax.text(lo - 0.05, i, f"{lo:.1f}", va="center", ha="right", fontsize=8)
        ax.text(hi + 0.05, i, f"{hi:.1f}", va="center", ha="left", fontsize=8)
    ax.axvline(base, color=RED, lw=1.8, ls="--")
    ax.text(base + 0.05, -0.62, f"baseline {base}", color=RED, fontsize=8.5, ha="left")
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=8.5)
    ax.set_ylim(-0.8, len(rows) - 0.3)
    ax.set_xlabel("Ecosystem-mean revenue uplift (pp)")
    ax.set_title("Sensitivity of the +14.6% revenue uplift (seeded-sim sweep)")
    ax.set_xlim(13.5, 19.0); ax.grid(axis="x", alpha=0.3)
    fig.text(0.01, -0.02, "Each bar: eco-mean uplift when one parameter spans its range, others held central. "
             "Reproduce: scripts/sensitivity.sh (WOOLLY_SIM_SEED=42).", fontsize=7.3, color="#555")
    fig.savefig(os.path.join(OUT, "fig_sensitivity_tornado.png")); plt.close(fig)
    print("wrote fig_sensitivity_tornado.png")

if __name__ == "__main__":
    fig_efficiency(); fig_authority(); fig_cost(); fig_tokenomics()
    fig_four_mechanism(); fig_dmrv_curve(); fig_seed_to_fork()
    fig_food_mining_sensitivity(); fig_carbon_scenarios()
    fig_sensitivity_tornado()
    print("All figures written to", os.path.abspath(OUT))
