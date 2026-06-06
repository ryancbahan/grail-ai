# Ruby Call Graph: Implementation Plan

## Goal

Build a call graph for Ruby projects that resolves method calls to their definitions across files, using only tree-sitter (no type system). The result should be accurate enough to be useful for navigating real Ruby codebases — not perfect, but honest about its limitations.

## The problem

Ruby is dynamically typed. There is no compiler API like ts-morph that can tell you "this call expression resolves to that declaration." When you see `user.save`, you don't know from syntax alone which `save` method is being called — it depends on the runtime type of `user`, which could be anything.

This is fundamentally harder than JavaScript/TypeScript call graph resolution, where ts-morph leverages the TypeScript compiler's full type system and symbol table.

## Strategy: Scope-Aware Heuristic Resolution

Build a project-wide symbol index, then resolve calls against it using structural heuristics. No runtime type info, no external tools. Accept false negatives (missed calls) over false positives (wrong calls).

**Design principle**: it's better to return nothing than to return something wrong. An agent that gets a wrong call graph will make wrong decisions. An agent that gets "no data" knows to investigate further.

---

## Architecture

### Phase 1: Symbol Index (pass 1 — foundation)

Build a `Map<string, SymbolDef[]>` keyed by method name, where each entry records where that name is defined.

```typescript
interface SymbolDef {
  file: string;      // relative path
  name: string;      // method name
  parent?: string;   // class or module name
  kind: SymbolKind;
  arity?: number;    // parameter count, if determinable
}
```

This index is built from the existing `FileEntry[].node.symbols` data — no additional parsing needed.

**Why arity**: Ruby methods with the same name but different arities are different methods. `def initialize(name)` vs `def initialize(name, email)`. Arity narrows matches significantly.

### Phase 2: Call Extraction (pass 1)

Walk each method/function body in the tree-sitter AST. For each `call` node:

1. Extract the **method name** from the `method` field
2. Extract the **receiver** from the `receiver` field (if present)
3. Extract the **argument count** from the `arguments` field
4. Record the call site location (range, context line)

Produce a flat list of `RawCall` per function:

```typescript
interface RawCall {
  methodName: string;
  receiver?: ReceiverInfo;
  argCount: number;
  range: Range;
  context: string;   // first line of the call expression
}

interface ReceiverInfo {
  text: string;            // raw text: "user", "User", "self", "@config"
  kind: "constant"         // User, MyModule — uppercase, likely a class/module
       | "self"            // self.foo
       | "instance_var"    // @foo.bar
       | "identifier"      // local variable or method return
       | "call";           // chained: something.foo.bar
}
```

### Phase 3: Resolution (pass 1 — conservative)

Match each `RawCall` against the symbol index. Resolution tiers, from most confident to least:

**Tier 1: Unambiguous matches** (high confidence)
- Receiver is a constant (`User.find`) → look up method `find` with parent `User`
- Receiver is `self` → look up method in the same class/module
- No receiver, call is within a class body → look up method in same class, then module ancestors
- Method name is globally unique in the project (only one definition exists)

**Tier 2: Arity-filtered matches** (medium confidence)
- Multiple definitions exist for the method name, but only one matches the argument count

**Tier 3: Skip** (low confidence — don't resolve)
- Multiple definitions, ambiguous receiver (local variable), can't determine type
- Method name is common (`name`, `to_s`, `call`, `new`, `each`, `map`, etc.)

### What we skip entirely (pass 1)

- **Metaprogramming**: `send(:method_name)`, `define_method`, `method_missing`
- **Dynamic dispatch through variables**: `handler.call`, `proc.call`
- **Blocks/procs passed as arguments**: `users.each { |u| u.save }` — we resolve `each` but not `save` inside the block (the receiver `u` has unknown type)
- **Monkey patching**: if a gem or another file reopens a class, we won't see it
- **Mixin method resolution**: `include Foo` makes `Foo`'s methods available, but we don't follow the include chain (pass 2)
- **Common method names blacklist**: `new`, `initialize`, `to_s`, `to_i`, `inspect`, `class`, `is_a?`, `respond_to?`, `send`, `nil?`, `present?`, `blank?`, `each`, `map`, `select`, `reject`, `reduce`, `find`, `first`, `last`, `count`, `size`, `length`, `push`, `pop`, `<<`, `[]`, `[]=`, `==`, `!=`, `<=>`, `hash`, `eql?`

These are either too common (every class has them) or too dynamic (can't resolve statically).

---

## Implementation plan

### Pass 1: Core heuristic resolution

**Scope**: resolve calls where the receiver is a constant, `self`, or absent (implicit self within a class). Skip everything ambiguous.

**Files to create/modify**:
- `packages/lang-ruby/src/callgraph.ts` — new file, main implementation
- `packages/lang-ruby/src/callgraph.test.ts` — new file, tests
- `packages/lang-ruby/src/index.ts` — wire up `buildCallGraph`

**Steps**:

1. Build symbol index from `FileEntry[]` symbols
2. For each file, re-parse with tree-sitter (same as JS implementation)
3. Walk each method body, extract `call` nodes
4. For each call:
   - If receiver is a constant (uppercase): resolve against `parent === constant_name`
   - If receiver is `self`: resolve against `parent === current_class`
   - If no receiver: resolve against `parent === current_class`, then top-level
   - If method name is in the blacklist: skip
   - If multiple matches remain after filtering: skip (ambiguous)
5. Populate `symbol.calls` with resolved `SymbolRef[]`
6. Deduplicate by `file:parent.name` key (same as JS)

**Expected accuracy**: high precision (few false positives), moderate recall (many calls won't resolve). This is the right tradeoff for agent use — better to say "I don't know" than to point to the wrong function.

**Estimated test cases**:
- Cross-file: `User.find(1)` in controller → resolves to `User#find` in model
- Same-file: `validate_email(email)` → resolves to `def validate_email` in same class
- Self calls: `self.build_query` → resolves to `def self.build_query` in same class
- Ambiguous: `name` called with no receiver, multiple classes define `name` → skip
- Blacklisted: `user.to_s` → skip
- Chained: `User.where(active: true).first` → resolve `where` to User, skip `first` (receiver is a call return)

### Pass 2: Include/extend resolution (future)

Track `include` and `extend` statements to build a module ancestry chain. When resolving a method call on `self` or with no receiver, search the include chain.

```ruby
module Validatable
  def validate!
    # ...
  end
end

class User
  include Validatable

  def save
    validate!  # ← should resolve to Validatable#validate!
  end
end
```

**Requires**: building an inheritance/mixin graph from `include`, `extend`, `prepend`, and `< Superclass` declarations. The data is already partially available (superclass is in the class signature), but includes/extends need to be extracted as a new data source.

### Pass 3: Instance variable type inference (future)

When you see `@user = User.new(...)` in `initialize`, you can infer that `@user` has type `User`. Subsequent calls like `@user.save` can be resolved against `User`.

**Scope**: only constructor assignments (`@var = ClassName.new`), only within the same class. This is narrow but covers a very common Ruby pattern.

### Pass 4: Local variable type inference (future)

Same idea but for locals: `user = User.find(1)` followed by `user.name`. If `User.find` returns a `User` (which we'd need to infer or assume), we can resolve `user.name`.

**This gets speculative fast**. Without type annotations or Sorbet, we'd be guessing return types. Probably not worth pursuing unless we integrate Sorbet.

---

## Limitations to document for users

The Ruby call graph is **heuristic-based** and has fundamental limitations compared to the JavaScript/TypeScript call graph:

1. **No type system**: Ruby is dynamically typed. We resolve calls based on naming conventions and structural heuristics, not type information.
2. **Conservative by design**: we skip ambiguous calls rather than guess. This means some real call relationships won't appear.
3. **No metaprogramming**: `define_method`, `method_missing`, `send`, `respond_to_missing?` are invisible to static analysis.
4. **No mixin resolution** (pass 1): `include`/`extend` chains are not followed.
5. **No return type inference**: we can't resolve calls on method return values (`User.find(1).name`).
6. **Accuracy varies by codebase style**: projects with clear class-method-call patterns (e.g., Rails models/controllers) will get better results than heavily metaprogrammed code.

---

## Progress tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Pass 1: Symbol index | **done** | Built from `FileEntry[].node.symbols`, keyed by method name, with arity |
| Pass 1: Call extraction | **done** | Handles `call` nodes AND bare `identifier` nodes (Ruby parses `helper` as identifier, not call) |
| Pass 1: Heuristic resolution | **done** | Constant receivers, self, implicit self, arity disambiguation. Blacklist applied only to unqualified calls (constant-receiver calls bypass it) |
| Pass 1: Tests | **done** | 10 tests: cross-file constant, self, implicit self, top-level, blacklist, ambiguous, arity, range/context, deduplication, scope isolation |
| Pass 1: CLI wiring | **done** | `buildCallGraph` registered in language descriptor, `grail calls`/`callers` work end-to-end |
| Pass 2: Include/extend | not started | depends on pass 1 |
| Pass 3: Instance var inference | not started | depends on pass 2 |
| Pass 4: Local var inference | not started | probably won't do without Sorbet |

## Tradeoffs log

| Decision | Rationale |
|----------|-----------|
| Skip ambiguous calls | False positives are worse than false negatives for agent consumers. An agent that gets wrong data makes wrong edits. |
| Blacklist common method names | `to_s`, `each`, `map`, etc. exist on almost every object. Resolving them would produce noise, not signal. |
| Blacklist only on unqualified calls | `User.find(1)` should resolve even though `find` is in the blacklist (Enumerable#find). Constant receivers are explicit about their target class, so the blacklist is unnecessary and counterproductive. Discovered during implementation: `find` was being silently dropped. |
| Handle bare identifiers as calls | Ruby parses `helper` (no parens, no receiver) as an `identifier` node, not a `call` node. This is a fundamental Ruby parsing trait — bare words are syntactically indistinguishable from local variable references. The callgraph now also matches `identifier` nodes in method bodies against the symbol index. |
| No external tool dependency | Sorbet/Solargraph would improve accuracy but add heavyweight deps and require project-level setup. Keep grail zero-config. |
| Tree-sitter only (re-reads files) | The current architecture (following JS) re-reads files in the callgraph phase. This is a candidate for the analysis DAG refactor (see lsp-prior-art.md §4). |
| Arity matching | Ruby doesn't have method overloading in the traditional sense, but different classes can define the same method name with different arities. Arity is a cheap, effective disambiguation signal. |
