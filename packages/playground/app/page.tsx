import Link from "next/link";
import { listExperiments, listEvals } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const experiments = listExperiments();
  const evals = listEvals();

  const totalRuns = experiments.reduce((sum, e) => sum + e.timestamps.length, 0);
  const totalEvals = evals.length;

  // Compute aggregate pass rate across all latest experiment runs
  const totalPassed = experiments.reduce((sum, e) => sum + (e.latestPassedRuns ?? 0), 0);
  const totalAttempted = experiments.reduce((sum, e) => sum + (e.latestTotalRuns ?? 0), 0);
  const overallPassRate = totalAttempted > 0 ? (totalPassed / totalAttempted) * 100 : 0;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">
          Playground for your agent evals to view experiments, evals, and compare runs.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-muted-foreground">Experiments</div>
            <div className="text-2xl font-bold mt-1">{experiments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-muted-foreground">Total Runs</div>
            <div className="text-2xl font-bold mt-1">{totalRuns}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-muted-foreground">Eval Fixtures</div>
            <div className="text-2xl font-bold mt-1">{totalEvals}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <div className="text-xs text-muted-foreground">Latest Pass Rate</div>
            <div className="text-2xl font-bold mt-1">
              {totalAttempted > 0 ? `${overallPassRate.toFixed(0)}%` : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Experiments */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recent Experiments</h2>
          <Link href="/experiments" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            View all →
          </Link>
        </div>
        {experiments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No experiments yet. Run <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">agent-eval</code> to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {experiments.slice(0, 6).map((exp) => (
              <Link
                key={exp.name}
                href={exp.latestTimestamp
                  ? `/experiments/${encodeURIComponent(exp.name)}/${encodeURIComponent(exp.latestTimestamp)}`
                  : "/experiments"}
                className="block cursor-pointer"
              >
                <Card className="transition-colors hover:bg-muted">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{exp.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      {exp.latestPassRate !== undefined ? (
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
                      ) : (
                        <Badge variant="outline">—</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {exp.timestamps.length} run{exp.timestamps.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Evals Preview */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Eval Fixtures</h2>
          <Link href="/evals" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            View all →
          </Link>
        </div>
        {evals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No evals found. Create evals in your <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">evals/</code> directory.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {evals.slice(0, 6).map((evalInfo) => (
              <Link
                key={evalInfo.name}
                href={`/evals/${encodeURIComponent(evalInfo.name)}`}
                className="block cursor-pointer"
              >
                <Card className="transition-colors hover:bg-muted">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{evalInfo.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {evalInfo.prompt ? (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {evalInfo.prompt.slice(0, 150)}
                        {evalInfo.prompt.length > 150 ? "..." : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No prompt</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Compare CTA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Compare</h2>
        </div>
        <Link href="/compare" className="block cursor-pointer">
          <Card className="transition-colors hover:bg-muted">
            <CardContent className="py-8 text-center">
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Compare two experiment runs side-by-side to see pass rate deltas, duration changes, and per-eval breakdowns.
              </p>
              <p className="text-xs text-foreground mt-2">
                Open Compare →
              </p>
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  );
}
