#!/usr/bin/env node

import type { Command } from "./types";
import { fail, parseArgs } from "./utils/util";

import { help } from "./commands/help";
import { skill } from "./commands/skill";
import { tree } from "./commands/tree";
import { summary } from "./commands/summary";
import { dependencies } from "./commands/dependencies";
import { dependents } from "./commands/dependents";
import { externals } from "./commands/externals";
import { entryPoints } from "./commands/entry-points";
import { cycles } from "./commands/cycles";
import { files } from "./commands/files";
import { calls } from "./commands/calls";
import { callers } from "./commands/callers";
import { read } from "./commands/read";
import { jsonCmd } from "./commands/json";

const commands: Command[] = [
  help, skill, tree, summary, dependencies, dependents, externals,
  entryPoints, cycles, files, calls, callers, read, jsonCmd,
];

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    await help.run({ transitive: false });
    return;
  }

  const { commandName, flags } = parseArgs(argv);

  const command = commands.find((c) => c.name === commandName);
  if (!command) fail(`Unknown command: ${commandName}`, "Run with --help to see available commands");

  await command.run(flags);
}

main().catch((err: unknown) => {
  const nodeErr = err as NodeJS.ErrnoException;
  const message = err instanceof Error ? err.message : String(err);

  if (nodeErr.code === "ENOENT") {
    fail(`Path not found: ${nodeErr.path ?? "unknown"}`, "Check the path exists");
  } else if (nodeErr.code === "ENOTDIR") {
    fail(`Expected a directory: ${nodeErr.path ?? "unknown"}`, "Pass a project directory as the first argument");
  } else if (nodeErr.code === "EACCES") {
    fail(`Permission denied: ${nodeErr.path ?? "unknown"}`, "Check file permissions");
  } else {
    fail(message);
  }
});
