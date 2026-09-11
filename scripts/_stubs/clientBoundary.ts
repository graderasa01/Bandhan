import { existsSync, readFileSync } from "node:fs";

/**
 * Follows real (non-type) local imports out of each `"use client"` entry point
 * and reports any that transitively reach a module carrying `import
 * "server-only"` — the one class of build error `tsc` cannot see and that
 * `next build` cannot always be run here to catch (see
 * scripts/managed-profile-check.ts, where this walker first lived).
 */
export function clientModulesReachingServerOnly(entries: string[]): string[] {
  const problems: string[] = [];

  function resolve(spec: string, fromFile: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = pathJoin(dirname(fromFile), spec);
    else return null;
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = `${base}${ext}`;
      if (existsSync(candidate)) return candidate;
    }
    return existsSync(base) ? base : null;
  }

  function walk(file: string, trail: string[], seen: Set<string>) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (/^\s*import\s+["']server-only["']/m.test(src) && trail.length > 0) {
      problems.push(`${trail[0]} → ${[...trail.slice(1), file].join(" → ")}`);
      return;
    }
    const importRe = /import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const [, typeKeyword, clause, spec] = m;
      if (typeKeyword) continue;
      const bindings = clause.trim();
      if (
        bindings.startsWith("{") &&
        bindings
          .replace(/[{}]/g, "")
          .split(",")
          .every((b) => !b.trim() || b.trim().startsWith("type "))
      ) {
        continue;
      }
      const resolved = resolve(spec, file);
      if (resolved) walk(resolved, [...trail, file], seen);
    }
  }

  for (const entry of entries) walk(entry, [], new Set());
  return problems;
}

function dirname(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}

function pathJoin(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}
