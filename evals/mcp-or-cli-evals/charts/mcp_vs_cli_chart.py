#!/usr/bin/env python3
"""
Generate charts comparing MCP vs CLI tool usage across experiment runs.

Usage:
    python mcp_vs_cli_chart.py [--input FILE] [--output DIR] [--style scenarios|grouped|stacked|heatmap]

Data file format (charts/data/mcp_vs_cli_data.json):
[
  {
    "experiment_id": "exp_abc123",
    "timestamp": "2026-03-06T12:40:35Z",
    "model": "claude-sonnet-4-6",
    "baseline": false,
    "mcp_tool_count": 8,
    "mcp_count": 5,
    "cli_count": 2,
    "total": 7,
    "score": 0.714,
    "breakdown": [{"operation": "list_tables", "method": "mcp"}, ...]
  }
]

Scenario classification:
  baseline=true                          -> Scenario 1: Baseline (no skills)
  baseline=false, mcp_tool_count=20|null -> Scenario 2: Skills + 20 Tools
  baseline=false, mcp_tool_count=8       -> Scenario 3: Skills + 8 Tools
  baseline=false, mcp_tool_count=7       -> Scenario 3: Skills + 7 Tools
"""

import argparse
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np


SCENARIO_BASELINE = "Baseline\n(no skills)"
SCENARIO_20_TOOLS = "Skills +\n20 Tools"
SCENARIO_8_TOOLS = "Skills +\n8 Tools"
SCENARIO_7_TOOLS = "Skills +\n7 Tools"

SCENARIO_COLORS = {
    SCENARIO_BASELINE: "#95a5a6",
    SCENARIO_20_TOOLS: "#2E5FA1",
    SCENARIO_8_TOOLS: "#27ae60",
    SCENARIO_7_TOOLS: "#cf6006",
}

MCP_COLOR = "#4A90D9"
CLI_COLOR = "#E8913A"


def load_data(path: str) -> list[dict]:
    with open(path) as f:
        return json.load(f)


def classify_scenario(entry: dict) -> str:
    if entry.get("baseline", False):
        return SCENARIO_BASELINE
    tool_count = entry.get("mcp_tool_count")
    if tool_count is not None and int(tool_count) == 8:
        return SCENARIO_8_TOOLS
    if tool_count is not None and int(tool_count) == 7:
        return SCENARIO_7_TOOLS
    return SCENARIO_20_TOOLS


def group_by_scenario(data: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {
        SCENARIO_BASELINE: [],
        SCENARIO_20_TOOLS: [],
        SCENARIO_8_TOOLS: [],
        SCENARIO_7_TOOLS: [],
    }
    for entry in data:
        groups[classify_scenario(entry)].append(entry)
    return groups


def chart_scenarios(data: list[dict], output_dir: str):
    """
    Main comparison chart: side-by-side view of the three scenarios.
    Left panel: total MCP vs CLI calls (stacked bars).
    Right panel: average MCP usage score.
    """
    groups = group_by_scenario(data)

    labels = [SCENARIO_BASELINE, SCENARIO_20_TOOLS, SCENARIO_8_TOOLS, SCENARIO_7_TOOLS]
    mcp_totals, cli_totals, avg_scores, run_counts = [], [], [], []

    for label in labels:
        entries = groups[label]
        mcp_totals.append(sum(e.get("mcp_count", 0) for e in entries))
        cli_totals.append(sum(e.get("cli_count", 0) for e in entries))
        valid = [e["score"] for e in entries if e.get("score") is not None]
        avg_scores.append(sum(valid) / len(valid) if valid else 0.0)
        run_counts.append(len(entries))

    models = sorted(set(e.get("model") or "unknown" for e in data))
    model_label = ", ".join(models)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 6))
    fig.suptitle(
        f"Supabase Skill: MCP vs CLI – Scenario Comparison\nModel: {model_label}",
        fontsize=14, fontweight="bold", y=1.02,
    )

    x = np.arange(len(labels))
    bar_width = 0.5

    # ── Left panel: stacked MCP / CLI counts ──────────────────────────────
    bars_mcp = ax1.bar(x, mcp_totals, bar_width, label="MCP calls", color=MCP_COLOR)
    bars_cli = ax1.bar(x, cli_totals, bar_width, bottom=mcp_totals, label="CLI calls", color=CLI_COLOR)

    ax1.set_xticks(x)
    ax1.set_xticklabels(labels, fontsize=11)
    ax1.set_ylabel("Total Tool Calls", fontsize=11)
    ax1.set_title("MCP vs CLI Tool Calls per Scenario", fontsize=12)
    ax1.legend(fontsize=10)
    ax1.grid(axis="y", alpha=0.3)

    # Annotate: MCP count inside blue segment, CLI count inside orange segment, n= on top
    for i, (m, c, n) in enumerate(zip(mcp_totals, cli_totals, run_counts)):
        if m > 0:
            ax1.text(i, m / 2, str(m), ha="center", va="center", fontsize=11, color="white", fontweight="bold")
        if c > 0:
            ax1.text(i, m + c / 2, str(c), ha="center", va="center", fontsize=11, color="white", fontweight="bold")
        ax1.text(i, m + c + max(mcp_totals + cli_totals) * 0.02, f"n={n}", ha="center", va="bottom", fontsize=9, color="#555")

    # ── Right panel: average score ─────────────────────────────────────────
    bar_colors = [SCENARIO_COLORS[l] for l in labels]
    bars_score = ax2.bar(x, avg_scores, bar_width, color=bar_colors, edgecolor="white", linewidth=1.5)

    ax2.set_xticks(x)
    ax2.set_xticklabels(labels, fontsize=11)
    ax2.set_ylabel("Average Score (MCP %)", fontsize=11)
    ax2.set_ylim(0, 1.15)
    ax2.set_title("Average MCP Usage Score per Scenario", fontsize=12)
    ax2.grid(axis="y", alpha=0.3)

    for bar, score, n in zip(bars_score, avg_scores, run_counts):
        if score > 0:
            ax2.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.03,
                f"{score:.0%}",
                ha="center", va="bottom", fontsize=13, fontweight="bold",
            )
        if n == 0:
            ax2.text(
                bar.get_x() + bar.get_width() / 2,
                0.05,
                "no data",
                ha="center", va="bottom", fontsize=10, color="#999",
            )

    plt.tight_layout()
    out = Path(output_dir) / "mcp_vs_cli_scenarios.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved: {out}")


def split_by_mode(data: list[dict]) -> tuple[list[dict], list[dict]]:
    baseline = [d for d in data if d.get("baseline", False)]
    with_skills = [d for d in data if not d.get("baseline", False)]
    return baseline, with_skills


def chart_grouped(data: list[dict], output_dir: str):
    """Grouped bar chart: MCP vs CLI counts, baseline and with-skills side by side."""
    baseline, with_skills = split_by_mode(data)

    all_timestamps = sorted(set(d["timestamp"] for d in data))
    if not all_timestamps:
        print("No data to chart.")
        return

    fig, ax = plt.subplots(figsize=(max(10, len(all_timestamps) * 2.5), 6))

    x = np.arange(len(all_timestamps))
    bar_width = 0.18

    baseline_map = {d["timestamp"]: d for d in baseline}
    skills_map = {d["timestamp"]: d for d in with_skills}

    b_mcp = [baseline_map.get(t, {}).get("mcp_count", 0) for t in all_timestamps]
    b_cli = [baseline_map.get(t, {}).get("cli_count", 0) for t in all_timestamps]
    s_mcp = [skills_map.get(t, {}).get("mcp_count", 0) for t in all_timestamps]
    s_cli = [skills_map.get(t, {}).get("cli_count", 0) for t in all_timestamps]

    has_baseline = any(v > 0 for v in b_mcp + b_cli)
    has_skills = any(v > 0 for v in s_mcp + s_cli)

    if has_baseline:
        ax.bar(x - 1.5 * bar_width, b_mcp, bar_width, label="Baseline MCP", color="#4A90D9", alpha=0.7)
        ax.bar(x - 0.5 * bar_width, b_cli, bar_width, label="Baseline CLI", color="#E8913A", alpha=0.7)
    if has_skills:
        ax.bar(x + 0.5 * bar_width, s_mcp, bar_width, label="With Skills MCP", color="#2E5FA1", alpha=0.9)
        ax.bar(x + 1.5 * bar_width, s_cli, bar_width, label="With Skills CLI", color="#B5651D", alpha=0.9)

    labels = [t[:16].replace("T", "\n") for t in all_timestamps]
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=8)
    ax.set_ylabel("Count")
    ax.set_title("MCP vs CLI Usage (Grouped)")
    ax.legend()
    ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    out = Path(output_dir) / "mcp_vs_cli_grouped.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"Saved: {out}")


def chart_stacked(data: list[dict], output_dir: str):
    """Stacked proportion bars showing MCP/CLI ratio per run."""
    baseline, with_skills = split_by_mode(data)

    all_timestamps = sorted(set(d["timestamp"] for d in data))
    if not all_timestamps:
        print("No data to chart.")
        return

    fig, ax = plt.subplots(figsize=(max(10, len(all_timestamps) * 2), 6))

    x = np.arange(len(all_timestamps))
    bar_width = 0.35

    baseline_map = {d["timestamp"]: d for d in baseline}
    skills_map = {d["timestamp"]: d for d in with_skills}

    has_baseline = bool(baseline)
    has_skills = bool(with_skills)

    for i, t in enumerate(all_timestamps):
        if has_baseline and t in baseline_map:
            d = baseline_map[t]
            total = d.get("total", 0) or 1
            mcp_ratio = d.get("mcp_count", 0) / total
            cli_ratio = d.get("cli_count", 0) / total
            ax.bar(x[i] - bar_width / 2, mcp_ratio, bar_width, color="#4A90D9", alpha=0.7)
            ax.bar(x[i] - bar_width / 2, cli_ratio, bar_width, bottom=mcp_ratio, color="#E8913A", alpha=0.7)

        if has_skills and t in skills_map:
            d = skills_map[t]
            total = d.get("total", 0) or 1
            mcp_ratio = d.get("mcp_count", 0) / total
            cli_ratio = d.get("cli_count", 0) / total
            ax.bar(x[i] + bar_width / 2, mcp_ratio, bar_width, color="#2E5FA1", alpha=0.9)
            ax.bar(x[i] + bar_width / 2, cli_ratio, bar_width, bottom=mcp_ratio, color="#B5651D", alpha=0.9)

    labels = [t[:16].replace("T", "\n") for t in all_timestamps]
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=8)
    ax.set_ylabel("Proportion")
    ax.set_ylim(0, 1.05)
    ax.set_title("MCP vs CLI Proportion (Stacked)")

    legend_handles = []
    if has_baseline:
        legend_handles.append(mpatches.Patch(color="#4A90D9", alpha=0.7, label="Baseline MCP"))
        legend_handles.append(mpatches.Patch(color="#E8913A", alpha=0.7, label="Baseline CLI"))
    if has_skills:
        legend_handles.append(mpatches.Patch(color="#2E5FA1", alpha=0.9, label="Skills MCP"))
        legend_handles.append(mpatches.Patch(color="#B5651D", alpha=0.9, label="Skills CLI"))
    ax.legend(handles=legend_handles)
    ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    out = Path(output_dir) / "mcp_vs_cli_stacked.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"Saved: {out}")


def chart_heatmap(data: list[dict], output_dir: str):
    """Heatmap: rows=operations, columns=scenarios (same x-axis as scenarios chart). Blue=MCP, Orange=CLI."""
    from matplotlib.colors import LinearSegmentedColormap

    all_ops = sorted(
        set(
            entry["operation"]
            for d in data
            for entry in d.get("breakdown", [])
        )
    )
    if not all_ops:
        print("No operation breakdown data for heatmap.")
        return

    groups = group_by_scenario(data)
    scenario_labels = [SCENARIO_BASELINE, SCENARIO_20_TOOLS, SCENARIO_8_TOOLS, SCENARIO_7_TOOLS]
    # Only include scenarios that have data
    active_labels = [l for l in scenario_labels if groups[l]]
    if not active_labels:
        print("No columns to render in heatmap.")
        return

    # For each scenario + operation, compute MCP fraction: +1=all MCP, -1=all CLI, 0=N/A
    matrix = np.zeros((len(all_ops), len(active_labels)))
    cell_text = []
    for col_idx, label in enumerate(active_labels):
        col_text = []
        for row_idx, op in enumerate(all_ops):
            mcp_count = 0
            cli_count = 0
            for run in groups[label]:
                for entry in run.get("breakdown", []):
                    if entry["operation"] == op:
                        if entry["method"] == "mcp":
                            mcp_count += 1
                        elif entry["method"] == "cli":
                            cli_count += 1
            total = mcp_count + cli_count
            if total == 0:
                matrix[row_idx, col_idx] = 0
                col_text.append("-")
            else:
                matrix[row_idx, col_idx] = (mcp_count - cli_count) / total
                if mcp_count > 0 and cli_count == 0:
                    col_text.append("MCP")
                elif cli_count > 0 and mcp_count == 0:
                    col_text.append("CLI")
                else:
                    pct = int(round(mcp_count / total * 100))
                    col_text.append(f"{pct}%\nMCP")
        cell_text.append(col_text)

    cmap = LinearSegmentedColormap.from_list("mcp_cli", ["#E8913A", "#F5F5F5", "#4A90D9"])

    fig, ax = plt.subplots(figsize=(max(8, len(active_labels) * 2.5), max(4, len(all_ops) * 0.6)))
    ax.imshow(matrix, cmap=cmap, vmin=-1, vmax=1, aspect="auto")

    ax.set_xticks(range(len(active_labels)))
    ax.set_xticklabels(active_labels, fontsize=11, ha="center")
    ax.set_yticks(range(len(all_ops)))
    ax.set_yticklabels(all_ops, fontsize=9)
    ax.set_title("Operation Method Heatmap (Blue=MCP, Orange=CLI, Gray=N/A)")

    for col_idx in range(len(active_labels)):
        for row_idx in range(len(all_ops)):
            val = matrix[row_idx, col_idx]
            label = cell_text[col_idx][row_idx]
            color = "white" if abs(val) > 0.3 else "gray"
            ax.text(col_idx, row_idx, label, ha="center", va="center", fontsize=8, color=color)

    plt.tight_layout()
    out = Path(output_dir) / "mcp_vs_cli_heatmap.png"
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"Saved: {out}")


def main():
    parser = argparse.ArgumentParser(description="Generate MCP vs CLI comparison charts")
    parser.add_argument(
        "--input",
        default="data/mcp_vs_cli_data.json",
        help="Path to JSON data file (default: data/mcp_vs_cli_data.json)",
    )
    parser.add_argument(
        "--output",
        default=".",
        help="Output directory for chart images (default: current directory)",
    )
    parser.add_argument(
        "--style",
        choices=["scenarios", "grouped", "stacked", "heatmap"],
        default="scenarios",
        help="Chart style (default: scenarios)",
    )
    args = parser.parse_args()

    data_path = Path(args.input)
    if not data_path.exists():
        print(f"Error: Data file not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    data = load_data(str(data_path))
    if not data:
        print("Error: Data file is empty.", file=sys.stderr)
        sys.exit(1)

    output_dir = args.output
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    chart_fn = {
        "scenarios": chart_scenarios,
        "grouped": chart_grouped,
        "stacked": chart_stacked,
        "heatmap": chart_heatmap,
    }[args.style]

    chart_fn(data, output_dir)


if __name__ == "__main__":
    main()
