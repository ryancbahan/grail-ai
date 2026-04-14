import { callsOf, callersOf } from "./callgraph";
import type { RootNode, FileNode, FileEntry, SymbolRef } from "./types";
import { collectFiles } from "./walker";

function fileNode(name: string, symbols: FileNode["symbols"] = []): FileNode {
  return { type: "file", name, extension: ".ts", imports: [], symbols };
}

function makeRoot(files: Record<string, FileNode["symbols"]>): RootNode {
  const children = Object.entries(files).map(([name, symbols]) => fileNode(name, symbols));
  return {
    type: "root",
    absolutePath: "/project",
    tree: { type: "directory", name: "project", children },
    externals: [],
  };
}

function filesOf(root: RootNode): FileEntry[] {
  return collectFiles(root);
}

const ROOT_PATH = "/project";

function sym(name: string, calls?: SymbolRef[]) {
  return { name, kind: "function" as const, signature: "", visibility: "public" as const, calls };
}

describe("callsOf", () => {
  it("returns calls for a symbol with populated calls", () => {
    const root = makeRoot({
      "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])],
      "b.ts": [sym("bar")],
    });
    const result = callsOf(filesOf(root), ROOT_PATH, "a.ts", "foo");
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("b.ts");
    expect(result[0].name).toBe("bar");
    expect(result[0].kind).toBe("function");
    expect(result[0].signature).toBe("");
  });

  it("returns empty array when symbol has no calls", () => {
    const root = makeRoot({ "a.ts": [sym("foo", [])] });
    expect(callsOf(filesOf(root), ROOT_PATH, "a.ts", "foo")).toEqual([]);
  });

  it("returns empty array when calls is undefined (not computed)", () => {
    const root = makeRoot({ "a.ts": [sym("foo")] });
    expect(callsOf(filesOf(root), ROOT_PATH, "a.ts", "foo")).toEqual([]);
  });

  it("returns empty array for nonexistent file", () => {
    const root = makeRoot({ "a.ts": [sym("foo")] });
    expect(callsOf(filesOf(root), ROOT_PATH, "nope.ts", "foo")).toEqual([]);
  });

  it("returns empty array for nonexistent symbol", () => {
    const root = makeRoot({ "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])] });
    expect(callsOf(filesOf(root), ROOT_PATH, "a.ts", "nope")).toEqual([]);
  });

  it("works with relative file paths", () => {
    const root = makeRoot({
      "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])],
    });
    // callsOf resolves relative to root.absolutePath
    const result = callsOf(filesOf(root), ROOT_PATH, "a.ts", "foo");
    expect(result[0].file).toBe("b.ts");
    expect(result[0].name).toBe("bar");
  });

  it("returns multiple calls", () => {
    const root = makeRoot({
      "a.ts": [sym("foo", [
        { file: "b.ts", name: "bar" },
        { file: "c.ts", name: "baz" },
        { file: "a.ts", name: "helper" },
      ])],
    });
    expect(callsOf(filesOf(root), ROOT_PATH, "a.ts", "foo")).toHaveLength(3);
  });
});

describe("callersOf", () => {
  it("returns callers of a symbol", () => {
    const root = makeRoot({
      "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])],
      "b.ts": [sym("bar")],
    });
    const result = callersOf(filesOf(root), ROOT_PATH, "b.ts", "bar");
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("a.ts");
    expect(result[0].name).toBe("foo");
    expect(result[0].kind).toBe("function");
    expect(result[0].signature).toBe("");
  });

  it("returns multiple callers", () => {
    const root = makeRoot({
      "a.ts": [sym("funcA", [{ file: "c.ts", name: "shared" }])],
      "b.ts": [sym("funcB", [{ file: "c.ts", name: "shared" }])],
      "c.ts": [sym("shared")],
    });
    const result = callersOf(filesOf(root), ROOT_PATH, "c.ts", "shared");
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name).sort()).toEqual(["funcA", "funcB"]);
  });

  it("returns empty array when nothing calls the symbol", () => {
    const root = makeRoot({
      "a.ts": [sym("foo")],
      "b.ts": [sym("bar")],
    });
    expect(callersOf(filesOf(root), ROOT_PATH, "a.ts", "foo")).toEqual([]);
  });

  it("returns empty array for nonexistent file", () => {
    const root = makeRoot({ "a.ts": [sym("foo")] });
    expect(callersOf(filesOf(root), ROOT_PATH, "nope.ts", "foo")).toEqual([]);
  });

  it("returns empty array when no calls are computed", () => {
    const root = makeRoot({
      "a.ts": [sym("foo")], // calls undefined
      "b.ts": [sym("bar")],
    });
    expect(callersOf(filesOf(root), ROOT_PATH, "b.ts", "bar")).toEqual([]);
  });

  it("propagates range from call site to caller result", () => {
    const callRange = { start: { line: 5, column: 4 }, end: { line: 5, column: 20 } };
    const root = makeRoot({
      "a.ts": [sym("foo", [{ file: "b.ts", name: "bar", range: callRange, context: "bar()" }])],
      "b.ts": [sym("bar")],
    });
    const result = callersOf(filesOf(root), ROOT_PATH, "b.ts", "bar");
    expect(result).toHaveLength(1);
    expect(result[0].range).toEqual(callRange);
  });

  it("handles self-referencing calls", () => {
    const root = makeRoot({
      "a.ts": [sym("recursive", [{ file: "a.ts", name: "recursive" }])],
    });
    const result = callersOf(filesOf(root), ROOT_PATH, "a.ts", "recursive");
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("a.ts");
    expect(result[0].name).toBe("recursive");
  });
});

describe("callsOf transitive", () => {
  // a -> b -> c -> d (linear chain)
  function linearChain() {
    return makeRoot({
      "a.ts": [sym("a", [{ file: "b.ts", name: "b" }])],
      "b.ts": [sym("b", [{ file: "c.ts", name: "c" }])],
      "c.ts": [sym("c", [{ file: "d.ts", name: "d" }])],
      "d.ts": [sym("d")],
    });
  }

  it("follows full call chain transitively", () => {
    const result = callsOf(filesOf(linearChain()), ROOT_PATH, "a.ts", "a", { transitive: true });
    const names = result.map((r) => r.name);
    expect(names).toContain("b");
    expect(names).toContain("c");
    expect(names).toContain("d");
    expect(names).toHaveLength(3);
  });

  it("respects maxDepth", () => {
    const result = callsOf(filesOf(linearChain()), ROOT_PATH, "a.ts", "a", { transitive: true, maxDepth: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("b");
  });

  it("maxDepth 2 gets two levels", () => {
    const result = callsOf(filesOf(linearChain()), ROOT_PATH, "a.ts", "a", { transitive: true, maxDepth: 2 });
    const names = result.map((r) => r.name);
    expect(names).toContain("b");
    expect(names).toContain("c");
    expect(names).not.toContain("d");
  });

  it("handles cycles without infinite loop", () => {
    const root = makeRoot({
      "a.ts": [sym("a", [{ file: "b.ts", name: "b" }])],
      "b.ts": [sym("b", [{ file: "a.ts", name: "a" }])],
    });
    const result = callsOf(filesOf(root), ROOT_PATH, "a.ts", "a", { transitive: true });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("b");
  });

  it("deduplicates diamond patterns", () => {
    // a -> b, a -> c, b -> d, c -> d
    const root = makeRoot({
      "a.ts": [sym("a", [{ file: "b.ts", name: "b" }, { file: "c.ts", name: "c" }])],
      "b.ts": [sym("b", [{ file: "d.ts", name: "d" }])],
      "c.ts": [sym("c", [{ file: "d.ts", name: "d" }])],
      "d.ts": [sym("d")],
    });
    const result = callsOf(filesOf(root), ROOT_PATH, "a.ts", "a", { transitive: true });
    const dResults = result.filter((r) => r.name === "d");
    expect(dResults).toHaveLength(1); // d appears once, not twice
  });

  it("orders leaves first", () => {
    const root = makeRoot({
      "a.ts": [sym("a", [{ file: "b.ts", name: "b" }, { file: "c.ts", name: "c" }])],
      "b.ts": [sym("b", [{ file: "c.ts", name: "c" }])],
      "c.ts": [sym("c")], // leaf — calls nothing
    });
    const result = callsOf(filesOf(root), ROOT_PATH, "a.ts", "a", { transitive: true });
    const cIndex = result.findIndex((r) => r.name === "c");
    const bIndex = result.findIndex((r) => r.name === "b");
    expect(cIndex).toBeLessThan(bIndex); // leaf c before orchestrator b
  });

  it("without transitive flag returns only direct calls", () => {
    const result = callsOf(filesOf(linearChain()), ROOT_PATH, "a.ts", "a");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("b");
  });
});

describe("callersOf transitive", () => {
  // d <- c <- b <- a (linear chain)
  function linearChain() {
    return makeRoot({
      "a.ts": [sym("a", [{ file: "b.ts", name: "b" }])],
      "b.ts": [sym("b", [{ file: "c.ts", name: "c" }])],
      "c.ts": [sym("c", [{ file: "d.ts", name: "d" }])],
      "d.ts": [sym("d")],
    });
  }

  it("follows full caller chain transitively", () => {
    const result = callersOf(filesOf(linearChain()), ROOT_PATH, "d.ts", "d", { transitive: true });
    const names = result.map((r) => r.name);
    expect(names).toContain("c");
    expect(names).toContain("b");
    expect(names).toContain("a");
    expect(names).toHaveLength(3);
  });

  it("respects maxDepth", () => {
    const result = callersOf(filesOf(linearChain()), ROOT_PATH, "d.ts", "d", { transitive: true, maxDepth: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("c");
  });

  it("handles cycles without infinite loop", () => {
    const root = makeRoot({
      "a.ts": [sym("a", [{ file: "b.ts", name: "b" }])],
      "b.ts": [sym("b", [{ file: "a.ts", name: "a" }])],
    });
    const result = callersOf(filesOf(root), ROOT_PATH, "b.ts", "b", { transitive: true });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("a");
  });

  it("without transitive flag returns only direct callers", () => {
    const result = callersOf(filesOf(linearChain()), ROOT_PATH, "d.ts", "d");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("c");
  });

  it("multiple callers at different depths", () => {
    // d <- c, d <- b, c <- a
    const root = makeRoot({
      "a.ts": [sym("a", [{ file: "c.ts", name: "c" }])],
      "b.ts": [sym("b", [{ file: "d.ts", name: "d" }])],
      "c.ts": [sym("c", [{ file: "d.ts", name: "d" }])],
      "d.ts": [sym("d")],
    });
    const result = callersOf(filesOf(root), ROOT_PATH, "d.ts", "d", { transitive: true });
    const names = result.map((r) => r.name).sort();
    expect(names).toContain("b");
    expect(names).toContain("c");
    expect(names).toContain("a"); // transitive: a calls c which calls d
  });
});
