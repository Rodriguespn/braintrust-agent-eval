# Charts

## Generate charts

Fetch the latest data from Braintrust and regenerate all charts with one command:

```bash
set -a && source .env && set +a && python charts/fetch_braintrust_data.py && python charts/mcp_vs_cli_chart.py --style scenarios && python charts/mcp_vs_cli_chart.py --style grouped && python charts/mcp_vs_cli_chart.py --style stacked && python charts/mcp_vs_cli_chart.py --style heatmap
```

Run from the `charts/` directory. Outputs: `mcp_vs_cli_scenarios.png`, `mcp_vs_cli_grouped.png`, `mcp_vs_cli_stacked.png`, `mcp_vs_cli_heatmap.png`.

Requires: `pip install matplotlib numpy requests`

## Scenarios

Three scenarios are compared:

| Scenario | Env vars | Description |
|---|---|---|
| Baseline | `EVAL_BASELINE=true` | No skills loaded; agent uses only built-in tools |
| Skills + 20 tools | `MCP_TOOL_COUNT=20` | Supabase skill loaded + all 20 MCP tools exposed |
| Skills + 8 tools | `MCP_TOOL_COUNT=8` | Supabase skill loaded + 8 MCP tools (docs, database, debugging) |
| Skills + 7 tools | `MCP_TOOL_COUNT=7` | Supabase skill loaded + 7 MCP tools (database, debugging) |

The `scenarios` chart style aggregates all runs per scenario and shows MCP vs CLI call counts (stacked bars) alongside average MCP usage score.
