import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ExperimentInfo {
  name: string;
  timestamps: string[];
  latestTimestamp: string | null;
  latestPassRate?: number;
  latestTotalRuns?: number;
  latestPassedRuns?: number;
}

interface ExperimentListProps {
  experiments: ExperimentInfo[];
}

export function ExperimentList({ experiments }: ExperimentListProps) {
  if (experiments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground text-lg">No experiments found</p>
          <p className="text-muted-foreground text-sm mt-2">
            Run an experiment with <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">agent-eval &lt;config&gt;</code> to see results here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-3 py-2 text-xs text-muted-foreground font-medium">
            <span>Name</span>
            <span className="w-12 text-right">Runs</span>
            <span className="w-24">Pass Rate</span>
            <span className="w-44">Latest Run</span>
          </div>
          {/* Rows */}
          {experiments.map((exp) => (
            <Link
              key={exp.name}
              href={
                exp.latestTimestamp
                  ? `/experiments/${encodeURIComponent(exp.name)}/${encodeURIComponent(exp.latestTimestamp)}`
                  : "#"
              }
              className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted rounded-md"
            >
              <span className="font-medium truncate">{exp.name}</span>
              <span className="w-12 text-right text-muted-foreground">{exp.timestamps.length}</span>
              <span className="w-24">
                {exp.latestPassRate !== undefined ? (
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={
                        exp.latestPassRate === 100
                          ? "default"
                          : exp.latestPassRate >= 50
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {exp.latestPassRate.toFixed(0)}%
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {exp.latestPassedRuns}/{exp.latestTotalRuns}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </span>
              <span className="w-44 text-xs text-muted-foreground">
                {exp.latestTimestamp ? formatTimestamp(exp.latestTimestamp) : "--"}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const isoString = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return ts;
    return date.toLocaleString();
  } catch {
    return ts;
  }
}
