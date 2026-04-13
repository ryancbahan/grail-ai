import fs from "fs";
import path from "path";
import { ResolveContext } from "@grail/core";

const JS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const INDEX_FILES = JS_EXTENSIONS.map((ext) => `index${ext}`);

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "inspector", "module", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "timers", "tls",
  "trace_events", "tty", "url", "util", "v8", "vm", "wasi",
  "worker_threads", "zlib",
]);

interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
}

let tsConfigCache: Map<string, TsConfigPaths | null> = new Map();

function loadTsConfigPaths(projectRoot: string): TsConfigPaths | null {
  if (tsConfigCache.has(projectRoot)) {
    return tsConfigCache.get(projectRoot)!;
  }

  const configPath = path.join(projectRoot, "tsconfig.json");
  if (!fs.existsSync(configPath)) {
    tsConfigCache.set(projectRoot, null);
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    // Strip single-line comments for JSON parsing
    const stripped = raw.replace(/\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1");
    const config = JSON.parse(stripped);
    const compilerOptions = config.compilerOptions || {};
    const paths = compilerOptions.paths;
    if (!paths) {
      tsConfigCache.set(projectRoot, null);
      return null;
    }
    const baseUrl = path.resolve(
      projectRoot,
      compilerOptions.baseUrl || "."
    );
    const result: TsConfigPaths = { baseUrl, paths };
    tsConfigCache.set(projectRoot, result);
    return result;
  } catch {
    tsConfigCache.set(projectRoot, null);
    return null;
  }
}

function tryResolveFile(filePath: string): string | null {
  // Try exact path
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }

  // Try adding extensions
  for (const ext of JS_EXTENSIONS) {
    const withExt = filePath + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return withExt;
    }
  }

  // Try as directory with index file
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    for (const indexFile of INDEX_FILES) {
      const indexPath = path.join(filePath, indexFile);
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }
  }

  return null;
}

export function resolveJavaScriptImport(
  specifier: string,
  context: ResolveContext
): string | null {
  // Node builtins
  if (NODE_BUILTINS.has(specifier) || specifier.startsWith("node:")) {
    return null;
  }

  // Relative imports
  if (specifier.startsWith(".")) {
    const dir = path.dirname(context.containingFile);
    const target = path.resolve(dir, specifier);
    return tryResolveFile(target);
  }

  // tsconfig paths
  const tsConfig = loadTsConfigPaths(context.projectRoot);
  if (tsConfig) {
    for (const [pattern, mappings] of Object.entries(tsConfig.paths)) {
      const prefix = pattern.replace(/\*$/, "");
      if (specifier.startsWith(prefix)) {
        const rest = specifier.slice(prefix.length);
        for (const mapping of mappings) {
          const mapped = mapping.replace(/\*$/, rest);
          const target = path.resolve(tsConfig.baseUrl, mapped);
          const resolved = tryResolveFile(target);
          if (resolved) return resolved;
        }
      }
    }
  }

  // Everything else is external
  return null;
}

/** Clear the tsconfig cache (useful for testing) */
export function clearResolverCache(): void {
  tsConfigCache.clear();
}
