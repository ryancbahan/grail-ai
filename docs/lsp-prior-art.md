# LSP Prior Art for Grail

An exploration of four ideas from language server tooling, incremental computation research, and code intelligence systems that could make grail better for agents and humans. Each section grounds the idea in existing work, then maps it concretely onto grail's current architecture.

---

## 1. Position/Range as a First-Class Primitive

### The idea

Replace grail's optional `line?`/`endLine?` integers with a structured `Range` type that captures start and end positions with column precision. Make it non-optional on every symbol, reference, and import.

### Prior art

**LSP specification (§3.15)**. The protocol defines two foundational types:

```
Position { line: uint, character: uint }
Range    { start: Position, end: Position }
```

Every LSP feature — hover, go-to-definition, find-references, rename, diagnostics, code actions — operates on ranges. This isn't accidental. The LSP authors (the VS Code team at Microsoft) found that line-only positioning was insufficient for three reasons: (1) multiple symbols can share a line, (2) agents/editors need to highlight the exact span, and (3) edits require precise insertion points.

**Tree-sitter**. Every node in a tree-sitter CST carries `startPosition { row, column }` and `endPosition { row, column }`, plus byte offsets (`startIndex`, `endIndex`). Grail already parses with tree-sitter — this data is available and currently discarded.

**Semantic tokenization (LSP §3.16.11)**. LSP encodes token positions as *deltas* — each token's position is expressed relative to the previous token. This compresses the position data significantly. Relevant if grail ever needs to transmit large symbol lists efficiently.

**Kythe** (Google's cross-language indexing system). Kythe uses a `VName` (a 5-tuple of corpus, root, path, language, signature) to identify every semantic node, and anchors them to byte-offset spans in source files. The span is the primary key for linking definitions to references across languages. The lesson: byte offsets are more stable than line/column for internal storage, but line/column is better for human-facing output. Consider storing both.

### What grail has today

```typescript
// types.ts
interface Symbol {
  line?: number;       // optional, no column
  endLine?: number;    // optional, no column
}
interface SymbolRef {
  line?: number;       // single line, optional
}
```

`parseJavaScriptSymbols` (lang-javascript/src/symbols.ts) reads `node.startPosition.row` and `node.endPosition.row` from tree-sitter but discards the column. `SymbolRef` (used in call graphs) stores only the call site line, not the range of the call expression.

### Proposed change

```typescript
interface Position {
  line: number;       // 1-indexed (matches editor conventions)
  column: number;     // 0-indexed (matches tree-sitter)
}

interface Range {
  start: Position;
  end: Position;
}

interface Symbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  visibility: SymbolVisibility;
  range: Range;              // required, not optional
  nameRange: Range;          // the identifier itself (for rename-like operations)
  parent?: string;
  calls?: SymbolRef[];
}

interface SymbolRef {
  file: string;
  name: string;
  range: Range;              // where the reference occurs
  // ...existing fields
}

interface Import {
  // ...existing fields
  range: Range;              // the import statement span
}
```

### What this unlocks

**Point queries**. Given a cursor position (e.g. from grep output, an error stack trace, or an agent's current focus), answer "what symbol contains this position?" This is what LSP's `textDocument/hover` does internally. Grail's `readSymbol` currently requires knowing the symbol name; with ranges, you could query by position alone.

**Disambiguation**. Two symbols named `handle` on different lines of the same file are currently ambiguous. With ranges, they're distinct.

**Precise call sites**. When `callersOf` reports that function A calls function B, the `range` on the `SymbolRef` tells you *exactly where* in A the call happens — not just "somewhere on line 47."

**Edit operations (future)**. If grail ever supports rename-refactoring or code modification, ranges are prerequisites. The `nameRange` field (the identifier span, not the full declaration) is specifically what LSP uses for `textDocument/rename`.

### Cost

Minimal. The data already exists in tree-sitter nodes. The change is about preserving it through the pipeline instead of discarding it. JSON output gets slightly larger but remains compact (4 numbers per range vs. 1-2 optional numbers today).

---

## 2. A Diagnostic Framework

### The idea

Add a typed `Diagnostic` structure and a registry of analysis passes that emit diagnostics. This turns grail from a pure structural extractor into an extensible analysis engine that can surface insights about the codebase — not just describe it.

### Prior art

**LSP `textDocument/publishDiagnostics`**. The protocol defines:

```
Diagnostic {
  range: Range,
  severity: Error | Warning | Information | Hint,
  code?: string | number,
  source?: string,
  message: string,
  relatedInformation?: DiagnosticRelatedInformation[]
}
```

The `relatedInformation` field is particularly interesting — it lets a diagnostic point to multiple locations. A circular dependency diagnostic could point to each file in the cycle.

**ESLint's rule architecture**. ESLint separates *parsing* from *analysis*. Rules are pure functions that receive an AST and a `context` object, and call `context.report({ node, message })` to emit diagnostics. Rules are composable, independently toggleable, and can be contributed by plugins. The key design insight: the diagnostic framework is more valuable than any individual diagnostic.

**Semgrep**. Takes this further with a pattern-matching DSL that operates over ASTs across languages. Semgrep rules are declarative YAML that specify AST patterns to match and diagnostics to emit. Relevant to grail because grail already has cross-file structural data that Semgrep doesn't — dependency graphs, call graphs, and visibility information.

**GCC/Clang diagnostic groups**. Compilers organize diagnostics into groups (`-Wunused`, `-Wdeprecated`) that can be enabled/disabled. Each diagnostic has a unique code (e.g. `-Wunused-variable`). This lets users tune signal vs. noise without forking the tool.

**Sorbet (Stripe's Ruby type checker)**. Sorbet's error system uses error codes, severity levels, and "autocorrect" suggestions attached to diagnostics. The autocorrect model (a diagnostic can carry a suggested fix) is powerful for agent consumers — the agent can apply the fix without understanding the underlying analysis.

### What grail has today

`findCircularDependencies` in `queries.ts` is grail's only analysis pass. It returns `string[][]` — raw cycle data with no severity, no message, no location, and no framework for adding more analyses alongside it.

### Proposed design

```typescript
interface DiagnosticLocation {
  file: string;
  range?: Range;          // optional: some diagnostics are file-level
  symbol?: string;        // optional: which symbol is affected
}

interface Diagnostic {
  code: string;                          // e.g. "circular-dep", "unused-export"
  severity: "error" | "warning" | "info";
  message: string;
  location: DiagnosticLocation;
  related?: DiagnosticLocation[];        // other locations involved
}

// An analysis pass is a function over the project index
type AnalysisPass = (files: FileEntry[], root: RootNode) => Diagnostic[];
```

**Built-in passes to start with:**

| Code | Severity | What it detects | Data source |
|------|----------|-----------------|-------------|
| `circular-dep` | warning | Circular dependency cycles | Existing Tarjan SCC in `queries.ts` |
| `unused-export` | info | Exported symbol never imported by any other file | `symbols` (visibility=public) cross-referenced with all `imports` |
| `orphan-file` | info | File not imported by anything and not an entry point | `findEntryPoints` minus known entry patterns |
| `phantom-dep` | warning | Import specifier resolves to null and isn't a known external | `imports` where `resolvedPath === null && !isExternal` |
| `deep-call-chain` | info | Transitive call depth exceeds threshold | Call graph BFS depth |
| `high-fan-out` | info | Function calls more than N other functions | `symbol.calls.length` |
| `high-fan-in` | info | Function called by more than N callers | Inverted call index |

**Why a framework, not individual features**: Each of these is trivial to implement (5-30 lines) given grail's existing data. The value is in the *registry* — a standard way to add, run, and output them. New passes (from core or from language plugins) plug into the same pipeline.

### CLI integration

```
npx grail-ai diagnose --path <dir> [--severity warning] [--code circular-dep]
```

Returns JSON array of diagnostics. Filters by severity and code. Language plugins can register their own passes (e.g., JavaScript-specific: "require() used in ES module file").

### Agent value

Diagnostics give agents *actionable signals* they can't get from structure alone. An agent deciding whether to refactor a module cares about: does anything depend on this? (dependents) Are there unused exports I can remove? (unused-export diagnostic) Will I create a cycle? (circular-dep). These are judgment calls today — diagnostics make them data.

---

## 3. Workspace Symbol Search

### The idea

Add a query that searches for symbols across the entire project by name pattern, returning matches with their file, kind, signature, and location — without requiring the caller to know which file the symbol is in.

### Prior art

**LSP `workspace/symbol`**. The request takes a `query: string` and returns `SymbolInformation[]` matching that query. The spec says: "The query string can be empty, in which case all symbols should be returned." Implementations vary in matching strategy — some use prefix matching, some use subsequence/fuzzy matching.

**Ctags and etags**. The original "workspace symbol" tools. Ctags builds a flat index of `(symbol_name, file, line, kind)` tuples — exactly what grail's `Symbol` already contains but doesn't expose as a searchable collection. Ctags has been indexing codebases since 1987. The `tags` file format is a sorted text file, enabling binary search by name. Modern Universal Ctags supports 130+ languages.

**Zoekt** (Google's trigram-based code search, now used by Sourcegraph). Zoekt builds a trigram index — every 3-character substring maps to the set of documents containing it. A query "parseImp" generates trigrams {par, ars, rse, seI, eIm, Imp} and intersects their posting lists. This gives sub-millisecond search over millions of files. For grail's scale (project-level, not internet-scale), a simpler approach suffices, but the trigram idea is relevant if grail ever wants to search *within* symbol signatures or bodies.

**Fuzzy matching (fzf algorithm)**. Junegunn Choi's fzf uses a modified Smith-Waterman alignment algorithm to score fuzzy matches. Key scoring heuristics: consecutive character matches score higher, matches at word boundaries (after `_`, `.`, case changes) score higher, matches at the start of the string score highest. This is what makes typing "pJS" find "parseJavaScriptSymbols" effectively.

**Haskell's Hoogle**. Hoogle lets you search by *type signature*, not just name. Search for `(a -> b) -> [a] -> [b]` and it finds `map`. This is interesting for grail because grail already extracts signatures. Searching for "string, string) => boolean" could find comparison functions. This is a differentiated capability — not just "LSP but for CLI."

### What grail has today

The `summary` command returns all files with all their symbols. To find a symbol by name, you have to parse the full summary output client-side. There's no server-side filtering, no fuzzy matching, no ranking.

### Proposed design

```typescript
interface SymbolQuery {
  pattern: string;           // the search string
  kinds?: SymbolKind[];      // filter by kind
  visibility?: SymbolVisibility[];
  limit?: number;            // max results (default 20)
}

interface SymbolMatch {
  file: string;
  name: string;
  kind: SymbolKind;
  signature: string;
  visibility: SymbolVisibility;
  range: Range;              // requires #1 (Position/Range)
  parent?: string;
  score: number;             // match quality (higher = better)
}

function findSymbols(files: FileEntry[], query: SymbolQuery): SymbolMatch[];
```

**Matching strategy**. For project-scale search (hundreds to low thousands of symbols), a simple approach works:

1. **Exact prefix** — highest priority. Query "parse" matches "parseImports" with top score.
2. **Case-insensitive substring** — "import" matches "parseImports".
3. **Subsequence with word-boundary bonus** — "pJS" matches "parseJavaScriptSymbols" because p-J-S appear in order at word boundaries.

Score = `(consecutive_matches * 2) + (boundary_matches * 3) + (prefix_match * 5) - (gap_penalty)`. This is a simplified fzf-style scorer.

**Indexing**. Build a flat `Symbol[]` array during analysis (a view over all files' symbols with file path attached). For project-scale data, linear scan with early termination (stop after `limit` matches above a score threshold) is fast enough. No need for a trigram index until grail targets monorepo scale.

### CLI integration

```
npx grail-ai find --path <dir> --query "parseImp" [--kind function] [--limit 10]
```

### Agent value

This is arguably the highest-value addition for agent workflows. Agents frequently know *what* they're looking for ("the authentication middleware", "the database connection function") but not *where* it lives. Today they have to:

1. Call `grail_summary` (returns everything)
2. Parse the full output to find the symbol
3. Call `grail_read` on the match

With workspace symbol search:

1. Call `grail_find_symbol { query: "auth middleware" }` → direct hit

This collapses a multi-step, high-token workflow into a single precise call. It's the difference between `grep` and a search engine.

---

## 4. Layered Analysis DAG

### The idea

Formalize grail's analysis pipeline as a directed acyclic graph of computation phases, where each phase declares its inputs, produces typed outputs, and can be cached and invalidated independently. This doesn't require a stateful server — it's about structuring computation so that even in a CLI context, work isn't repeated unnecessarily within a single invocation.

### Prior art

**Salsa** (rust-analyzer's incremental computation framework). Salsa, created by Niko Matsakis for the Rust project, models compilation as a set of "queries" — pure functions that take inputs and produce outputs. Queries can call other queries, forming a DAG. Salsa memoizes every query result and tracks which inputs each result depends on. When an input changes, Salsa walks the dependency graph and invalidates only the affected results.

Key Salsa concepts:
- **Input queries**: base facts (file contents, configuration)
- **Derived queries**: computed from other queries (parsed AST, resolved imports)
- **Durability**: inputs can be marked as "low" (change often, like file contents) or "high" (change rarely, like configuration). High-durability inputs skip change-checking more aggressively.
- **LRU eviction**: derived query results can be evicted under memory pressure and recomputed on demand.

Paper: "Demand-Driven Incremental Computation" describes the theoretical foundation. Salsa is inspired by Adapton (below) but simplified for the compiler use case.

**Adapton** (University of Maryland, PLDI 2014). A general framework for incremental computation. The core insight from Matthew Hammer et al.: structure a computation as a graph of thunks (suspended computations), where each thunk tracks which other thunks it read during its last execution. When an input changes, Adapton "dirties" the transitive dependents but doesn't recompute them eagerly — it waits until the result is demanded (demand-driven). This lazy invalidation avoids wasted work when only some outputs are actually needed.

Adapton distinguishes between:
- **From-scratch consistency**: the result equals what you'd get by recomputing everything.
- **Incremental consistency**: the result is correct given the changes since the last computation.

The guarantee is from-scratch consistency with incremental performance.

**"Build Systems à la Carte"** (Mokhov, Mitchell, Peyton Jones, ICFP 2018). This paper provides a taxonomy of build systems along two axes: (1) the *scheduler* (topological vs. restarting vs. suspending) and (2) the *rebuilder* (dirty-bit vs. verifying traces vs. constructive traces). It shows that Make, Shake, Bazel, and Excel are all instances of the same abstract framework.

Relevant to grail because grail's analysis is essentially a build system:
- **Inputs**: source files, configuration (tsconfig.json, package.json)
- **Tasks**: parse file → extract imports → resolve imports → extract symbols → build call graph
- **Outputs**: the analysis result

The paper's key finding: the choice of rebuilder determines whether you can skip work. A **verifying trace** (store a hash of inputs alongside each cached output; recompute only if input hashes differ) is the simplest effective strategy. This is what grail could adopt without the complexity of full Salsa.

**Roslyn** (Microsoft's C#/VB compiler platform). Roslyn uses a "red-green tree" — the green tree is immutable and shared across edits, the red tree wraps it with parent pointers and position info. This separation means that when a file changes, most of the tree structure can be reused. While grail doesn't need this level of sophistication, the principle of immutable shared structure is valuable: if you cache a file's symbols and nothing in that file changed, the symbol list can be reused by reference.

**Turborepo / Nx**. Modern monorepo build tools that use content-addressable caching and a task dependency graph. Each task (build, test, lint) declares its inputs and outputs. If the hash of inputs hasn't changed, the cached output is reused. This is "verifying traces" from the Mokhov paper, applied at the package level. Grail could apply it at the file level.

### What grail has today

```
analyze(dirPath)
  → findProjectRoot()                    // side effect: filesystem
  → detectLanguage(projectRoot)          // side effect: filesystem
  → loadLanguage(descriptor)             // cached (language registry)
  → buildTree(projectRoot)               // side effect: full filesystem walk
  → buildDependencyGraph(root, language) // side effect: reads every file, parses, mutates root
  → return { root, language }
```

The call graph is built separately, on-demand, in CLI commands that need it:

```
// cli commands like calls/callers:
const { root, language } = await analyze(dirPath);
const files = collectFiles(root);
await buildCallGraph(files, root.absolutePath, language);
```

Problems with the current structure:
1. **Monolithic**: `buildDependencyGraph` does parsing, import extraction, symbol extraction, and import resolution in a single loop. You can't cache or skip any of these independently.
2. **Mutation**: The analysis mutates `FileNode` in place (`node.imports = ...`, `node.symbols = ...`). This makes caching harder — you can't tell if a node's data is fresh or stale.
3. **Implicit dependencies**: `buildCallGraph` depends on `buildDependencyGraph` having run first (it reads `node.symbols`), but this dependency is implicit. If you called `buildCallGraph` without `buildDependencyGraph`, you'd get empty results silently.
4. **Redundant work within a single CLI invocation**: The `dependents` command enriches output with consumed symbols from dependencies — this involves re-reading files that were already parsed during analysis. The `calls`/`callers` commands call `buildCallGraph`, which creates a new ts-morph Project and re-reads every file that tree-sitter already parsed.

### Proposed design

Define analysis as a graph of phases, each with typed inputs and outputs:

```typescript
// Phase 1: File discovery
interface FileTree {
  root: RootNode;               // directory structure only, no imports/symbols yet
  fileContents: Map<string, string>;  // path → content (read once, shared)
  contentHashes: Map<string, string>; // path → hash (for cache validation)
}

// Phase 2: Per-file parsing (embarrassingly parallel)
interface ParsedFile {
  filePath: string;
  imports: ParsedImport[];       // raw, unresolved
  symbols: Symbol[];             // with ranges
  tree: unknown;                 // tree-sitter tree, retained for later phases
}

// Phase 3: Import resolution (needs all parsed files for alias resolution)
interface ResolvedFile extends ParsedFile {
  resolvedImports: Import[];     // with resolvedPath filled in
}

// Phase 4: Call graph (needs resolved files + ts-morph)
interface AnalyzedFile extends ResolvedFile {
  callGraph: SymbolRef[];        // per-symbol calls
}

// The full analysis result
interface ProjectAnalysis {
  tree: FileTree;
  files: Map<string, AnalyzedFile>;
  diagnostics: Diagnostic[];
  index: ProjectIndex;           // inverted indexes for fast queries
}
```

**Phase execution with caching**:

```typescript
interface PhaseCache {
  // keyed by file content hash — if content didn't change, result is valid
  parsedFiles: Map<string, { hash: string; result: ParsedFile }>;
  resolvedFiles: Map<string, { hash: string; depsHash: string; result: ResolvedFile }>;
}

async function analyzeProject(dirPath: string, cache?: PhaseCache): Promise<ProjectAnalysis> {
  // Phase 1: always runs (fast filesystem walk)
  const tree = buildFileTree(dirPath);

  // Phase 2: skip files whose content hash matches cache
  const parsed = new Map<string, ParsedFile>();
  for (const [filePath, content] of tree.fileContents) {
    const hash = tree.contentHashes.get(filePath)!;
    const cached = cache?.parsedFiles.get(filePath);
    if (cached && cached.hash === hash) {
      parsed.set(filePath, cached.result);
    } else {
      parsed.set(filePath, parseFile(filePath, content, language));
    }
  }

  // Phase 3: resolve imports (depends on Phase 2 of all files)
  // ...

  // Phase 4: call graph (on-demand, only if requested)
  // ...
}
```

### Why this matters even without a stateful server

1. **Within a single CLI invocation**: The `dependents` command currently runs `analyze()` (which parses all files) and then separately reads files to show consumed symbols. With the phase DAG, the parsed content is already available — no re-reading.

2. **Selective phase execution**: `grail summary` doesn't need the call graph. Today it doesn't build one (good), but the boundary is implicit. With explicit phases, the CLI dispatcher can request exactly the phases it needs: `summary` runs Phases 1-3, `calls` runs Phases 1-4.

3. **File-level caching for CLI**: Even in CLI mode, you can persist a cache to disk (`.grail/cache.json` or similar). On the next invocation, unchanged files skip Phase 2-3. For a 1,000-file project where you edited 3 files, this turns a 5-second analysis into a 0.5-second analysis. This is exactly what Turborepo does for builds — content-addressable file-level caching.

4. **Parallelism**: Phase 2 (per-file parsing) is embarrassingly parallel. With explicit phase boundaries, you could `Promise.all` the parsing. Currently, `buildDependencyGraph` processes files sequentially in a for-loop.

5. **Testability**: Each phase is a pure function (given the same inputs, produces the same outputs). Today, testing `buildDependencyGraph` requires a real filesystem. With the phase DAG, you can test Phase 2 by passing in synthetic content.

### Implementation path

You don't need to adopt Salsa or Adapton to get most of the value. The pragmatic approach:

1. **Separate parsing from resolution**. Split `buildDependencyGraph` into `parseAllFiles` (Phase 2, per-file, parallelizable) and `resolveAllImports` (Phase 3, needs cross-file data). This is a refactor of existing code — the logic is already there, just interleaved.

2. **Return data, don't mutate**. Have each phase return new objects rather than mutating `FileNode` in place. This makes caching possible (you can compare old and new by reference equality or hash).

3. **Content hashing**. Add `crypto.createHash('sha256').update(content).digest('hex')` after reading each file. Store it alongside the parsed result. On next invocation, skip re-parsing files whose hash matches.

4. **Lazy call graph**. Make `buildCallGraph` a function that takes `ParsedFile[]` and returns augmented results, rather than mutating `Symbol.calls` in place. This makes the dependency explicit: call graph is a function of parsed files.

5. **Disk cache** (optional, high value). Write `{ hash, parsedResult }` pairs to `.grail/cache/` as JSON. On startup, load the cache and skip unchanged files. Invalidate on grail version bump. This is the "verifying traces" strategy from the Mokhov paper.

---

## Connections Between the Four Ideas

These aren't independent proposals — they form a layered system:

```
                ┌─────────────────────┐
                │  Diagnostic Passes  │  ← consumes structured data, emits findings
                └──────────┬──────────┘
                           │
                ┌──────────▼──────────┐
                │  Workspace Search   │  ← queries the index
                └──────────┬──────────┘
                           │
                ┌──────────▼──────────┐
                │   Analysis DAG      │  ← produces structured data + index
                │  (phased pipeline)  │
                └──────────┬──────────┘
                           │
                ┌──────────▼──────────┐
                │   Position/Range    │  ← foundation type used by everything above
                └─────────────────────┘
```

**Position/Range** is the foundation — the other three features need precise location data to be useful.

**The Analysis DAG** produces the structured, phase-separated data that diagnostics and search consume. Without it, diagnostics would need to re-derive information that the analysis already computed.

**Workspace Search** is a view over the analysis DAG's index — specifically the symbol table. It's cheap to add once the index exists.

**Diagnostics** are the capstone — analysis passes that consume the full project model (symbols + imports + call graph + ranges) and surface insights. They're the "so what?" that turns structural data into actionable intelligence.

The implementation order matters: Range → DAG refactor → Search → Diagnostics. Each layer builds on the one below it.
