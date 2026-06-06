import fs from "fs";
import path from "path";
import type { ResolveContext } from "@grail-ai/core";
import { crateEntryFile, packageForFile, workspacePackages } from "./cargo";

const EXTERNAL_CRATES = new Set(["std", "core", "alloc", "proc_macro", "test"]);

export function resolveRustImport(specifier: string, context: ResolveContext): string | null {
  const normalized = normalizeSpecifier(specifier);
  if (!normalized) return null;

  const segments = normalized.split("::").filter(Boolean);
  if (segments.length === 0) return null;
  if (EXTERNAL_CRATES.has(segments[0])) return null;

  const currentPackage = packageForFile(context.containingFile, context.projectRoot);
  const crateRoot = currentPackage.sourceRoot;
  const containingDir = path.dirname(context.containingFile);
  const workspaceCrate = workspacePackages(context.projectRoot).get(segments[0]);

  if (workspaceCrate) {
    if (segments.length === 1) return crateEntryFile(workspaceCrate);
    return resolveModulePath(workspaceCrate.sourceRoot, segments.slice(1), true);
  }

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

export function isRustExternalImport(specifier: string, context: ResolveContext): boolean {
  const normalized = normalizeSpecifier(specifier);
  if (!normalized) return false;

  const segments = normalized.split("::").filter(Boolean);
  if (segments.length === 0) return false;
  if (EXTERNAL_CRATES.has(segments[0])) return false;
  if (["crate", "self", "super"].includes(segments[0])) return false;
  if (workspacePackages(context.projectRoot).has(segments[0])) return false;
  return true;
}

export function rustExternalPackageName(specifier: string): string {
  const normalized = normalizeSpecifier(specifier);
  return normalized.split("::").filter(Boolean)[0] ?? specifier;
}

function normalizeSpecifier(specifier: string): string {
  return specifier
    .replace(/\s+as\s+\w+$/g, "")
    .replace(/\s+/g, "")
    .replace(/;$/, "")
    .replace(/::\{.*$/, "")
    .replace(/::\*$/, "");
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
