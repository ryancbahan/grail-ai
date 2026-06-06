import fs from "fs";
import path from "path";
import os from "os";
import { resolveRubyImport } from "./resolver";
import type { ResolveContext } from "@grail-ai/core";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "grail-ruby-resolver-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string = "") {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function context(containingFile: string): ResolveContext {
  return {
    containingFile: path.join(tmpDir, containingFile),
    projectRoot: tmpDir,
  };
}

describe("resolveRubyImport", () => {
  describe("require_relative (relative paths)", () => {
    it("resolves relative require with .rb extension", () => {
      writeFile("lib/utils.rb");
      const result = resolveRubyImport("./utils", context("lib/main.rb"));
      expect(result).toBe(path.join(tmpDir, "lib/utils.rb"));
    });

    it("resolves parent-relative require", () => {
      writeFile("helpers.rb");
      const result = resolveRubyImport("../helpers", context("lib/main.rb"));
      expect(result).toBe(path.join(tmpDir, "helpers.rb"));
    });

    it("resolves file with .rb extension already present", () => {
      writeFile("lib/utils.rb");
      const result = resolveRubyImport("./utils.rb", context("lib/main.rb"));
      expect(result).toBe(path.join(tmpDir, "lib/utils.rb"));
    });
  });

  describe("require (absolute-style paths)", () => {
    it("resolves from lib/ directory", () => {
      writeFile("lib/models/user.rb");
      const result = resolveRubyImport("models/user", context("app/main.rb"));
      expect(result).toBe(path.join(tmpDir, "lib/models/user.rb"));
    });

    it("resolves from project root", () => {
      writeFile("config.rb");
      const result = resolveRubyImport("config", context("lib/main.rb"));
      expect(result).toBe(path.join(tmpDir, "config.rb"));
    });

    it("returns null for stdlib modules", () => {
      expect(resolveRubyImport("json", context("main.rb"))).toBeNull();
      expect(resolveRubyImport("yaml", context("main.rb"))).toBeNull();
      expect(resolveRubyImport("net/http", context("main.rb"))).toBeNull();
    });

    it("returns null for gems (unresolvable)", () => {
      expect(resolveRubyImport("rails", context("main.rb"))).toBeNull();
      expect(resolveRubyImport("sinatra", context("main.rb"))).toBeNull();
    });
  });
});
