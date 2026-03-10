#!/usr/bin/env python3
"""
Fetch MCP vs CLI experiment data from Braintrust and write it to
charts/data/mcp_vs_cli_data.json for use by mcp_vs_cli_chart.py.

Usage:
    python fetch_braintrust_data.py [--output FILE] [--days N]

Environment:
    BRAINTRUST_API_KEY   (required)
    BRAINTRUST_PROJECT_ID  (required)

Data mapping from Braintrust:
    experiment.created          -> timestamp
    experiment.metadata.model   -> model
    experiment.metadata.baseline -> baseline
    scorer span scores["MCP vs CLI"] -> score
    scorer span metadata.mcpCount   -> mcp_count
    scorer span metadata.cliCount   -> cli_count
    scorer span metadata.total      -> total
    scorer span metadata.breakdown  -> breakdown

Braintrust stores scorer results as child spans with span_attributes.type="score".
The baseline/model flags live on the experiment object, not the individual spans,
so we fetch experiments first, then join scorer spans by experiment_id.
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: 'requests' is required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)


BRAINTRUST_API_BASE = "https://api.braintrust.dev/v1"
SCORER_SPAN_NAME = "mcpVsCliScorer"
SCORE_KEY = "MCP vs CLI"


def get_headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def list_experiments(api_key: str, project_id: str) -> list[dict]:
    """Fetch all experiments for the project, newest first."""
    url = f"{BRAINTRUST_API_BASE}/experiment"
    params = {"project_id": project_id, "limit": 100}
    resp = requests.get(url, headers=get_headers(api_key), params=params)
    resp.raise_for_status()
    return resp.json().get("objects", [])


def fetch_scorer_spans(api_key: str, experiment_id: str) -> list[dict]:
    """
    Fetch scorer spans for a single experiment using the fetch endpoint.
    We filter for span_attributes.type = 'score' and our specific scorer name.
    """
    url = f"{BRAINTRUST_API_BASE}/experiment/{experiment_id}/fetch"
    payload = {
        "filters": [
            {
                "type": "path_lookup",
                "path": ["span_attributes", "name"],
                "value": SCORER_SPAN_NAME,
            }
        ],
        "limit": 50,
    }
    resp = requests.post(url, headers=get_headers(api_key), json=payload)
    resp.raise_for_status()
    return resp.json().get("events", [])


def span_to_entry(experiment: dict, span: dict) -> dict | None:
    """Map a Braintrust scorer span + its experiment to the chart data format."""
    meta = span.get("metadata") or {}
    scores = span.get("scores") or {}

    mcp_count = meta.get("mcpCount")
    cli_count = meta.get("cliCount")
    total = meta.get("total")
    score = scores.get(SCORE_KEY)
    breakdown = meta.get("breakdown", [])

    # Skip spans that have no MCP vs CLI data
    if score is None and mcp_count is None:
        return None

    exp_meta = experiment.get("metadata") or {}

    return {
        "experiment_id": experiment["id"],
        "timestamp": experiment["created"],
        "model": exp_meta.get("model"),
        "baseline": exp_meta.get("baseline", False),
        "mcp_tool_count": exp_meta.get("mcpToolCount"),
        "mcp_count": mcp_count or 0,
        "cli_count": cli_count or 0,
        "total": total or 0,
        "score": round(score, 4) if score is not None else None,
        "breakdown": breakdown,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch MCP vs CLI data from Braintrust")
    parser.add_argument(
        "--output",
        default="data/mcp_vs_cli_data.json",
        help="Output JSON file path (default: data/mcp_vs_cli_data.json)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("BRAINTRUST_API_KEY")
    project_id = os.environ.get("BRAINTRUST_PROJECT_ID")

    if not api_key:
        print("Error: BRAINTRUST_API_KEY env var is required", file=sys.stderr)
        sys.exit(1)
    if not project_id:
        print("Error: BRAINTRUST_PROJECT_ID env var is required", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching experiments for project {project_id}...")
    experiments = list_experiments(api_key, project_id)
    print(f"Found {len(experiments)} experiments")

    if not experiments:
        print("No experiments found. Run the eval first.", file=sys.stderr)
        sys.exit(1)

    entries = []
    for exp in experiments:
        exp_id = exp["id"]
        exp_name = exp.get("name", exp_id)
        print(f"  Fetching scorer spans for: {exp_name}")
        try:
            spans = fetch_scorer_spans(api_key, exp_id)
        except requests.HTTPError as e:
            print(f"  Warning: failed to fetch spans for {exp_id}: {e}", file=sys.stderr)
            continue

        for span in spans:
            entry = span_to_entry(exp, span)
            if entry:
                entries.append(entry)

    if not entries:
        print("No MCP vs CLI scorer data found in any experiment.", file=sys.stderr)
        sys.exit(1)

    # Sort by timestamp ascending
    entries.sort(key=lambda e: e["timestamp"])

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(entries, f, indent=2)

    print(f"\nWrote {len(entries)} entries to {out_path}")
    for e in entries:
        if e["baseline"]:
            label = "baseline"
        elif e.get("mcp_tool_count") is not None:
            label = f"skills-{e['mcp_tool_count']}-tools"
        else:
            label = "with-skills"
        print(f"  {e['timestamp'][:10]}  {label:20s}  score={e['score']}  mcp={e['mcp_count']} cli={e['cli_count']}")


if __name__ == "__main__":
    main()
