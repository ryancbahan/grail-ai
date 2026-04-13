import { execSync } from "child_process";
import path from "path";

const CLI = path.resolve(__dirname, "index.ts");

function run(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`npx ts-node ${CLI} ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: (e.stdout ?? "").trim(), exitCode: e.status ?? 1 };
  }
}

function parseOutput(args: string): { error?: string; suggestion?: string } {
  const { stdout } = run(args);
  try {
    return JSON.parse(stdout);
  } catch {
    return { error: `Unparseable output: ${stdout.slice(0, 100)}` };
  }
}

describe("CLI error handling", () => {
  describe("path errors", () => {
    it("returns JSON for nonexistent path", () => {
      const result = parseOutput("/nonexistent/path summary");
      expect(result.error).toContain("not found");
      expect(result.suggestion).toBeDefined();
    });
  });

  describe("missing arguments", () => {
    it("returns JSON for missing file in dependencies", () => {
      const result = parseOutput(". dependencies");
      expect(result.error).toContain("Missing");
      expect(result.suggestion).toContain("Usage");
    });

    it("returns JSON for missing file in dependents", () => {
      const result = parseOutput(". dependents");
      expect(result.error).toContain("Missing");
      expect(result.suggestion).toContain("Usage");
    });

    it("returns JSON for missing symbol in calls", () => {
      const result = parseOutput(". calls packages/core/src/analyze.ts");
      expect(result.error).toContain("Missing");
    });

    it("returns JSON for missing symbol in callers", () => {
      const result = parseOutput(". callers packages/core/src/analyze.ts");
      expect(result.error).toContain("Missing");
    });

    it("returns JSON for missing file in read", () => {
      const result = parseOutput(". read");
      expect(result.error).toContain("Missing");
    });

    it("returns JSON for missing symbol in read", () => {
      const result = parseOutput(". read packages/core/src/analyze.ts");
      expect(result.error).toContain("Missing");
    });
  });

  describe("file not found", () => {
    it("returns JSON for nonexistent file in dependencies", () => {
      const result = parseOutput(". dependencies nonexistent.ts");
      expect(result.error).toContain("not found");
      expect(result.suggestion).toBeDefined();
    });

    it("returns JSON for nonexistent file in summary", () => {
      const result = parseOutput(". summary nonexistent.ts");
      expect(result.error).toContain("not found");
    });

    it("returns JSON for nonexistent file in externals", () => {
      const result = parseOutput(". externals nonexistent.ts");
      expect(result.error).toContain("not found");
    });
  });

  describe("symbol not found", () => {
    it("returns JSON for nonexistent symbol in read", () => {
      const result = parseOutput(". read packages/core/src/analyze.ts nonexistent_fn");
      expect(result.error).toContain("not found");
      expect(result.suggestion).toBeDefined();
    });
  });

  describe("unknown command", () => {
    it("returns JSON for unknown command", () => {
      const result = parseOutput(". foobar");
      expect(result.error).toContain("Unknown command");
      expect(result.suggestion).toContain("--help");
    });
  });

  describe("output is always valid JSON", () => {
    it("nonexistent path is parseable JSON", () => {
      const { stdout, exitCode } = run("/nonexistent summary");
      expect(exitCode).not.toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it("missing arg is parseable JSON", () => {
      const { stdout, exitCode } = run(". dependencies");
      expect(exitCode).not.toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });

    it("unknown command is parseable JSON", () => {
      const { stdout, exitCode } = run(". foobar");
      expect(exitCode).not.toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });
  });
});
