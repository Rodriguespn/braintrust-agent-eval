/**
 * Server-side data access for the playground.
 * Reads JSON files from the results/ and evals/ directories.
 * Directory paths are provided via RESULTS_DIR and EVALS_DIR env vars.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

function getResultsDir(): string {
  return resolve(process.env.RESULTS_DIR || "./results");
}

function getEvalsDir(): string {
  return resolve(process.env.EVALS_DIR || "./evals");
}

/** List experiments from the results directory. Pass limit to cap expensive per-item reads. */
export function listExperiments(limit?: number) {
  const resultsDir = getResultsDir();

  if (!existsSync(resultsDir)) {
    return { items: [], total: 0 };
  }

  const entries = readdirSync(resultsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const total = entries.length;
  const toProcess = limit ? entries.slice(0, limit) : entries;

  const items = toProcess.map((name) => {
    const expDir = join(resultsDir, name);
    const timestamps = readdirSync(expDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();

    let latestPassRate: number | undefined;
    let latestTotalRuns = 0;
    let latestPassedRuns = 0;

    if (timestamps.length > 0) {
      const latestDir = join(expDir, timestamps[0]);
      const evalDirs = readdirSync(latestDir, { withFileTypes: true }).filter(
        (e) => e.isDirectory()
      );

      for (const evalDir of evalDirs) {
        const summaryPath = join(latestDir, evalDir.name, "summary.json");
        if (existsSync(summaryPath)) {
          try {
            const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
            latestTotalRuns += summary.totalRuns ?? 0;
            latestPassedRuns += summary.passedRuns ?? 0;
          } catch {
            // Skip invalid summary files
          }
        }
      }

      if (latestTotalRuns > 0) {
        latestPassRate = (latestPassedRuns / latestTotalRuns) * 100;
      }
    }

    return {
      name,
      timestamps,
      latestTimestamp: timestamps[0] ?? null,
      latestPassRate,
      latestTotalRuns,
      latestPassedRuns,
    };
  });

  return { items, total };
}

/** Get timestamps for a specific experiment */
export function getExperiment(name: string) {
  const expDir = join(getResultsDir(), name);

  if (!existsSync(expDir)) {
    return null;
  }

  const timestamps = readdirSync(expDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();

  return { name, timestamps, latestTimestamp: timestamps[0] ?? null };
}

/** Get full experiment detail for a specific timestamp */
export function getExperimentDetail(name: string, timestamp: string) {
  const runDir = join(getResultsDir(), name, timestamp);

  if (!existsSync(runDir)) {
    return null;
  }

  const evalDirs = readdirSync(runDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const evals = evalDirs.map((evalName) => {
    const evalDir = join(runDir, evalName);
    const summaryPath = join(evalDir, "summary.json");

    let summary = {
      totalRuns: 0,
      passedRuns: 0,
      passRate: "0%",
      meanDuration: 0,
    };
    if (existsSync(summaryPath)) {
      try {
        summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
      } catch {
        // Use defaults
      }
    }

    // List run directories
    const runDirs = readdirSync(evalDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("run-"))
      .map((e) => e.name)
      .sort();

    // Read each run's result.json
    const runs = runDirs.map((runDirName) => {
      const resultPath = join(evalDir, runDirName, "result.json");
      let result = null;
      if (existsSync(resultPath)) {
        try {
          result = JSON.parse(readFileSync(resultPath, "utf-8"));
        } catch {
          // Skip
        }
      }
      return { name: runDirName, result };
    });

    return {
      name: evalName,
      totalRuns: summary.totalRuns,
      passedRuns: summary.passedRuns,
      passRate:
        typeof summary.passRate === "string"
          ? parseFloat(summary.passRate)
          : summary.passRate,
      meanDuration: summary.meanDuration,
      runs,
    };
  });

  return { name, timestamp, evals };
}

/** Get result for a specific run */
export function getRunResult(
  experiment: string,
  timestamp: string,
  evalName: string,
  run: string
) {
  const resultPath = join(
    getResultsDir(),
    experiment,
    timestamp,
    evalName,
    run,
    "result.json"
  );

  if (!existsSync(resultPath)) {
    return null;
  }

  try {
    return { result: JSON.parse(readFileSync(resultPath, "utf-8")) };
  } catch {
    return null;
  }
}

/** Get parsed transcript for a specific run */
export function getTranscript(
  experiment: string,
  timestamp: string,
  evalName: string,
  run: string
) {
  const transcriptPath = join(
    getResultsDir(),
    experiment,
    timestamp,
    evalName,
    run,
    "transcript.json"
  );

  if (!existsSync(transcriptPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(transcriptPath, "utf-8"));
  } catch {
    return null;
  }
}

/** List evals from the evals directory. Pass limit to cap per-item reads. */
export function listEvals(limit?: number) {
  const evalsDir = getEvalsDir();

  if (!existsSync(evalsDir)) {
    return { items: [], total: 0 };
  }

  // Recursively discover all evals (directories with PROMPT.md)
  const entries: string[] = [];
  function walk(dir: string, basePath: string = "") {
    const dirEntries = readdirSync(dir, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }

      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      const entryPath = join(dir, entry.name);
      const promptPath = join(entryPath, "PROMPT.md");

      // Check if this is an eval directory (has PROMPT.md)
      if (existsSync(promptPath)) {
        entries.push(relativePath);
      } else {
        // Not an eval, recurse into it
        walk(entryPath, relativePath);
      }
    }
  }

  walk(evalsDir);
  entries.sort();

  const total = entries.length;
  const toProcess = limit ? entries.slice(0, limit) : entries;

  const items = toProcess.map((name) => {
    const evalDir = join(evalsDir, name);
    const promptPath = join(evalDir, "PROMPT.md");
    let prompt = "";
    if (existsSync(promptPath)) {
      prompt = readFileSync(promptPath, "utf-8");
    }

    const files = readdirSync(evalDir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);

    return { name, prompt, files };
  });

  return { items, total };
}

/** Get detail for a specific eval */
export function getEvalDetail(name: string) {
  const evalDir = join(getEvalsDir(), name);

  if (!existsSync(evalDir)) {
    return null;
  }

  const promptPath = join(evalDir, "PROMPT.md");
  let prompt = "";
  if (existsSync(promptPath)) {
    prompt = readFileSync(promptPath, "utf-8");
  }

  // Recursively list files
  const files: string[] = [];
  function walk(dir: string, prefix: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }
  walk(evalDir, "");

  // Read file contents for key files
  const fileContents: Record<string, string> = {};
  const keyFiles = ["PROMPT.md", "EVAL.ts", "EVAL.tsx", "package.json"];
  for (const file of keyFiles) {
    const filePath = join(evalDir, file);
    if (existsSync(filePath)) {
      try {
        fileContents[file] = readFileSync(filePath, "utf-8");
      } catch {
        // Skip unreadable files
      }
    }
  }

  return { name, prompt, files, fileContents };
}
