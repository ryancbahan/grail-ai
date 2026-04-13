import { execSync } from "child_process";
import path from "path";

const CLI = path.resolve(__dirname, "../../../cli/dist/index.js");
const ROOT = path.resolve(__dirname, "../../../..");
const TIMEOUT = 30000;

export function grail(args: string): string {
  return execSync(`node ${CLI} ${args}`, {
    encoding: "utf-8",
    timeout: TIMEOUT,
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function json(args: string): any {
  const output = grail(args);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Expected JSON output, got:\n${output.slice(0, 500)}`);
  }
}

export function jsonError(args: string): any {
  try {
    const output = execSync(`node ${CLI} ${args}`, {
      encoding: "utf-8",
      timeout: TIMEOUT,
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    throw new Error(`Expected error, but command succeeded with:\n${output.slice(0, 500)}`);
  } catch (err: any) {
    if (err.message?.startsWith("Expected error")) throw err;
    const stdout = (err.stdout ?? "").trim();
    const stderr = (err.stderr ?? "").trim();
    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error(
        `CLI error output was not JSON.\nstdout: ${stdout.slice(0, 300)}\nstderr: ${stderr.slice(0, 300)}`
      );
    }
  }
}
