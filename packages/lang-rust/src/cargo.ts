import fs from "fs";
import path from "path";

export interface CargoPackage {
  root: string;
  sourceRoot: string;
  crateName: string;
}

export function packageForFile(filePath: string, projectRoot: string): CargoPackage {
  const start = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? filePath
    : path.dirname(filePath);
  const root = findCargoRoot(start, projectRoot) ?? projectRoot;
  return packageFromRoot(root);
}

export function packageFromRoot(root: string): CargoPackage {
  const manifest = path.join(root, "Cargo.toml");
  const packageName = isFile(manifest)
    ? parsePackageName(fs.readFileSync(manifest, "utf-8")) ?? path.basename(root)
    : path.basename(root);
  const sourceRoot = sourceRootForPackage(root);
  return { root, sourceRoot, crateName: rustCrateName(packageName) };
}

export function workspacePackages(projectRoot: string): Map<string, CargoPackage> {
  const packages = new Map<string, CargoPackage>();
  const rootManifest = path.join(projectRoot, "Cargo.toml");

  if (isFile(rootManifest)) {
    const rootPackage = packageFromRoot(projectRoot);
    packages.set(rootPackage.crateName, rootPackage);

    const content = fs.readFileSync(rootManifest, "utf-8");
    for (const member of parseWorkspaceMembers(content)) {
      for (const memberRoot of expandMember(projectRoot, member)) {
        const manifest = path.join(memberRoot, "Cargo.toml");
        if (!isFile(manifest)) continue;
        const pkg = packageFromRoot(memberRoot);
        packages.set(pkg.crateName, pkg);
      }
    }
  }

  return packages;
}

export function modulePathForFile(filePath: string, projectRoot: string): string | undefined {
  const pkg = packageForFile(filePath, projectRoot);
  const relative = path.relative(pkg.sourceRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;

  const withoutExt = relative.replace(/\.rs$/, "");
  const parts = withoutExt.split(path.sep).filter(Boolean);
  if (parts[parts.length - 1] === "mod" || parts[parts.length - 1] === "lib" || parts[parts.length - 1] === "main") {
    parts.pop();
  }

  return parts.length > 0 ? parts.join("::") : undefined;
}

export function crateEntryFile(pkg: CargoPackage): string | null {
  const lib = path.join(pkg.sourceRoot, "lib.rs");
  if (isFile(lib)) return lib;
  const main = path.join(pkg.sourceRoot, "main.rs");
  if (isFile(main)) return main;
  const mod = path.join(pkg.sourceRoot, "mod.rs");
  if (isFile(mod)) return mod;
  return null;
}

function findCargoRoot(start: string, projectRoot: string): string | null {
  let dir = path.resolve(start);
  const stop = path.resolve(projectRoot);

  while (dir.startsWith(stop)) {
    if (isFile(path.join(dir, "Cargo.toml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

function sourceRootForPackage(root: string): string {
  const src = path.join(root, "src");
  return fs.existsSync(src) && fs.statSync(src).isDirectory() ? src : root;
}

function rustCrateName(packageName: string): string {
  return packageName.replace(/-/g, "_");
}

function parsePackageName(content: string): string | null {
  const packageSection = section(content, "package");
  const match = packageSection.match(/^\s*name\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}

function parseWorkspaceMembers(content: string): string[] {
  const workspaceSection = section(content, "workspace");
  const match = workspaceSection.match(/^\s*members\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) return [];

  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function section(content: string, name: string): string {
  const match = content.match(new RegExp(`^\\s*\\[${name.replace(".", "\\.")}\\]\\s*$`, "m"));
  if (!match || match.index === undefined) return "";

  const rest = content.slice(match.index + match[0].length);
  const next = rest.search(/^\s*\[[^\]]+\]\s*$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function expandMember(projectRoot: string, member: string): string[] {
  if (!member.includes("*")) return [path.resolve(projectRoot, member)];

  const beforeStar = member.slice(0, member.indexOf("*"));
  const afterStar = member.slice(member.indexOf("*") + 1);
  const base = path.resolve(projectRoot, beforeStar);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return [];

  return fs.readdirSync(base)
    .map((entry) => path.join(base, entry, afterStar))
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
}

function isFile(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}
