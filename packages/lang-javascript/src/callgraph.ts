import path from "path";
import {
  Project,
  SyntaxKind,
  Node,
  FunctionDeclaration,
  MethodDeclaration,
  ArrowFunction,
  FunctionExpression,
  SourceFile,
  CallExpression,
  ts,
} from "ts-morph";
import type { FileEntry, SymbolRef } from "@grail-ai/core";

type FunctionLike = FunctionDeclaration | MethodDeclaration | ArrowFunction | FunctionExpression;

const JS_TS_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

function isJsTsFile(filePath: string): boolean {
  return JS_TS_EXTENSIONS.has(path.extname(filePath));
}

function buildSymbolMap(files: FileEntry[], projectRoot: string): Map<string, FileEntry["node"]["symbols"][number]> {
  const map = new Map<string, FileEntry["node"]["symbols"][number]>();
  for (const { filePath, node } of files) {
    const rel = path.relative(projectRoot, filePath);
    for (const sym of node.symbols) {
      const key = sym.parent ? `${rel}:${sym.parent}.${sym.name}` : `${rel}:${sym.name}`;
      map.set(key, sym);
    }
  }
  return map;
}

function getAllFunctions(sourceFile: SourceFile): FunctionLike[] {
  const funcs: FunctionLike[] = [];

  // Top-level and exported functions
  funcs.push(...sourceFile.getFunctions());

  // Class methods
  for (const cls of sourceFile.getClasses()) {
    funcs.push(...cls.getMethods());
  }

  // Arrow functions and function expressions assigned to variables,
  // plus function properties inside object literals
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const init = varDecl.getInitializer();
    if (!init) continue;

    if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
      funcs.push(init);
    } else if (Node.isObjectLiteralExpression(init)) {
      for (const prop of init.getProperties()) {
        if (Node.isMethodDeclaration(prop)) {
          funcs.push(prop);
        } else if (Node.isPropertyAssignment(prop)) {
          const propInit = prop.getInitializer();
          if (propInit && (Node.isArrowFunction(propInit) || Node.isFunctionExpression(propInit))) {
            funcs.push(propInit);
          }
        }
      }
    }
  }

  // Exported variable statements
  for (const exportDecl of sourceFile.getExportedDeclarations().values()) {
    for (const decl of exportDecl) {
      if (Node.isVariableDeclaration(decl)) {
        const init = decl.getInitializer();
        if (!init) continue;

        if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
          if (!funcs.includes(init)) funcs.push(init);
        } else if (Node.isObjectLiteralExpression(init)) {
          for (const prop of init.getProperties()) {
            if (Node.isMethodDeclaration(prop)) {
              if (!funcs.includes(prop)) funcs.push(prop);
            } else if (Node.isPropertyAssignment(prop)) {
              const propInit = prop.getInitializer();
              if (propInit && (Node.isArrowFunction(propInit) || Node.isFunctionExpression(propInit))) {
                if (!funcs.includes(propInit)) funcs.push(propInit);
              }
            }
          }
        }
      }
    }
  }

  return funcs;
}

function getFunctionName(func: FunctionLike): string | null {
  if (Node.isFunctionDeclaration(func)) {
    return func.getName() ?? null;
  }
  if (Node.isMethodDeclaration(func)) {
    return func.getName() ?? null;
  }
  // Arrow function / function expression — get name from variable or property
  const parent = func.getParent();
  if (parent && Node.isVariableDeclaration(parent)) {
    return parent.getName();
  }
  if (parent && Node.isPropertyAssignment(parent)) {
    return parent.getName();
  }
  return null;
}

function getContainerName(func: FunctionLike): string | undefined {
  // Class method → class name
  if (Node.isMethodDeclaration(func)) {
    const parent = func.getParent();
    if (parent && Node.isClassDeclaration(parent)) {
      return parent.getName();
    }
    // Method shorthand inside object literal assigned to a variable
    if (parent && Node.isObjectLiteralExpression(parent)) {
      const varDecl = parent.getParent();
      if (varDecl && Node.isVariableDeclaration(varDecl)) {
        return varDecl.getName();
      }
    }
  }

  // Arrow / function expression inside a property assignment
  const funcParent = func.getParent();
  if (funcParent && Node.isPropertyAssignment(funcParent)) {
    const objLiteral = funcParent.getParent();
    if (objLiteral && Node.isObjectLiteralExpression(objLiteral)) {
      const varDecl = objLiteral.getParent();
      if (varDecl && Node.isVariableDeclaration(varDecl)) {
        return varDecl.getName();
      }
    }
  }

  return undefined;
}

function resolveCall(call: CallExpression, projectRoot: string): SymbolRef | null {
  try {
    const expr = call.getExpression();
    let sym: ReturnType<typeof expr.getSymbol>;

    if (Node.isPropertyAccessExpression(expr)) {
      sym = expr.getNameNode().getSymbol();
    } else {
      sym = expr.getSymbol();
    }

    if (!sym) return null;

    // Follow through imports to the actual declaration
    try {
      const aliased = sym.getAliasedSymbol();
      if (aliased) sym = aliased;
    } catch {
      // Not an alias — use original symbol
    }

    const declarations = sym.getDeclarations();
    if (declarations.length === 0) return null;

    const decl = declarations[0];

    // Skip interface property/method signatures — not actual call targets
    if (Node.isPropertySignature(decl) || Node.isMethodSignature(decl)) return null;

    const declFile = decl.getSourceFile();
    const declFilePath = declFile.getFilePath();

    // Skip external (node_modules, lib files)
    if (declFilePath.includes("node_modules") || declFilePath.includes("/lib.")) return null;

    const rel = path.relative(projectRoot, declFilePath);
    if (rel.startsWith("..")) return null; // outside project

    // Get the callee name
    let calleeName: string | null = null;
    let parent: string | undefined;

    if (Node.isFunctionDeclaration(decl)) {
      calleeName = decl.getName() ?? null;
    } else if (Node.isMethodDeclaration(decl)) {
      calleeName = decl.getName();
      const cls = decl.getParent();
      if (cls && Node.isClassDeclaration(cls)) {
        parent = cls.getName();
      }
    } else if (Node.isVariableDeclaration(decl)) {
      calleeName = decl.getName();
    }

    if (!calleeName) return null;

    const sourceFile = call.getSourceFile();
    const callStart = sourceFile.getLineAndColumnAtPos(call.getStart());
    const callEnd = sourceFile.getLineAndColumnAtPos(call.getEnd());
    const callContext = call.getFullText().trim().split("\n")[0];

    return {
      file: rel,
      name: calleeName,
      parent,
      range: {
        start: { line: callStart.line, column: callStart.column - 1 },
        end: { line: callEnd.line, column: callEnd.column - 1 },
      },
      context: callContext,
    };
  } catch {
    return null;
  }
}

export async function buildJavaScriptCallGraph(
  projectRoot: string,
  files: FileEntry[]
): Promise<void> {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      strict: false,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  const jsFiles = files.filter(({ filePath }) => isJsTsFile(filePath));
  for (const { filePath } of jsFiles) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch {
      // Skip files that can't be added
    }
  }

  const symbolMap = buildSymbolMap(files, projectRoot);

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (filePath.includes("node_modules")) continue;

    const rel = path.relative(projectRoot, filePath);

    for (const func of getAllFunctions(sourceFile)) {
      const funcName = getFunctionName(func);
      if (!funcName) continue;

      const containerName = getContainerName(func);
      const key = containerName ? `${rel}:${containerName}.${funcName}` : `${rel}:${funcName}`;
      const sym = symbolMap.get(key);
      if (!sym) continue;

      const calls: SymbolRef[] = [];
      const seen = new Set<string>();

      for (const call of func.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const resolved = resolveCall(call, projectRoot);
        if (!resolved) continue;

        const callKey = resolved.parent
          ? `${resolved.file}:${resolved.parent}.${resolved.name}`
          : `${resolved.file}:${resolved.name}`;

        if (!seen.has(callKey)) {
          seen.add(callKey);
          calls.push(resolved);
        }
      }

      sym.calls = calls;
    }
  }
}
