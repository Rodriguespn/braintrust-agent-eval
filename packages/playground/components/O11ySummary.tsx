import { Badge } from "@/components/ui/badge";
import type { TranscriptSummary, ToolName } from "@/lib/types";

interface O11ySummaryProps {
  summary: TranscriptSummary;
}

const TOOL_LABELS: Record<ToolName, string> = {
  file_read: "File Read",
  file_write: "File Write",
  file_edit: "File Edit",
  shell: "Shell",
  web_fetch: "Web Fetch",
  web_search: "Web Search",
  glob: "Glob",
  grep: "Grep",
  list_dir: "List Dir",
  agent_task: "Agent Task",
  unknown: "Unknown",
};

export function O11ySummary({ summary }: O11ySummaryProps) {
  const toolEntries = Object.entries(summary.toolCalls)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-3 rounded-lg bg-muted/50 p-4">
      {/* Inline stats */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span><span className="text-muted-foreground">Turns</span> <span className="font-medium">{summary.totalTurns}</span></span>
        <span><span className="text-muted-foreground">Tool Calls</span> <span className="font-medium">{summary.totalToolCalls}</span></span>
        <span><span className="text-muted-foreground">Thinking</span> <span className="font-medium">{summary.thinkingBlocks}</span></span>
        <span>
          <span className="text-muted-foreground">Errors</span>{" "}
          <span className={`font-medium ${summary.errors.length > 0 ? "text-destructive" : ""}`}>{summary.errors.length}</span>
        </span>
      </div>

      {/* Tool breakdown - inline */}
      {toolEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {toolEntries.map(([tool, count]) => (
            <Badge key={tool} variant="secondary" className="text-xs font-normal">
              {TOOL_LABELS[tool as ToolName] ?? tool} <span className="font-mono ml-1">{count}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Files - inline */}
      {(summary.filesRead.length > 0 || summary.filesModified.length > 0) && (
        <div className="space-y-1.5 text-xs">
          {summary.filesRead.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-muted-foreground shrink-0">Read ({summary.filesRead.length})</span>
              {summary.filesRead.slice(0, 10).map((f) => (
                <Badge key={f} variant="outline" className="text-xs font-mono font-normal">
                  {f}
                </Badge>
              ))}
              {summary.filesRead.length > 10 && (
                <span className="text-muted-foreground">+{summary.filesRead.length - 10} more</span>
              )}
            </div>
          )}
          {summary.filesModified.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-muted-foreground shrink-0">Modified ({summary.filesModified.length})</span>
              {summary.filesModified.slice(0, 10).map((f) => (
                <Badge key={f} variant="outline" className="text-xs font-mono font-normal">
                  {f}
                </Badge>
              ))}
              {summary.filesModified.length > 10 && (
                <span className="text-muted-foreground">+{summary.filesModified.length - 10} more</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Shell commands - compact */}
      {summary.shellCommands.length > 0 && (
        <div className="space-y-1 text-xs">
          <span className="text-muted-foreground">Shell ({summary.shellCommands.length})</span>
          <div className="flex flex-wrap gap-1">
            {summary.shellCommands.slice(0, 10).map((cmd, i) => {
              // Check success field first, then exitCode if available
              const isSuccess = cmd.success ?? (cmd.exitCode === 0);
              return (
                <Badge
                  key={i}
                  variant={isSuccess ? "outline" : "destructive"}
                  className="text-xs font-mono font-normal max-w-64 truncate"
                  title={cmd.exitCode !== undefined ? `Exit code: ${cmd.exitCode}` : undefined}
                >
                  {cmd.command}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Errors - compact */}
      {summary.errors.length > 0 && (
        <div className="space-y-1 text-xs">
          <span className="text-destructive font-medium">Errors ({summary.errors.length})</span>
          {summary.errors.map((err, i) => (
            <div key={i} className="text-xs font-mono text-destructive truncate">
              {err}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
