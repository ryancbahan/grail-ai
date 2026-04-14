import path from "path";
import { resolveFile, findFile, lookupSymbol, parseArgs } from "./util";
import type { FileEntry, FileNode } from "@grail-ai/core";

function fileEntry(filePath: string, symbols: FileNode["symbols"] = []): FileEntry {
  return {
    filePath,
    node: { type: "file", name: path.basename(filePath), extension: path.extname(filePath), imports: [], symbols },
  };
}

function sym(name: string) {
  return { name, kind: "function" as const, signature: `fn ${name}()`, visibility: "public" as const };
}

describe("resolveFile", () => {
  it("returns absolute paths unchanged", () => {
    expect(resolveFile("/project", "/absolute/file.ts")).toBe("/absolute/file.ts");
  });

  it("resolves relative paths against root", () => {
    const result = resolveFile("/project", "src/index.ts");
    expect(result).toBe(path.resolve("/project", "src/index.ts"));
  });
});

describe("findFile", () => {
  const files = [
    fileEntry("/project/src/index.ts"),
    fileEntry("/project/src/utils.ts"),
  ];

  it("finds file by exact path", () => {
    expect(findFile(files, "/project/src/index.ts")).toBeDefined();
    expect(findFile(files, "/project/src/index.ts")!.filePath).toBe("/project/src/index.ts");
  });

  it("returns undefined for nonexistent path", () => {
    expect(findFile(files, "/project/src/nope.ts")).toBeUndefined();
  });
});

describe("lookupSymbol", () => {
  const files = [
    fileEntry("/project/src/utils.ts", [sym("createUser"), sym("formatUser")]),
    fileEntry("/project/src/types.ts", []),
  ];

  it("finds symbol by file path and name", () => {
    const result = lookupSymbol(files, "/project/src/utils.ts", "createUser");
    expect(result).toBeDefined();
    expect(result!.name).toBe("createUser");
    expect(result!.signature).toBe("fn createUser()");
  });

  it("returns undefined for nonexistent symbol", () => {
    expect(lookupSymbol(files, "/project/src/utils.ts", "nope")).toBeUndefined();
  });

  it("returns undefined for nonexistent file", () => {
    expect(lookupSymbol(files, "/project/src/nope.ts", "createUser")).toBeUndefined();
  });

  it("returns undefined for file with no symbols", () => {
    expect(lookupSymbol(files, "/project/src/types.ts", "anything")).toBeUndefined();
  });
});

describe("parseArgs", () => {
  it("defaults to tree command when only path is given", () => {
    const result = parseArgs(["./src"]);
    expect(result.commandName).toBe("tree");
    expect(result.args).toEqual(["./src"]);
  });

  it("parses path and command", () => {
    const result = parseArgs(["./src", "summary"]);
    expect(result.commandName).toBe("summary");
    expect(result.args).toEqual(["./src"]);
  });

  it("passes extra args after command", () => {
    const result = parseArgs(["./src", "dependencies", "src/index.ts"]);
    expect(result.commandName).toBe("dependencies");
    expect(result.args).toEqual(["./src", "src/index.ts"]);
  });

  it("parses --depth flag", () => {
    const result = parseArgs(["./src", "tree", "--depth", "2"]);
    expect(result.flags.depth).toBe(2);
    expect(result.commandName).toBe("tree");
  });

  it("parses --transitive flag", () => {
    const result = parseArgs(["./src", "calls", "file.ts", "fn", "--transitive"]);
    expect(result.flags.transitive).toBe(true);
  });

  it("parses --install flag", () => {
    const result = parseArgs(["skill", "--install"]);
    expect(result.flags.install).toBe(true);
  });

  it("handles skill command without path prefix", () => {
    const result = parseArgs(["skill"]);
    expect(result.commandName).toBe("skill");
    expect(result.args).toEqual([]);
  });

  it("passes args after skill command", () => {
    const result = parseArgs(["skill", "--install", "/custom/path"]);
    expect(result.commandName).toBe("skill");
    expect(result.flags.install).toBe(true);
    expect(result.args).toEqual(["/custom/path"]);
  });

  it("defaults all flags to off", () => {
    const result = parseArgs(["./src"]);
    expect(result.flags.depth).toBeUndefined();
    expect(result.flags.transitive).toBe(false);
    expect(result.flags.install).toBe(false);
  });

  it("handles multiple flags together", () => {
    const result = parseArgs(["./src", "calls", "file.ts", "fn", "--depth", "3", "--transitive"]);
    expect(result.flags.depth).toBe(3);
    expect(result.flags.transitive).toBe(true);
    expect(result.commandName).toBe("calls");
    expect(result.args).toEqual(["./src", "file.ts", "fn"]);
  });
});
