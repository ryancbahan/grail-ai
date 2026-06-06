import fs from "fs";
import path from "path";
import type { Node, Tree } from "web-tree-sitter";
import type { FileEntry, Range, SymbolRef } from "@grail-ai/core";
import { parseFile } from "@grail-ai/core";

interface Scope {
  name: string;
  kind: "module" | "type" | "trait";
}

interface FunctionNode {
  node: Node;
  name: string;
  parent?: string;
  kind: "function" | "method";
}

interface SymbolDef extends SymbolRef {
  file: string;
  name: string;
}

const RUST_EXTENSIONS = new Set([".rs"]);
const NOISE_CALLS = new Set([
  "assert", "assert_eq", "assert_ne", "cfg", "clone", "dbg", "debug_assert",
  "debug_assert_eq", "debug_assert_ne", "default", "drop", "eprintln", "eq",
  "expect", "format", "include", "include_str", "include_bytes", "into",
  "len", "new", "ok", "panic", "print", "println", "some", "to_string",
  "unwrap", "vec", "write", "writeln",
]);

export async function buildRustCallGraph(
  projectRoot: string,
  files: FileEntry[]
): Promise<void> {
  const symbolIndex = buildSymbolIndex(files, projectRoot);
  const rustFiles = files.filter(({ filePath }) => RUST_EXTENSIONS.has(path.extname(filePath)));

  for (const { filePath, node: fileNode } of rustFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const tree = parseFile(filePath, content) as Tree;
    if (!tree) continue;

    const rel = path.relative(projectRoot, filePath);
    const functions = findFunctions(tree.rootNode);

    for (const fn of functions) {
      const sym = fileNode.symbols.find((candidate) =>
        candidate.name === fn.name &&
        candidate.parent === fn.parent &&
        candidate.kind === fn.kind
      );
      if (!sym) continue;

      const body = fn.node.childForFieldName("body");
      if (!body) continue;

      sym.calls = collectCalls(body, rel, fn, symbolIndex);
    }

    if (typeof (tree as { delete?: () => void }).delete === "function") {
      (tree as { delete: () => void }).delete();
    }
  }
}

function buildSymbolIndex(files: FileEntry[], projectRoot: string) {
  const byName = new Map<string, SymbolDef[]>();
  const byParentAndName = new Map<string, SymbolDef[]>();
  const byModulePathAndName = new Map<string, SymbolDef[]>();

  for (const { filePath, node } of files) {
    if (!RUST_EXTENSIONS.has(path.extname(filePath))) continue;
    const rel = path.relative(projectRoot, filePath);
    const modulePath = moduleNameFromFile(rel);

    for (const sym of node.symbols) {
      const def: SymbolDef = {
        file: rel,
        name: sym.name,
        kind: sym.kind,
        parent: sym.parent,
        signature: sym.signature,
        visibility: sym.visibility,
        range: sym.range,
      };
      push(byName, sym.name, def);
      if (sym.parent) push(byParentAndName, `${sym.parent}.${sym.name}`, def);
      if (modulePath) push(byModulePathAndName, `${modulePath}.${sym.name}`, def);
    }
  }

  return { byName, byParentAndName, byModulePathAndName };
}

function findFunctions(root: Node): FunctionNode[] {
  const functions: FunctionNode[] = [];

  function walk(node: Node, scope?: Scope) {
    if (node.type === "mod_item") {
      const name = node.childForFieldName("name");
      const body = node.childForFieldName("body");
      if (name && body) {
        walk(body, { name: qualify(scope, name.text), kind: "module" });
      }
      return;
    }

    if (node.type === "trait_item") {
      const name = node.childForFieldName("name");
      const body = node.childForFieldName("body");
      if (name && body) {
        walk(body, { name: qualify(scope, name.text), kind: "trait" });
      }
      return;
    }

    if (node.type === "impl_item") {
      const typeNode = node.childForFieldName("type");
      const body = node.childForFieldName("body");
      if (typeNode && body) {
        walk(body, { name: qualify(scope, typeNode.text), kind: "type" });
      }
      return;
    }

    if (node.type === "function_item") {
      const name = node.childForFieldName("name");
      if (name) {
        functions.push({
          node,
          name: name.text,
          parent: scope?.name,
          kind: scope?.kind === "type" || scope?.kind === "trait" ? "method" : "function",
        });
      }
      return;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, scope);
    }
  }

  walk(root);
  return functions;
}

function collectCalls(
  body: Node,
  currentFile: string,
  currentFunction: FunctionNode,
  index: ReturnType<typeof buildSymbolIndex>
): SymbolRef[] {
  const calls: SymbolRef[] = [];
  const seen = new Set<string>();

  walk(body, (node) => {
    const ref = resolveCallNode(node, currentFile, currentFunction, index);
    if (!ref) return;

    const key = `${ref.file}:${ref.parent ?? ""}:${ref.kind ?? ""}:${ref.name}:${ref.range?.start.line ?? ""}:${ref.range?.start.column ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      calls.push(ref);
    }
  });

  return calls;
}

function resolveCallNode(
  node: Node,
  currentFile: string,
  currentFunction: FunctionNode,
  index: ReturnType<typeof buildSymbolIndex>
): SymbolRef | null {
  if (node.type === "macro_invocation") {
    const macro = node.childForFieldName("macro");
    if (!macro || NOISE_CALLS.has(macro.text)) return null;
    return defToRef(first(index.byName.get(macro.text)), node);
  }

  if (node.type !== "call_expression") return null;
  const fn = node.childForFieldName("function");
  if (!fn) return null;

  if (fn.type === "identifier") {
    if (NOISE_CALLS.has(fn.text)) return null;
    return (
      resolveSameModule(fn.text, currentFile, currentFunction, index, node) ??
      defToRef(unique(index.byName.get(fn.text)), node)
    );
  }

  if (fn.type === "field_expression") {
    const field = fn.childForFieldName("field");
    if (!field || NOISE_CALLS.has(field.text)) return null;
    const value = fn.childForFieldName("value");
    if (value?.text === "self" && currentFunction.parent) {
      return defToRef(first(index.byParentAndName.get(`${currentFunction.parent}.${field.text}`)), node);
    }
    return defToRef(unique(index.byName.get(field.text)), node);
  }

  if (fn.type === "scoped_identifier") {
    const parts = pathParts(fn.text);
    const name = parts[parts.length - 1];
    if (!name || NOISE_CALLS.has(name)) return null;

    const parent = parts.slice(0, -1).filter((part) => !["crate", "self", "super"].includes(part)).join("::");
    if (parent) {
      return (
        defToRef(first(index.byParentAndName.get(`${parent}.${name}`)), node) ??
        defToRef(first(index.byModulePathAndName.get(`${parent}.${name}`)), node)
      );
    }

    return defToRef(unique(index.byName.get(name)), node);
  }

  return null;
}

function resolveSameModule(
  name: string,
  currentFile: string,
  currentFunction: FunctionNode,
  index: ReturnType<typeof buildSymbolIndex>,
  callNode: Node
): SymbolRef | null {
  if (currentFunction.parent) {
    const parentHit = first(index.byParentAndName.get(`${currentFunction.parent}.${name}`));
    if (parentHit) return defToRef(parentHit, callNode);
  }

  const modulePath = moduleNameFromFile(currentFile);
  if (modulePath) {
    const moduleHit = first(index.byModulePathAndName.get(`${modulePath}.${name}`));
    if (moduleHit) return defToRef(moduleHit, callNode);
  }

  return null;
}

function defToRef(def: SymbolDef | undefined, callNode: Node): SymbolRef | null {
  if (!def) return null;
  return {
    file: def.file,
    name: def.name,
    kind: def.kind,
    parent: def.parent,
    signature: def.signature,
    visibility: def.visibility,
    range: rangeOf(callNode),
    context: callNode.text,
  };
}

function rangeOf(node: Node): Range {
  return {
    start: { line: node.startPosition.row + 1, column: node.startPosition.column },
    end: { line: node.endPosition.row + 1, column: node.endPosition.column },
  };
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, visit);
  }
}

function pathParts(text: string): string[] {
  return text.split("::").map((part) => part.trim()).filter(Boolean);
}

function moduleNameFromFile(relPath: string): string | undefined {
  const withoutExt = relPath.replace(/\.rs$/, "");
  const parts = withoutExt.split(path.sep).filter(Boolean);
  if (parts[0] === "src") parts.shift();
  if (parts[parts.length - 1] === "mod" || parts[parts.length - 1] === "lib" || parts[parts.length - 1] === "main") {
    parts.pop();
  }
  return parts.length > 0 ? parts.join("::") : undefined;
}

function qualify(scope: Scope | undefined, name: string): string {
  if (!scope || name.includes("::")) return name;
  return scope.kind === "module" ? `${scope.name}::${name}` : name;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function first<T>(items: T[] | undefined): T | undefined {
  return items?.[0];
}

function unique<T>(items: T[] | undefined): T | undefined {
  return items && items.length === 1 ? items[0] : undefined;
}
