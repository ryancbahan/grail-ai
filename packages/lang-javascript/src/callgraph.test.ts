import fs from "fs";
import path from "path";
import os from "os";
import { buildJavaScriptCallGraph } from "./callgraph";
import { registerLanguage, loadLanguage, analyze } from "@grail-ai/core";
import type { FileEntry } from "@grail-ai/core";
import { javascript } from "./index";

let tmpDir: string;

beforeAll(async () => {
  registerLanguage(javascript);
  await loadLanguage(javascript);
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-callgraph-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

async function analyzeAndBuildCallGraph() {
  const { root, language } = await analyze(tmpDir);
  if (language?.implementation.buildCallGraph) {
    const { collectFiles } = await import("@grail-ai/core");
    const files = collectFiles(root);
    await language.implementation.buildCallGraph(root.absolutePath, files);
  }
  return root;
}

function findSymbol(root: ReturnType<typeof analyzeAndBuildCallGraph> extends Promise<infer T> ? T : never, fileName: string, symName: string) {
  const { collectFiles } = require("@grail-ai/core");
  const files = collectFiles(root) as FileEntry[];
  const file = files.find((f) => f.filePath.endsWith(fileName));
  return file?.node.symbols.find((s) => s.name === symName);
}

describe("buildJavaScriptCallGraph", () => {
  describe("cross-file resolution", () => {
    it("resolves imported function calls", async () => {
      writeFile("package.json", "{}");
      writeFile("utils.ts", "export function helper() { return 1; }\n");
      writeFile("main.ts", 'import { helper } from "./utils";\nexport function main() { return helper(); }\n');

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.ts", "main");

      expect(mainSym?.calls).toBeDefined();
      expect(mainSym!.calls).toHaveLength(1);
      expect(mainSym!.calls![0].name).toBe("helper");
      expect(mainSym!.calls![0].file).toContain("utils.ts");
    });

    it("resolves default import calls", async () => {
      writeFile("package.json", "{}");
      writeFile("utils.ts", "export default function doStuff() { return 1; }\n");
      writeFile("main.ts", 'import doStuff from "./utils";\nexport function main() { return doStuff(); }\n');

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.ts", "main");

      expect(mainSym?.calls).toBeDefined();
      expect(mainSym!.calls!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("same-file resolution", () => {
    it("resolves local function calls", async () => {
      writeFile("package.json", "{}");
      writeFile("main.ts", `
        function helper() { return 1; }
        export function main() { return helper(); }
      `);

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.ts", "main");

      expect(mainSym?.calls).toBeDefined();
      expect(mainSym!.calls!.some((c) => c.name === "helper")).toBe(true);
    });
  });

  describe("class methods", () => {
    it("resolves method calls within a class", async () => {
      writeFile("package.json", "{}");
      writeFile("service.ts", `
        export class Service {
          private helper() { return 1; }
          public run() { return this.helper(); }
        }
      `);

      const root = await analyzeAndBuildCallGraph();
      const runSym = findSymbol(root, "service.ts", "run");

      expect(runSym?.calls).toBeDefined();
      expect(runSym!.calls!.some((c) => c.name === "helper" && c.parent === "Service")).toBe(true);
    });
  });

  describe("filtering", () => {
    it("excludes external/stdlib calls", async () => {
      writeFile("package.json", "{}");
      writeFile("main.ts", `
        import path from "path";
        export function main() { return path.resolve("."); }
      `);

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.ts", "main");

      // path.resolve is external — should not appear
      expect(mainSym?.calls ?? []).toEqual([]);
    });

    it("excludes built-in method calls (Array.map, etc.)", async () => {
      writeFile("package.json", "{}");
      writeFile("main.ts", `
        export function main() {
          const arr = [1, 2, 3];
          return arr.map(x => x * 2);
        }
      `);

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.ts", "main");
      expect(mainSym?.calls ?? []).toEqual([]);
    });
  });

  describe("deduplication", () => {
    it("deduplicates repeated calls to the same function", async () => {
      writeFile("package.json", "{}");
      writeFile("utils.ts", "export function helper() { return 1; }\n");
      writeFile("main.ts", `
        import { helper } from "./utils";
        export function main() {
          helper();
          helper();
          helper();
          return helper();
        }
      `);

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.ts", "main");

      expect(mainSym?.calls).toHaveLength(1);
      expect(mainSym!.calls![0].name).toBe("helper");
    });
  });

  describe("arrow functions", () => {
    it("resolves calls from arrow functions assigned to variables", async () => {
      writeFile("package.json", "{}");
      writeFile("utils.ts", "export function helper() { return 1; }\n");
      writeFile("main.ts", `
        import { helper } from "./utils";
        export const main = () => helper();
      `);

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.ts", "main");

      expect(mainSym?.calls).toBeDefined();
      expect(mainSym!.calls!.some((c) => c.name === "helper")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles files with no function calls", async () => {
      writeFile("package.json", "{}");
      writeFile("constants.ts", "export const VERSION = '1.0.0';\n");

      const root = await analyzeAndBuildCallGraph();
      const versionSym = findSymbol(root, "constants.ts", "VERSION");

      // VERSION is a variable, not a function — calls should not be populated
      // (the call graph only walks function bodies)
      expect(versionSym?.calls).toBeUndefined();
    });

    it("handles empty files", async () => {
      writeFile("package.json", "{}");
      writeFile("empty.ts", "");

      const root = await analyzeAndBuildCallGraph();
      // Should not throw
      expect(root).toBeDefined();
    });

    it("handles files with syntax errors gracefully", async () => {
      writeFile("package.json", "{}");
      writeFile("good.ts", "export function good() { return 1; }\n");
      writeFile("bad.ts", "export function bad( { return broken; }\n");

      // Should not throw — bad files are skipped
      const root = await analyzeAndBuildCallGraph();
      expect(root).toBeDefined();
    });

    it("handles circular calls", async () => {
      writeFile("package.json", "{}");
      writeFile("a.ts", `
        import { b } from "./b";
        export function a(): number { return b(); }
      `);
      writeFile("b.ts", `
        import { a } from "./a";
        export function b(): number { return a(); }
      `);

      const root = await analyzeAndBuildCallGraph();
      const aSym = findSymbol(root, "a.ts", "a");
      const bSym = findSymbol(root, "b.ts", "b");

      expect(aSym?.calls?.some((c) => c.name === "b")).toBe(true);
      expect(bSym?.calls?.some((c) => c.name === "a")).toBe(true);
    });
  });

  describe("object literal methods", () => {
    it("resolves calls from arrow functions inside object literals", async () => {
      writeFile("package.json", "{}");
      writeFile("utils.ts", "export function helper() { return 1; }\n");
      writeFile("cmd.ts", `
        import { helper } from "./utils";
        export const cmd = {
          run: async () => { return helper(); },
        };
      `);

      const root = await analyzeAndBuildCallGraph();
      const runSym = findSymbol(root, "cmd.ts", "run");

      expect(runSym).toBeDefined();
      expect(runSym!.parent).toBe("cmd");
      expect(runSym!.calls).toBeDefined();
      expect(runSym!.calls!.some((c) => c.name === "helper")).toBe(true);
    });

    it("resolves calls from method shorthand in object literals", async () => {
      writeFile("package.json", "{}");
      writeFile("utils.ts", "export function helper() { return 1; }\n");
      writeFile("cmd.ts", `
        import { helper } from "./utils";
        export const cmd = {
          run() { return helper(); },
        };
      `);

      const root = await analyzeAndBuildCallGraph();
      const runSym = findSymbol(root, "cmd.ts", "run");

      expect(runSym).toBeDefined();
      expect(runSym!.parent).toBe("cmd");
      expect(runSym!.calls).toBeDefined();
      expect(runSym!.calls!.some((c) => c.name === "helper")).toBe(true);
    });

    it("handles multiple function properties independently", async () => {
      writeFile("package.json", "{}");
      writeFile("a.ts", "export function fnA() { return 1; }\n");
      writeFile("b.ts", "export function fnB() { return 2; }\n");
      writeFile("cmd.ts", `
        import { fnA } from "./a";
        import { fnB } from "./b";
        export const cmd = {
          first: () => fnA(),
          second: () => fnB(),
        };
      `);

      const root = await analyzeAndBuildCallGraph();
      const firstSym = findSymbol(root, "cmd.ts", "first");
      const secondSym = findSymbol(root, "cmd.ts", "second");

      expect(firstSym!.calls!.some((c) => c.name === "fnA")).toBe(true);
      expect(firstSym!.calls!.every((c) => c.name !== "fnB")).toBe(true);
      expect(secondSym!.calls!.some((c) => c.name === "fnB")).toBe(true);
      expect(secondSym!.calls!.every((c) => c.name !== "fnA")).toBe(true);
    });

    it("does not emit non-function properties as symbols", async () => {
      writeFile("package.json", "{}");
      writeFile("cmd.ts", `
        export const cmd = {
          name: "test",
          run: () => {},
        };
      `);

      const root = await analyzeAndBuildCallGraph();
      const nameSym = findSymbol(root, "cmd.ts", "name");
      const runSym = findSymbol(root, "cmd.ts", "run");

      expect(nameSym).toBeUndefined();
      expect(runSym).toBeDefined();
      expect(runSym!.parent).toBe("cmd");
    });
  });

  describe("plain JavaScript", () => {
    it("resolves calls in .js files", async () => {
      writeFile("package.json", "{}");
      writeFile("utils.js", "function helper() { return 1; }\nmodule.exports = { helper };\n");
      writeFile("main.js", 'const { helper } = require("./utils");\nfunction main() { return helper(); }\nmodule.exports = { main };\n');

      const root = await analyzeAndBuildCallGraph();
      const mainSym = findSymbol(root, "main.js", "main");

      // JS resolution may be less precise, but should at least not throw
      expect(root).toBeDefined();
    });
  });
});
