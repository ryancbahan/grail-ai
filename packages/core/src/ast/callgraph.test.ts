import { callsOf, callersOf } from "./callgraph";
import type { RootNode, FileNode, DirectoryNode, SymbolRef } from "./types";

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

function sym(name: string, calls?: SymbolRef[]) {
  return { name, kind: "function" as const, signature: "", visibility: "public" as const, calls };
}

describe("callsOf", () => {
  it("returns calls for a symbol with populated calls", () => {
    const root = makeRoot({
      "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])],
      "b.ts": [sym("bar")],
    });
    const result = callsOf(root, "a.ts", "foo");
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("b.ts");
    expect(result[0].name).toBe("bar");
    expect(result[0].kind).toBe("function");
    expect(result[0].signature).toBe("");
  });

  it("returns empty array when symbol has no calls", () => {
    const root = makeRoot({ "a.ts": [sym("foo", [])] });
    expect(callsOf(root, "a.ts", "foo")).toEqual([]);
  });

  it("returns empty array when calls is undefined (not computed)", () => {
    const root = makeRoot({ "a.ts": [sym("foo")] });
    expect(callsOf(root, "a.ts", "foo")).toEqual([]);
  });

  it("returns empty array for nonexistent file", () => {
    const root = makeRoot({ "a.ts": [sym("foo")] });
    expect(callsOf(root, "nope.ts", "foo")).toEqual([]);
  });

  it("returns empty array for nonexistent symbol", () => {
    const root = makeRoot({ "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])] });
    expect(callsOf(root, "a.ts", "nope")).toEqual([]);
  });

  it("works with relative file paths", () => {
    const root = makeRoot({
      "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])],
    });
    // callsOf resolves relative to root.absolutePath
    const result = callsOf(root, "a.ts", "foo");
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
    expect(callsOf(root, "a.ts", "foo")).toHaveLength(3);
  });
});

describe("callersOf", () => {
  it("returns callers of a symbol", () => {
    const root = makeRoot({
      "a.ts": [sym("foo", [{ file: "b.ts", name: "bar" }])],
      "b.ts": [sym("bar")],
    });
    const result = callersOf(root, "b.ts", "bar");
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
    const result = callersOf(root, "c.ts", "shared");
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name).sort()).toEqual(["funcA", "funcB"]);
  });

  it("returns empty array when nothing calls the symbol", () => {
    const root = makeRoot({
      "a.ts": [sym("foo")],
      "b.ts": [sym("bar")],
    });
    expect(callersOf(root, "a.ts", "foo")).toEqual([]);
  });

  it("returns empty array for nonexistent file", () => {
    const root = makeRoot({ "a.ts": [sym("foo")] });
    expect(callersOf(root, "nope.ts", "foo")).toEqual([]);
  });

  it("returns empty array when no calls are computed", () => {
    const root = makeRoot({
      "a.ts": [sym("foo")], // calls undefined
      "b.ts": [sym("bar")],
    });
    expect(callersOf(root, "b.ts", "bar")).toEqual([]);
  });

  it("handles self-referencing calls", () => {
    const root = makeRoot({
      "a.ts": [sym("recursive", [{ file: "a.ts", name: "recursive" }])],
    });
    const result = callersOf(root, "a.ts", "recursive");
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("a.ts");
    expect(result[0].name).toBe("recursive");
  });
});
