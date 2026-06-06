import fs from "fs";
import path from "path";
import type { ResolveContext } from "@grail-ai/core";

const EXTERNAL_CRATES = new Set(["std", "core", "alloc", "proc_macro", "test"]);

export function resolveRustImport(specifier: string, context: ResolveContext): string | null {
  const normalized = normalizeSpecifier(specifier);
  if (!normalized) return null;

  const segments = normalized.split("::").filter(Boolean);
  if (segments.length === 0) return null;
  if (EXTERNAL_CRATES.has(segments[0])) return null;

  const crateRoot = rustSourceRoot(context.projectRoot);
  const containingDir = path.dirname(context.containingFile);

  if (segments[0] === "crate") {
    return resolveModulePath(crateRoot, segments.slice(1), true);
  }

  if (segments[0] === "self") {
    return resolveModulePath(containingDir, segments.slice(1), true);
  }

  if (segments[0] === "super") {
    return resolveModulePath(path.dirname(containingDir), segments.slice(1), true);
  }

  return (
    resolveModulePath(containingDir, segments, true) ??
    resolveModulePath(crateRoot, segments, true)
  );
}

function rustSourceRoot(projectRoot: string): string {
  const src = path.join(projectRoot, "src");
  return fs.existsSync(src) && fs.statSync(src).isDirectory() ? src : projectRoot;
}

function normalizeSpecifier(specifier: string): string {
  return specifier
    .replace(/\s+/g, "")
    .replace(/;$/, "")
    .replace(/::\{.*$/, "")
    .replace(/::\*$/, "")
    .replace(/\sas\s+\w+$/g, "");
}

function resolveModulePath(baseDir: string, segments: string[], allowStrip: boolean): string | null {
  if (segments.length === 0) return null;

  for (let count = segments.length; count >= 1; count--) {
    const candidate = path.join(baseDir, ...segments.slice(0, count));
    const resolved = tryResolveModule(candidate);
    if (resolved) return resolved;
    if (!allowStrip) break;
  }

  return null;
}

function tryResolveModule(modulePath: string): string | null {
  const direct = `${modulePath}.rs`;
  if (isFile(direct)) return direct;

  const modFile = path.join(modulePath, "mod.rs");
  if (isFile(modFile)) return modFile;

  if (isFile(modulePath)) return modulePath;
  return null;
}

function isFile(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}
