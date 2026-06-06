import fs from "fs";
import path from "path";
import type { Node, Tree } from "web-tree-sitter";
import type { FileEntry, SymbolRef, Range } from "@grail-ai/core";
import { parseFile } from "@grail-ai/core";

const RUBY_EXTENSIONS = new Set([".rb", ".rake", ".gemspec"]);

function isRubyFile(filePath: string): boolean {
  return RUBY_EXTENSIONS.has(path.extname(filePath));
}

// Methods so common they exist on virtually every object — resolving them
// would produce noise, not signal.
const BLACKLISTED_METHODS = new Set([
  "new", "initialize", "to_s", "to_i", "to_f", "to_a", "to_h", "to_r", "to_c",
  "inspect", "class", "is_a?", "kind_of?", "instance_of?", "respond_to?",
  "send", "public_send", "method", "nil?", "present?", "blank?", "freeze",
  "frozen?", "dup", "clone", "tap", "then", "yield_self",
  "each", "map", "collect", "select", "filter", "reject", "reduce", "inject",
  "find", "detect", "flat_map", "collect_concat", "any?", "all?", "none?",
  "count", "size", "length", "empty?", "include?", "min", "max", "sort",
  "sort_by", "group_by", "each_with_object", "each_with_index", "zip",
  "first", "last", "take", "drop", "compact", "flatten", "uniq", "reverse",
  "push", "pop", "shift", "unshift", "delete", "<<", "[]", "[]=",
  "==", "!=", "<=>", "eql?", "equal?", "hash",
  "puts", "print", "p", "pp", "warn", "raise", "fail",
  "require", "require_relative", "include", "extend", "prepend",
  "attr_reader", "attr_writer", "attr_accessor",
  "private", "protected", "public",
]);

interface SymbolDef {
  file: string;       // relative path
  name: string;
  parent?: string;
  kind: string;
  arity?: number;     // parameter count from signature
}

interface AssociationDef {
  name: string;
  target: string;
  collection: boolean;
}

interface CallbackDef {
  name: string;
  owner: string;
  only?: Set<string>;
  except?: Set<string>;
}

interface DelegateDef {
  name: string;
  target: string;
}

interface RailsFacts {
  associations: Map<string, Map<string, AssociationDef>>;
  callbacks: Map<string, CallbackDef[]>;
  delegates: Map<string, Map<string, DelegateDef>>;
  aliases: Map<string, Map<string, string>>;
  superclasses: Map<string, string>;
  scopes: Map<string, Set<string>>;
  relationReturns: Map<string, TypeInfo>;
}

interface TypeInfo {
  className: string;
  collection: boolean;
}

function qualifiedName(parent: string | undefined, name: string): string {
  return parent ? `${parent}::${name}` : name;
}

function normalizeConstantName(name: string): string {
  return name.replace(/^::/, "");
}

function symbolKey(file: string, name: string, parent: string | undefined, kind: string): string {
  const qualified = parent ? `${parent}.${name}` : name;
  return `${file}:${qualified}:${kind}`;
}

/**
 * Build a lookup index: method name → all definitions of that name.
 */
function buildSymbolIndex(
  files: FileEntry[],
  projectRoot: string
): Map<string, SymbolDef[]> {
  const index = new Map<string, SymbolDef[]>();

  for (const { filePath, node } of files) {
    const rel = path.relative(projectRoot, filePath);
    for (const sym of node.symbols) {
      if (sym.kind !== "method" && sym.kind !== "function") continue;

      const arity = extractArity(sym.signature);
      const def: SymbolDef = {
        file: rel,
        name: sym.name,
        parent: sym.parent,
        kind: sym.kind,
        arity,
      };

      const existing = index.get(sym.name);
      if (existing) {
        existing.push(def);
      } else {
        index.set(sym.name, [def]);
      }
    }
  }

  return index;
}

/**
 * Extract parameter count from a Ruby method signature.
 * "def foo(a, b, c)" → 3
 * "def foo" → 0
 * "def foo(*args)" → undefined (variadic)
 */
function extractArity(signature: string): number | undefined {
  const match = signature.match(/\(([^)]*)\)/);
  if (!match) return 0;
  const params = match[1].trim();
  if (!params) return 0;
  // Variadic: can't determine arity
  if (params.includes("*")) return undefined;
  return params.split(",").length;
}

/**
 * Build a map from file:parent.name → symbol for mutation.
 */
function buildSymbolMap(
  files: FileEntry[],
  projectRoot: string
): Map<string, FileEntry["node"]["symbols"][number]> {
  const map = new Map<string, FileEntry["node"]["symbols"][number]>();
  for (const { filePath, node } of files) {
    const rel = path.relative(projectRoot, filePath);
    for (const sym of node.symbols) {
      const key = symbolKey(rel, sym.name, sym.parent, sym.kind);
      map.set(key, sym);
    }
  }
  return map;
}

function buildKnownClassNames(files: FileEntry[]): Set<string> {
  const classNames = new Set<string>();
  for (const { node } of files) {
    for (const sym of node.symbols) {
      if (sym.kind !== "class") continue;
      classNames.add(qualifiedName(sym.parent, sym.name));
    }
  }
  return classNames;
}

function buildRailsFacts(files: FileEntry[]): RailsFacts {
  const facts: RailsFacts = {
    associations: new Map(),
    callbacks: new Map(),
    delegates: new Map(),
    aliases: new Map(),
    superclasses: new Map(),
    scopes: new Map(),
    relationReturns: new Map(),
  };

  const rubyFiles = files.filter(({ filePath }) => isRubyFile(filePath));

  for (const { filePath } of rubyFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const tree = parseFile(filePath, content) as Tree;
    if (!tree) continue;

    collectRailsFacts(tree.rootNode, facts);

    if (typeof (tree as { delete?: () => void }).delete === "function") {
      (tree as { delete: () => void }).delete();
    }
  }

  return facts;
}

function collectRailsFacts(root: Node, facts: RailsFacts): void {
  function walk(node: Node, parent?: string) {
    if (node.type === "class" || node.type === "module") {
      const nameNode = node.childForFieldName("name");
      const bodyNode = node.childForFieldName("body");
      if (nameNode && bodyNode) {
        const className = qualifiedName(parent, nameNode.text);
        if (node.type === "class") {
          const superclass = extractSuperclassName(node, parent);
          if (superclass) {
            facts.superclasses.set(className, superclass);
          }
        }
        walk(bodyNode, className);
      }
      return;
    }

    if (parent && node.type === "call") {
      const methodNode = node.childForFieldName("method");
      if (methodNode) {
        const methodName = methodNode.text;
        if (isAssociationMacro(methodName)) {
          const association = extractAssociation(methodName, node);
          if (association) {
            let ownerAssociations = facts.associations.get(parent);
            if (!ownerAssociations) {
              ownerAssociations = new Map();
              facts.associations.set(parent, ownerAssociations);
            }
            ownerAssociations.set(association.name, association);
          }
        } else if (isControllerCallback(methodName)) {
          const callbacks = extractCallbacks(node, parent);
          if (callbacks.length > 0) {
            const existing = facts.callbacks.get(parent) ?? [];
            facts.callbacks.set(parent, [...existing, ...callbacks]);
          }
        } else if (methodName === "delegate") {
          const delegates = extractDelegates(node);
          if (delegates.length > 0) {
            let ownerDelegates = facts.delegates.get(parent);
            if (!ownerDelegates) {
              ownerDelegates = new Map();
              facts.delegates.set(parent, ownerDelegates);
            }
            for (const delegate of delegates) {
              ownerDelegates.set(delegate.name, delegate);
            }
          }
        } else if (methodName === "alias_method") {
          const aliasDef = extractAliasMethod(node);
          if (aliasDef) {
            let ownerAliases = facts.aliases.get(parent);
            if (!ownerAliases) {
              ownerAliases = new Map();
              facts.aliases.set(parent, ownerAliases);
            }
            ownerAliases.set(aliasDef.aliasName, aliasDef.targetName);
          }
        } else if (methodName === "scope") {
          const [scopeName] = extractSymbolArgs(node);
          if (scopeName) {
            let ownerScopes = facts.scopes.get(parent);
            if (!ownerScopes) {
              ownerScopes = new Set();
              facts.scopes.set(parent, ownerScopes);
            }
            ownerScopes.add(scopeName);
          }
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, parent);
    }
  }

  walk(root);
}

function isAssociationMacro(name: string): boolean {
  return [
    "belongs_to",
    "has_one",
    "has_many",
    "has_and_belongs_to_many",
  ].includes(name);
}

function isControllerCallback(name: string): boolean {
  return [
    "before_action",
    "after_action",
    "around_action",
    "before_filter",
    "after_filter",
    "around_filter",
  ].includes(name);
}

function extractAssociation(macroName: string, node: Node): AssociationDef | null {
  const [name] = extractSymbolArgs(node);
  if (!name) return null;

  const classNameMatch = node.text.match(/class_name:\s*["']([^"']+)["']/);
  const target = classNameMatch
    ? normalizeConstantName(classNameMatch[1])
    : classifyAssociationTarget(name, macroName);

  return {
    name,
    target,
    collection: macroName === "has_many" || macroName === "has_and_belongs_to_many",
  };
}

function extractSymbolArgs(node: Node): string[] {
  const args = node.childForFieldName("arguments");
  if (!args) return [];

  const names: string[] = [];
  for (const arg of args.namedChildren) {
    if (arg.type === "simple_symbol") {
      names.push(arg.text.replace(/^:/, ""));
    }
  }
  return names;
}

function extractSymbolListOption(node: Node, optionName: string): Set<string> | undefined {
  const match = node.text.match(new RegExp(`${optionName}:\\s*(?:%i\\[([^\\]]+)\\]|:([a-zA-Z_][\\w!?=]*)|\\[([^\\]]+)\\])`));
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!raw) return undefined;

  const names = raw.match(/:?[a-zA-Z_][\w!?=]*/g)?.map((name) => name.replace(/^:/, "")) ?? [];
  return names.length > 0 ? new Set(names) : undefined;
}

function extractCallbacks(node: Node, owner: string): CallbackDef[] {
  const only = extractSymbolListOption(node, "only");
  const except = extractSymbolListOption(node, "except");
  return extractSymbolArgs(node).map((name) => ({ name, owner, only, except }));
}

function extractDelegates(node: Node): DelegateDef[] {
  const targetMatch = node.text.match(/to:\s*:([a-zA-Z_][\w!?=]*)/);
  const target = targetMatch?.[1];
  if (!target) return [];

  return extractSymbolArgs(node)
    .filter((name) => name !== target)
    .map((name) => ({ name, target }));
}

function extractAliasMethod(node: Node): { aliasName: string; targetName: string } | null {
  const [aliasName, targetName] = extractSymbolArgs(node);
  if (!aliasName || !targetName) return null;
  return { aliasName, targetName };
}

function extractSuperclassName(node: Node, parent: string | undefined): string | null {
  const superclass = node.childForFieldName("superclass");
  if (!superclass) return null;

  const name = normalizeConstantName(superclass.text.replace(/^<\s*/, "").trim());
  if (!name) return null;
  if (name.includes("::") || !parent) return name;

  return `${parent}::${name}`;
}

function classifyAssociationTarget(name: string, macroName: string): string {
  const singular = macroName === "belongs_to" || macroName === "has_one"
    ? name
    : singularize(name);
  return camelize(singular);
}

function singularize(name: string): string {
  if (name.endsWith("ies")) return `${name.slice(0, -3)}y`;
  if (name.endsWith("ses")) return name.slice(0, -2);
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return name;
}

function camelize(name: string): string {
  return name
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function underscore(name: string): string {
  return name
    .replace(/::/g, "/")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function pluralize(name: string): string {
  if (name.endsWith("y") && !/[aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  if (name.endsWith("s")) return `${name}es`;
  return `${name}s`;
}

function tableize(className: string): string {
  return pluralize(underscore(className.split("::").slice(-1)[0]));
}

function parseSchemaTables(files: FileEntry[]): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const { filePath } of files) {
    if (!filePath.endsWith(path.join("db", "schema.rb"))) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const tableRegex = /^\s*create_table\s+"([^"]+)".*?do\s+\|t\|([\s\S]*?)^\s*end/mg;
    let tableMatch: RegExpExecArray | null;
    while ((tableMatch = tableRegex.exec(content))) {
      const table = tableMatch[1];
      const body = tableMatch[2];
      const columns = tables.get(table) ?? new Set<string>(["id"]);
      const columnRegex = /^\s*t\.\w+\s+"([^"]+)"/mg;
      let columnMatch: RegExpExecArray | null;
      while ((columnMatch = columnRegex.exec(body))) {
        columns.add(columnMatch[1]);
      }
      tables.set(table, columns);
    }
  }
  return tables;
}

function synthesizeRailsSchemaSymbols(files: FileEntry[]): void {
  const tables = parseSchemaTables(files);
  if (tables.size === 0) return;

  for (const { filePath, node } of files) {
    if (!filePath.includes(`${path.sep}app${path.sep}models${path.sep}`)) continue;

    const classes = node.symbols.filter((sym) => sym.kind === "class");
    for (const klass of classes) {
      const className = qualifiedName(klass.parent, klass.name);
      const columns = tables.get(tableize(className));
      if (!columns) continue;

      const existing = new Set(
        node.symbols
          .filter((sym) => sym.parent === className || sym.parent === klass.name)
          .map((sym) => `${sym.kind}:${sym.name}`)
      );

      for (const column of columns) {
        if (existing.has(`method:${column}`)) continue;
        node.symbols.push({
          name: column,
          kind: "method",
          signature: `schema column :${column}`,
          visibility: "public",
          parent: className,
        });
        existing.add(`method:${column}`);
      }
    }
  }
}

function resolveKnownClassName(candidate: string, knownClassNames: Set<string>): string | null {
  if (!candidate) return null;
  if (knownClassNames.has(candidate)) return candidate;

  const exactLocalMatches = [...knownClassNames].filter((className) =>
    className.split("::").slice(-1)[0] === candidate
  );
  if (exactLocalMatches.length === 1) return exactLocalMatches[0];

  const matches = [...knownClassNames].filter((className) => {
    const localName = className.split("::").slice(-1)[0];
    return localName.endsWith(candidate);
  });
  return matches.length === 1 ? matches[0] : null;
}

function inferredParamTypeCandidates(
  paramName: string,
  methodName: string,
  paramIndex: number
): string[] {
  const candidates: string[] = [];

  if (paramName.length > 1 && !["attrs", "params", "options", "kwargs"].includes(paramName)) {
    candidates.push(camelize(singularize(paramName)));
  }

  if (paramIndex === 0) {
    const hint = methodName.match(/^(?:serialize|render|format|build|decorate|present)_(.+)$/)?.[1];
    if (hint) {
      candidates.push(camelize(singularize(hint)));
      const firstToken = hint.split("_")[0];
      if (firstToken && firstToken !== hint) {
        candidates.push(camelize(singularize(firstToken)));
      }
    }
  }

  return candidates;
}

function inferParameterTypes(
  methodName: string,
  paramNames: string[],
  knownClassNames: Set<string>
): Map<string, TypeInfo> {
  const inferred = new Map<string, TypeInfo>();

  paramNames.forEach((paramName, index) => {
    for (const candidate of inferredParamTypeCandidates(paramName, methodName, index)) {
      const className = resolveKnownClassName(candidate, knownClassNames);
      if (className) {
        inferred.set(paramName, { className, collection: false });
        break;
      }
    }
  });

  return inferred;
}

function rangeOf(node: Node): Range {
  return {
    start: { line: node.startPosition.row + 1, column: node.startPosition.column },
    end: { line: node.endPosition.row + 1, column: node.endPosition.column },
  };
}

interface ReceiverInfo {
  text: string;
  kind: "constant" | "self" | "instance_var" | "identifier" | "call";
}

function classifyReceiver(receiver: Node): ReceiverInfo {
  if (receiver.type === "self") {
    return { text: "self", kind: "self" };
  }
  if (receiver.type === "constant" || receiver.type === "scope_resolution") {
    return { text: receiver.text, kind: "constant" };
  }
  if (receiver.type === "instance_variable") {
    return { text: receiver.text, kind: "instance_var" };
  }
  if (receiver.type === "call") {
    return { text: receiver.text.split("\n")[0], kind: "call" };
  }
  return { text: receiver.text, kind: "identifier" };
}

function classNameFromReceiver(receiver: ReceiverInfo): string {
  return normalizeConstantName(receiver.text);
}

function classNameCandidatesFromReceiver(
  receiver: ReceiverInfo,
  currentParent: string | undefined
): string[] {
  const className = classNameFromReceiver(receiver);
  if (receiver.text.startsWith("::") || className.includes("::") || !currentParent) {
    return [className];
  }

  const parts = currentParent.split("::");
  const candidates: string[] = [];
  for (let i = parts.length; i > 0; i--) {
    candidates.push(`${parts.slice(0, i).join("::")}::${className}`);
  }
  candidates.push(className);
  return candidates;
}

function countArgs(node: Node): number {
  const args = node.childForFieldName("arguments");
  if (!args) return 0;
  return args.namedChildren.filter(
    (c) => c.type !== "block_argument"
  ).length;
}

/**
 * Resolve a single call against the symbol index.
 * Returns null if ambiguous or blacklisted.
 */
function resolveCall(
  methodName: string,
  receiver: ReceiverInfo | undefined,
  argCount: number,
  currentParent: string | undefined,
  symbolIndex: Map<string, SymbolDef[]>
): SymbolDef | null {
  const candidates = symbolIndex.get(methodName);
  if (!candidates || candidates.length === 0) return null;

  let matches: SymbolDef[];

  if (receiver) {
    switch (receiver.kind) {
      case "constant": {
        // Constant receivers (User.find) are explicit about their target —
        // don't apply the blacklist since the class narrows the match.
        // User.find → look for method "find" with parent "User".
        const classNames = classNameCandidatesFromReceiver(receiver, currentParent);
        matches = candidates.filter((c) => c.parent && classNames.includes(c.parent));
        const singletonMatches = matches.filter((c) => c.kind === "function");
        if (singletonMatches.length > 0) matches = singletonMatches;
        break;
      }
      case "self": {
        // self.foo → look for method in same class/module
        if (currentParent) {
          matches = candidates.filter((c) => c.parent === currentParent);
        } else {
          matches = candidates.filter((c) => !c.parent);
        }
        break;
      }
      default:
        // identifier, instance_var, call — we can't determine the type
        return null;
    }
  } else {
    // No receiver: apply blacklist for bare method calls
    if (BLACKLISTED_METHODS.has(methodName)) return null;
    // No receiver: implicit self — look in same class first, then top-level
    if (currentParent) {
      matches = candidates.filter((c) => c.parent === currentParent);
      if (matches.length === 0) {
        // Fall back to top-level methods
        matches = candidates.filter((c) => !c.parent);
      }
    } else {
      matches = candidates.filter((c) => !c.parent);
    }
  }

  if (matches.length === 0) return null;
  if (!receiver && matches.length > 1) {
    const methodMatches = matches.filter((m) => m.kind === "method");
    if (methodMatches.length > 0) matches = methodMatches;
  }
  if (matches.length === 1) return matches[0];

  // Multiple matches — try arity disambiguation
  const arityMatches = matches.filter(
    (m) => m.arity === undefined || m.arity === argCount
  );
  if (arityMatches.length === 1) return arityMatches[0];

  // Still ambiguous — skip
  return null;
}

function resolveMethodOnType(
  methodName: string,
  receiverType: TypeInfo,
  argCount: number,
  symbolIndex: Map<string, SymbolDef[]>,
  facts?: RailsFacts
): SymbolDef | null {
  const aliasTarget = facts?.aliases.get(receiverType.className)?.get(methodName);
  if (aliasTarget) {
    const resolvedAlias = resolveMethodOnType(aliasTarget, receiverType, argCount, symbolIndex, facts);
    if (resolvedAlias) return resolvedAlias;
  }

  const candidates = symbolIndex.get(methodName);
  if (!candidates || candidates.length === 0) {
    return resolveDelegatedMethod(methodName, receiverType, argCount, symbolIndex, facts);
  }

  const matches = candidates.filter((c) =>
    c.parent === receiverType.className &&
    (receiverType.collection ? c.kind === "function" : c.kind === "method")
  );
  if (matches.length === 0) {
    return resolveDelegatedMethod(methodName, receiverType, argCount, symbolIndex, facts);
  }
  if (matches.length === 1) return matches[0];

  const arityMatches = matches.filter(
    (m) => m.arity === undefined || m.arity === argCount
  );
  if (arityMatches.length === 1) return arityMatches[0];

  return resolveDelegatedMethod(methodName, receiverType, argCount, symbolIndex, facts);
}

function resolveDelegatedMethod(
  methodName: string,
  receiverType: TypeInfo,
  argCount: number,
  symbolIndex: Map<string, SymbolDef[]>,
  facts?: RailsFacts
): SymbolDef | null {
  const delegate = facts?.delegates.get(receiverType.className)?.get(methodName);
  const association = delegate && facts?.associations.get(receiverType.className)?.get(delegate.target);
  if (!association || association.collection) return null;

  return resolveMethodOnType(
    methodName,
    { className: association.target, collection: false },
    argCount,
    symbolIndex
  );
}

function inferExpressionType(
  node: Node,
  locals: Map<string, TypeInfo>,
  ivars: Map<string, TypeInfo>,
  currentParent: string | undefined,
  facts: RailsFacts
): TypeInfo | null {
  if (node.type === "identifier") {
    return locals.get(node.text) ?? ivars.get(`@${node.text}`) ?? null;
  }
  if (node.type === "instance_variable") return ivars.get(node.text) ?? null;

  if (node.type === "self" && currentParent) {
    return { className: currentParent, collection: false };
  }

  if (node.type === "call") {
    return inferCallReturnType(node, locals, ivars, currentParent, facts);
  }

  return null;
}

function inferCallReturnType(
  node: Node,
  locals: Map<string, TypeInfo>,
  ivars: Map<string, TypeInfo>,
  currentParent: string | undefined,
  facts: RailsFacts
): TypeInfo | null {
  const methodNode = node.childForFieldName("method");
  if (!methodNode) return null;

  const methodName = methodNode.text;
  const receiverNode = node.childForFieldName("receiver");

  if (receiverNode) {
    const receiver = classifyReceiver(receiverNode);
    if (receiver.kind === "constant") {
      const className = classNameFromReceiver(receiver);
      const relationReturn = facts.relationReturns.get(methodKey(className, methodName));
      if (relationReturn) return relationReturn;
      const classReturn = inferActiveRecordClassCall(className, methodName, facts);
      if (classReturn) return classReturn;
    }

    const receiverType = inferExpressionType(receiverNode, locals, ivars, currentParent, facts);
    if (receiverType) {
      return inferTypedReceiverCall(receiverType, methodName, facts);
    }
  } else if (currentParent) {
    const relationReturn = facts.relationReturns.get(methodKey(currentParent, methodName));
    if (relationReturn) return relationReturn;

    const constructorReturn = inferConstructorReturnType(methodName, undefined, currentParent);
    if (constructorReturn) return constructorReturn;

    return inferTypedReceiverCall({ className: currentParent, collection: false }, methodName, facts);
  }

  return null;
}

function inferActiveRecordClassCall(
  className: string,
  methodName: string,
  facts: RailsFacts
): TypeInfo | null {
  if ([
    "find",
    "find_by",
    "find_by!",
    "first",
    "last",
    "take",
    "create",
    "create!",
    "new",
    "build",
    "instantiate",
  ].includes(methodName)) {
    return { className, collection: false };
  }

  if ([
    "all",
    "where",
    "order",
    "reorder",
    "limit",
    "offset",
    "joins",
    "includes",
    "preload",
    "eager_load",
    "references",
  ].includes(methodName)) {
    return { className, collection: true };
  }

  if (facts.scopes.get(className)?.has(methodName)) {
    return { className, collection: true };
  }

  return null;
}

const RELATION_RETURNING_CLASS_METHODS = new Set([
  "all",
  "where",
  "order",
  "reorder",
  "limit",
  "offset",
  "joins",
  "includes",
  "preload",
  "eager_load",
  "references",
  "kept",
  "discarded",
  "with_discarded",
]);

function collectRelationReturnFacts(files: FileEntry[], facts: RailsFacts): void {
  const methodBodies: Array<{ parent: string; name: string; bodyText: string }> = [];

  for (const { filePath } of files.filter(({ filePath }) => isRubyFile(filePath))) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const tree = parseFile(filePath, content) as Tree;
    if (!tree) continue;

    for (const method of findMethods(tree.rootNode)) {
      if (method.kind !== "function" || !method.parent) continue;
      const body = method.node.childForFieldName("body");
      if (!body) continue;
      methodBodies.push({ parent: method.parent, name: method.name, bodyText: body.text });
    }

    if (typeof (tree as { delete?: () => void }).delete === "function") {
      (tree as { delete: () => void }).delete();
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const method of methodBodies) {
      const key = methodKey(method.parent, method.name);
      if (facts.relationReturns.has(key)) continue;

      const inferred = inferRelationReturnFromBody(method.bodyText, method.parent, facts);
      if (inferred) {
        facts.relationReturns.set(key, inferred);
        changed = true;
      }
    }
  }
}

function inferRelationReturnFromBody(
  bodyText: string,
  currentParent: string,
  facts: RailsFacts
): TypeInfo | null {
  const normalized = bodyText.trim();
  if (!normalized) return null;

  const constantChain = normalized.match(/^(?:::)?([A-Z][\w:]*)(?:\s*\.\s*([a-zA-Z_]\w*[!?=]?))/);
  if (constantChain) {
    const className = normalizeConstantName(constantChain[1]);
    const methodName = constantChain[2];
    if (
      RELATION_RETURNING_CLASS_METHODS.has(methodName) ||
      facts.scopes.get(className)?.has(methodName) ||
      facts.relationReturns.has(methodKey(className, methodName))
    ) {
      return { className, collection: true };
    }
  }

  const helperChain = normalized.match(/^([a-zA-Z_]\w*[!?=]?)(?:\s*\.\s*[a-zA-Z_]\w*[!?=]?)/);
  if (helperChain) {
    const helperName = helperChain[1];
    const helperReturn = facts.relationReturns.get(methodKey(currentParent, helperName));
    if (helperReturn?.collection) return helperReturn;
  }

  return null;
}

function inferConstructorReturnType(
  methodName: string,
  receiver: ReceiverInfo | undefined,
  currentParent: string | undefined
): TypeInfo | null {
  if (methodName !== "new") return null;

  if (receiver?.kind === "constant") {
    return { className: classNameFromReceiver(receiver), collection: false };
  }

  if (!receiver && currentParent) {
    return { className: currentParent, collection: false };
  }

  return null;
}

function inferTypedReceiverCall(
  receiverType: TypeInfo,
  methodName: string,
  facts: RailsFacts
): TypeInfo | null {
  if (receiverType.collection) {
    if (facts.scopes.get(receiverType.className)?.has(methodName)) {
      return receiverType;
    }
    if (["first", "last", "take", "find", "find_by", "find_by!"].includes(methodName)) {
      return { className: receiverType.className, collection: false };
    }
    if ([
      "where",
      "order",
      "reorder",
      "limit",
      "offset",
      "joins",
      "includes",
      "preload",
      "eager_load",
      "references",
    ].includes(methodName)) {
      return receiverType;
    }
    return null;
  }

  const ownerAssociations = facts.associations.get(receiverType.className);
  const association = ownerAssociations?.get(methodName);
  if (association) {
    return { className: association.target, collection: association.collection };
  }

  return null;
}

function learnAssignmentType(
  node: Node,
  locals: Map<string, TypeInfo>,
  ivars: Map<string, TypeInfo>,
  currentParent: string | undefined,
  facts: RailsFacts
): void {
  const left = node.childForFieldName("left");
  const right = node.childForFieldName("right");
  if (!left || !right) return;

  const inferred = inferExpressionType(right, locals, ivars, currentParent, facts);
  if (!inferred) return;

  if (left.type === "identifier") {
    locals.set(left.text, inferred);
  } else if (left.type === "instance_variable") {
    ivars.set(left.text, inferred);
  }
}

function collectIvarAssignments(
  body: Node,
  currentParent: string | undefined,
  facts: RailsFacts,
  initialLocals: Map<string, TypeInfo> = new Map()
): Map<string, TypeInfo> {
  const locals = new Map<string, TypeInfo>(initialLocals);
  const ivars = new Map<string, TypeInfo>();

  function walk(node: Node) {
    if (node.type === "assignment") {
      learnAssignmentType(node, locals, ivars, currentParent, facts);
    }

    if (node.type === "class" || node.type === "module") return;

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }

  walk(body);
  return ivars;
}

/**
 * Walk a method body and extract all call nodes, resolving each against
 * the symbol index.
 */
function extractCallsFromBody(
  body: Node,
  currentParent: string | undefined,
  symbolIndex: Map<string, SymbolDef[]>,
  paramNames: Set<string>,
  facts: RailsFacts,
  initialIvars: Map<string, TypeInfo> = new Map(),
  initialLocals: Map<string, TypeInfo> = new Map()
): SymbolRef[] {
  const calls: SymbolRef[] = [];
  const seen = new Set<string>();
  const locals = new Map<string, TypeInfo>(initialLocals);
  const ivars = new Map<string, TypeInfo>(initialIvars);

  function tryResolveAndRecord(
    methodName: string,
    receiver: ReceiverInfo | undefined,
    argCount: number,
    callNode: Node,
    receiverNode?: Node
  ) {
    let resolved: SymbolDef | null = null;

    if (receiverNode) {
      const receiverType =
        inferExpressionType(receiverNode, locals, ivars, currentParent, facts) ??
        inferConstructorReturnType(methodName, receiver, currentParent);
      if (receiverType) {
        resolved = resolveMethodOnType(methodName, receiverType, argCount, symbolIndex, facts);
      }
    }

    if (!resolved) {
      resolved = resolveCall(methodName, receiver, argCount, currentParent, symbolIndex);
    }
    if (!resolved && currentParent) {
      const aliasTarget = facts.aliases.get(currentParent)?.get(methodName);
      if (aliasTarget) {
        resolved = resolveCall(aliasTarget, receiver, argCount, currentParent, symbolIndex);
      }
    }
    if (!resolved) return;

    const callKey = resolved.parent
      ? `${resolved.file}:${resolved.parent}.${resolved.name}:${resolved.kind}`
      : `${resolved.file}:${resolved.name}:${resolved.kind}`;

    if (!seen.has(callKey)) {
      seen.add(callKey);
      calls.push({
        file: resolved.file,
        name: resolved.name,
        kind: resolved.kind === "function" ? "function" : "method",
        parent: resolved.parent,
        range: rangeOf(callNode),
        context: callNode.text.split("\n")[0],
      });
    }
  }

  function walk(node: Node) {
    if (node.type === "assignment") {
      learnAssignmentType(node, locals, ivars, currentParent, facts);
    }

    if (node.type === "call") {
      const methodNode = node.childForFieldName("method");
      if (methodNode) {
        const receiverNode = node.childForFieldName("receiver");
        const receiver = receiverNode ? classifyReceiver(receiverNode) : undefined;
        tryResolveAndRecord(methodNode.text, receiver, countArgs(node), node, receiverNode ?? undefined);
      }
    }

    // Bare identifiers in method bodies: `helper` without parens or receiver.
    // Ruby parses these as identifiers, not calls. If the identifier matches
    // a known method in the symbol index, treat it as an implicit-self call.
    if (node.type === "identifier" && node.parent?.type !== "call") {
      // Exclude identifiers that are part of other constructs
      const parentType = node.parent?.type;
      if (
        parentType !== "method" &&           // method name in def
        parentType !== "assignment" &&        // left side of assignment
        parentType !== "method_parameters" && // parameter list
        parentType !== "block_parameters" &&  // block parameter
        parentType !== "class" &&             // class name
        parentType !== "module" &&            // module name
        !paramNames.has(node.text)            // parameter reference, not a call
      ) {
        tryResolveAndRecord(node.text, undefined, 0, node);
      }
    }

    // Don't descend into nested class/module definitions — those are
    // separate scopes with their own methods
    if (node.type === "class" || node.type === "module") return;

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }

  walk(body);
  return calls;
}

function callbackCallsForMethod(
  currentParent: string | undefined,
  currentMethod: string,
  symbolIndex: Map<string, SymbolDef[]>,
  facts: RailsFacts,
  contextNode: Node
): SymbolRef[] {
  if (!currentParent) return [];

  const callbacks = callbacksForClass(currentParent, facts);
  if (!callbacks || callbacks.length === 0) return [];

  const calls: SymbolRef[] = [];
  const seen = new Set<string>();

  for (const callback of callbacks) {
    if (!callbackAppliesToMethod(callback, currentMethod)) continue;

    const resolved = resolveCall(
      callback.name,
      undefined,
      0,
      callback.owner,
      symbolIndex
    );
    if (!resolved) continue;

    const callKey = resolved.parent
      ? `${resolved.file}:${resolved.parent}.${resolved.name}:${resolved.kind}`
      : `${resolved.file}:${resolved.name}:${resolved.kind}`;

    if (seen.has(callKey)) continue;
    seen.add(callKey);

    calls.push({
      file: resolved.file,
      name: resolved.name,
      kind: resolved.kind === "function" ? "function" : "method",
      parent: resolved.parent,
      range: rangeOf(contextNode),
      context: `before_action :${callback.name}`,
    });
  }

  return calls;
}

function callbackAppliesToMethod(callback: CallbackDef, methodName: string): boolean {
  if (callback.name === methodName) return false;
  if (callback.only && !callback.only.has(methodName)) return false;
  if (callback.except?.has(methodName)) return false;
  return true;
}

function callbacksForClass(currentParent: string | undefined, facts: RailsFacts): CallbackDef[] {
  if (!currentParent) return [];

  const callbacks: CallbackDef[] = [];
  const seenClasses = new Set<string>();
  const lineage: string[] = [];
  let cursor: string | undefined = currentParent;

  while (cursor && !seenClasses.has(cursor)) {
    seenClasses.add(cursor);
    lineage.push(cursor);
    cursor = facts.superclasses.get(cursor);
  }

  for (const klass of lineage.reverse()) {
    callbacks.push(...(facts.callbacks.get(klass) ?? []));
  }

  return callbacks;
}

function dedupeCalls(calls: SymbolRef[]): SymbolRef[] {
  const seen = new Set<string>();
  const deduped: SymbolRef[] = [];

  for (const call of calls) {
    const key = call.parent
      ? `${call.file}:${call.parent}.${call.name}:${call.kind ?? ""}`
      : `${call.file}:${call.name}:${call.kind ?? ""}`;

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(call);
  }

  return deduped;
}

function methodKey(parent: string | undefined, name: string): string {
  return parent ? `${parent}.${name}` : name;
}

function callbackIvarTypesForMethod(
  currentParent: string | undefined,
  currentMethod: string,
  facts: RailsFacts,
  methodIvarTypes: Map<string, Map<string, TypeInfo>>
): Map<string, TypeInfo> {
  const ivars = new Map<string, TypeInfo>();
  if (!currentParent) return ivars;

  const callbacks = callbacksForClass(currentParent, facts);
  if (!callbacks || callbacks.length === 0) return ivars;

  for (const callback of callbacks) {
    if (!callbackAppliesToMethod(callback, currentMethod)) continue;

    const callbackTypes = methodIvarTypes.get(methodKey(callback.owner, callback.name));
    if (!callbackTypes) continue;

    for (const [name, type] of callbackTypes.entries()) {
      ivars.set(name, type);
    }
  }

  return ivars;
}

function isNoArgModuleFunctionCall(node: Node): boolean {
  if (node.type === "identifier" && node.text === "module_function") return true;
  if (node.type !== "call") return false;
  const method = node.childForFieldName("method");
  if (method?.text !== "module_function") return false;
  const args = node.childForFieldName("arguments");
  return !args || args.namedChildCount === 0;
}

/**
 * Find all method/singleton_method nodes in a file and return them
 * with their enclosing class/module name.
 */
function findMethods(
  root: Node
): Array<{ node: Node; name: string; parent?: string; kind: "method" | "function" }> {
  const methods: Array<{ node: Node; name: string; parent?: string; kind: "method" | "function" }> = [];

  function walkBody(body: Node, parent?: string) {
    let moduleFunctionActive = false;
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      if (isNoArgModuleFunctionCall(child)) {
        moduleFunctionActive = true;
        continue;
      }
      walk(child, parent, moduleFunctionActive);
    }
  }

  function walk(node: Node, parent?: string, moduleFunctionActive = false) {
    if (node.type === "method" || node.type === "singleton_method") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        methods.push({
          node,
          name: nameNode.text,
          parent,
          kind: node.type === "singleton_method" ? "function" : "method",
        });
        if (node.type === "method" && moduleFunctionActive) {
          methods.push({
            node,
            name: nameNode.text,
            parent,
            kind: "function",
          });
        }
      }
      return; // Don't descend into method bodies for more method defs
    }

    if (node.type === "class" || node.type === "module") {
      const nameNode = node.childForFieldName("name");
      const bodyNode = node.childForFieldName("body");
      if (nameNode && bodyNode) {
        walkBody(bodyNode, qualifiedName(parent, nameNode.text));
      }
      return;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, parent, moduleFunctionActive);
    }
  }

  walk(root);
  return methods;
}

function paramNamesForMethod(methodNode: Node): string[] {
  const names: string[] = [];
  const params = methodNode.childForFieldName("parameters");
  if (!params) return names;

  for (const child of params.namedChildren) {
    const nameNode = child.childForFieldName("name") ?? child;
    if (nameNode.type === "identifier") {
      names.push(nameNode.text);
    }
  }

  return names;
}

export async function buildRubyCallGraph(
  projectRoot: string,
  files: FileEntry[]
): Promise<void> {
  synthesizeRailsSchemaSymbols(files);
  const symbolIndex = buildSymbolIndex(files, projectRoot);
  const symbolMap = buildSymbolMap(files, projectRoot);
  const knownClassNames = buildKnownClassNames(files);
  const railsFacts = buildRailsFacts(files);
  collectRelationReturnFacts(files, railsFacts);

  const rubyFiles = files.filter(({ filePath }) => isRubyFile(filePath));

  for (const { filePath } of rubyFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const tree = parseFile(filePath, content) as Tree;
    if (!tree) continue;

    const rel = path.relative(projectRoot, filePath);
    const methods = findMethods(tree.rootNode);
    const methodIvarTypes = new Map<string, Map<string, TypeInfo>>();

    for (const { node: methodNode, name: funcName, parent: containerName } of methods) {
      const body = methodNode.childForFieldName("body");
      if (!body) continue;
      const paramNameList = paramNamesForMethod(methodNode);
      methodIvarTypes.set(
        methodKey(containerName, funcName),
        collectIvarAssignments(
          body,
          containerName,
          railsFacts,
          inferParameterTypes(funcName, paramNameList, knownClassNames)
        )
      );
    }

    for (const { node: methodNode, name: funcName, parent: containerName, kind } of methods) {
      const key = symbolKey(rel, funcName, containerName, kind);
      const sym = symbolMap.get(key);
      if (!sym) continue;

      const body = methodNode.childForFieldName("body");
      if (!body) continue;

      // Collect parameter names to avoid treating them as method calls
      const paramNameList = paramNamesForMethod(methodNode);
      const paramNames = new Set(paramNameList);
      const initialIvars = new Map<string, TypeInfo>();
      if (kind === "method" && funcName !== "initialize") {
        const constructorIvars = methodIvarTypes.get(methodKey(containerName, "initialize"));
        if (constructorIvars) {
          for (const [name, type] of constructorIvars.entries()) {
            initialIvars.set(name, type);
          }
        }
      }
      for (const [name, type] of callbackIvarTypesForMethod(containerName, funcName, railsFacts, methodIvarTypes)) {
        initialIvars.set(name, type);
      }

      const calls = dedupeCalls([
        ...callbackCallsForMethod(containerName, funcName, symbolIndex, railsFacts, methodNode),
        ...extractCallsFromBody(
          body,
          containerName,
          symbolIndex,
          paramNames,
          railsFacts,
          initialIvars,
          inferParameterTypes(funcName, paramNameList, knownClassNames)
        ),
      ]);
      if (calls.length > 0) {
        sym.calls = calls;
      }
    }

    if (typeof (tree as { delete?: () => void }).delete === "function") {
      (tree as { delete: () => void }).delete();
    }
  }
}
