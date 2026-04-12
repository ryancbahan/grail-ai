import fs from "fs";
import path from "path";
import os from "os";
import {
  resolveJavaScriptImport,
  clearResolverCache,
} from "../core/languages/javascript-resolver";
import { ResolveContext } from "../core/languages/types";

let tmpDir: string;
let ctx: ResolveContext;

function touch(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, "");
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-resolver-"));
  ctx = {
    containingFile: path.join(tmpDir, "src", "index.ts"),
    projectRoot: tmpDir,
  };
  // Ensure the containing file's directory exists
  fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  clearResolverCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveJavaScriptImport", () => {
  describe("relative paths", () => {
    it("resolves relative path with extension", () => {
      touch(path.join(tmpDir, "src", "utils.ts"));
      const result = resolveJavaScriptImport("./utils.ts", ctx);
      expect(result).toBe(path.join(tmpDir, "src", "utils.ts"));
    });

    it("resolves relative path without extension (probes .ts)", () => {
      touch(path.join(tmpDir, "src", "utils.ts"));
      const result = resolveJavaScriptImport("./utils", ctx);
      expect(result).toBe(path.join(tmpDir, "src", "utils.ts"));
    });

    it("resolves relative path without extension (probes .tsx)", () => {
      touch(path.join(tmpDir, "src", "App.tsx"));
      const result = resolveJavaScriptImport("./App", ctx);
      expect(result).toBe(path.join(tmpDir, "src", "App.tsx"));
    });

    it("resolves relative path without extension (probes .js)", () => {
      touch(path.join(tmpDir, "src", "helper.js"));
      const result = resolveJavaScriptImport("./helper", ctx);
      expect(result).toBe(path.join(tmpDir, "src", "helper.js"));
    });

    it("resolves directory to index file", () => {
      touch(path.join(tmpDir, "src", "utils", "index.ts"));
      const result = resolveJavaScriptImport("./utils", ctx);
      expect(result).toBe(path.join(tmpDir, "src", "utils", "index.ts"));
    });

    it("resolves parent directory import", () => {
      touch(path.join(tmpDir, "lib", "helper.ts"));
      const result = resolveJavaScriptImport("../lib/helper", ctx);
      expect(result).toBe(path.join(tmpDir, "lib", "helper.ts"));
    });

    it("returns null for unresolvable relative path", () => {
      const result = resolveJavaScriptImport("./nonexistent", ctx);
      expect(result).toBeNull();
    });
  });

  describe("node builtins", () => {
    it("returns null for builtin module", () => {
      expect(resolveJavaScriptImport("fs", ctx)).toBeNull();
      expect(resolveJavaScriptImport("path", ctx)).toBeNull();
      expect(resolveJavaScriptImport("http", ctx)).toBeNull();
    });

    it("returns null for node: prefixed builtin", () => {
      expect(resolveJavaScriptImport("node:fs", ctx)).toBeNull();
      expect(resolveJavaScriptImport("node:path", ctx)).toBeNull();
    });
  });

  describe("external packages", () => {
    it("returns null for npm package", () => {
      expect(resolveJavaScriptImport("lodash", ctx)).toBeNull();
    });

    it("returns null for scoped package", () => {
      expect(resolveJavaScriptImport("@babel/core", ctx)).toBeNull();
    });

    it("returns null for package subpath", () => {
      expect(resolveJavaScriptImport("lodash/merge", ctx)).toBeNull();
    });
  });

  describe("tsconfig paths", () => {
    it("resolves a tsconfig path alias", () => {
      touch(path.join(tmpDir, "src", "lib", "foo.ts"));
      fs.writeFileSync(
        path.join(tmpDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["src/*"] },
          },
        })
      );

      const result = resolveJavaScriptImport("@/lib/foo", ctx);
      expect(result).toBe(path.join(tmpDir, "src", "lib", "foo.ts"));
    });

    it("resolves tsconfig path with baseUrl", () => {
      touch(path.join(tmpDir, "src", "utils.ts"));
      fs.writeFileSync(
        path.join(tmpDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: "src",
            paths: { "~/*": ["./*"] },
          },
        })
      );

      const result = resolveJavaScriptImport("~/utils", ctx);
      expect(result).toBe(path.join(tmpDir, "src", "utils.ts"));
    });

    it("falls back to external when tsconfig path does not resolve", () => {
      fs.writeFileSync(
        path.join(tmpDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["src/*"] },
          },
        })
      );

      const result = resolveJavaScriptImport("@/nonexistent", ctx);
      expect(result).toBeNull();
    });

    it("works without tsconfig.json", () => {
      const result = resolveJavaScriptImport("@/lib/foo", ctx);
      expect(result).toBeNull();
    });
  });
});
