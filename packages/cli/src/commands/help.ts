import type { Command } from "../types";

const HELP = `
grail - codebase analyzer

Usage:
  grail <path>                          Show file tree
  grail <path> summary [file]           File summaries with symbols + deps
  grail <path> dependencies <file>      What a file imports (with signatures)
  grail <path> dependents <file>        What imports a file (with consumed symbols)
  grail <path> externals [file]         External packages
  grail <path> entry-points             Files nothing imports
  grail <path> cycles                   Circular dependencies
  grail <path> files                    List all file paths
  grail <path> calls <file> <symbol>    What does this function call (with signatures)
  grail <path> callers <file> <symbol>  What calls this function
  grail <path> read <file> <symbol>     Read a symbol's source code
  grail <path> json                     Full AST as JSON

  grail skill                           Print Claude Code skill to stdout
  grail skill --install [path]          Install skill to a path (default: .claude/skills/grail/SKILL.md)

Options:
  --depth <n>                           Limit traversal depth (directory or call chain)
  --transitive                          Follow calls/callers transitively (full chain)
`.trim();

export const help: Command = {
  name: "help",
  run: async () => {
    console.log(HELP);
    process.exit(0);
  },
};
