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
  it("defaults to help command when nothing is given", () => {
    const result = parseArgs([]);
    expect(result.commandName).toBe("help");
  });

  it("parses command name as first positional arg", () => {
    const result = parseArgs(["summary", "--path", "./src"]);
    expect(result.commandName).toBe("summary");
    expect(result.flags.path).toBe("./src");
  });

  it("parses --path flag", () => {
    const result = parseArgs(["dependencies", "--path", "./src", "--file", "src/index.ts"]);
    expect(result.commandName).toBe("dependencies");
    expect(result.flags.path).toBe("./src");
    expect(result.flags.file).toBe("src/index.ts");
  });

  it("parses --depth flag", () => {
    const result = parseArgs(["tree", "--path", "./src", "--depth", "2"]);
    expect(result.flags.depth).toBe(2);
    expect(result.commandName).toBe("tree");
  });

  it("parses --transitive flag", () => {
    const result = parseArgs(["calls", "--path", "./src", "--file", "file.ts", "--symbol", "fn", "--transitive"]);
    expect(result.flags.transitive).toBe(true);
  });

  it("parses --install flag", () => {
    const result = parseArgs(["skill", "--install"]);
    expect(result.flags.install).toBe(true);
  });

  it("parses --symbol and --parent flags", () => {
    const result = parseArgs(["calls", "--path", "./src", "--file", "file.ts", "--symbol", "run", "--parent", "cmd"]);
    expect(result.commandName).toBe("calls");
    expect(result.flags.symbol).toBe("run");
    expect(result.flags.parent).toBe("cmd");
  });

  it("parses --line flag", () => {
    const result = parseArgs(["read", "--path", "./src", "--file", "file.ts", "--line", "18"]);
    expect(result.flags.line).toBe(18);
  });

  it("handles skill command", () => {
    const result = parseArgs(["skill"]);
    expect(result.commandName).toBe("skill");
  });

  it("defaults all flags to off", () => {
    const result = parseArgs(["tree"]);
    expect(result.flags.depth).toBeUndefined();
    expect(result.flags.transitive).toBe(false);
    expect(result.flags.install).toBe(false);
    expect(result.flags.path).toBeUndefined();
    expect(result.flags.file).toBeUndefined();
    expect(result.flags.symbol).toBeUndefined();
    expect(result.flags.parent).toBeUndefined();
    expect(result.flags.line).toBeUndefined();
  });

  it("handles multiple flags together", () => {
    const result = parseArgs(["calls", "--path", "./src", "--file", "file.ts", "--symbol", "fn", "--depth", "3", "--transitive"]);
    expect(result.flags.depth).toBe(3);
    expect(result.flags.transitive).toBe(true);
    expect(result.commandName).toBe("calls");
    expect(result.flags.path).toBe("./src");
    expect(result.flags.file).toBe("file.ts");
    expect(result.flags.symbol).toBe("fn");
  });
});
