import type { Command } from "../types";

const HELP = `
grail - codebase analyzer

Usage:
  grail-ai <command> [flags]

Commands:
  tree                     Show file tree
  summary                  File summaries with symbols + deps
  dependencies             What a file imports (with signatures)
  dependents               What imports a file (with consumed symbols)
  externals                External packages
  entry-points             Files nothing imports
  cycles                   Circular dependencies
  files                    List all file paths
  calls                    What does this function call
  callers                  What calls this function
  read                     Read a symbol's source code
  json                     Full AST as JSON
  skill                    Print or install Claude Code skill

Flags:
  --path <dir>             Project directory (required for all analysis commands)
  --file <file>            Target file (relative to project root)
  --symbol <name>          Target symbol name
  --parent <name>          Parent container (class/object) for methods
  --line <n>               Line number (for read: find enclosing symbol)
  --depth <n>              Limit traversal depth
  --transitive             Follow calls/callers transitively
  --install                Install skill (with skill command)

Examples:
  grail-ai summary --path .
  grail-ai summary --path . --file src/index.ts
  grail-ai dependencies --path . --file src/index.ts
  grail-ai calls --path . --file src/cmd.ts --symbol run --parent cmd
  grail-ai read --path . --file src/cmd.ts --symbol run --parent cmd
  grail-ai read --path . --file src/cmd.ts --line 18
  grail-ai skill --install
`.trim();

export const help: Command = {
  name: "help",
  run: async () => {
    console.log(HELP);
    process.exit(0);
  },
};
