import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import ts from 'typescript';

const PACKAGE_DIR = path.join(__dirname, '..', '..');
const SRC_DIR = path.join(PACKAGE_DIR, 'src');
const STUB_SUFFIX = '-web-extension.ts';

const parse = (file: string, kind = ts.ScriptKind.TS) =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    kind
  );

/** Calls `fn` on `node` and every node below it */
const walk = (node: ts.Node, fn: (node: ts.Node) => void) => {
  fn(node);
  ts.forEachChild(node, child => walk(child, fn));
};

/**
 * The name of the module an `onResolve` hook swaps for a stub: the hook either
 * spells out the stub (`'/<name>-web-extension.ts'`), or appends the suffix to
 * the import path, which its filter then names (`/<name>$/`).
 */
function substitutedName(
  hook: ts.CallExpression,
  source: ts.SourceFile
): string {
  const [options, callback] = hook.arguments;
  let name: string | undefined;
  walk(callback, node => {
    const match =
      ts.isStringLiteral(node) && /^\/([\w-]+)-web-extension\.ts$/.exec(node.text);
    if (match) {
      name = match[1];
    }
  });
  if (name) {
    return name;
  }
  const filter = ts.isObjectLiteralExpression(options)
    ? options.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && p.name.getText(source) === 'filter'
      )
    : undefined;
  const pattern = filter?.initializer.getText(source) ?? '';
  const match = /^\/\^?([\w-]+)\$?\/[a-z]*$/.exec(pattern);
  if (!match) {
    throw new Error(`Cannot tell which module ${pattern} replaces`);
  }
  return match[1];
}

/**
 * The modules the web build replaces with a stub, read from the esbuild.js
 * `build.onResolve` hooks that resolve to a `*-web-extension.ts` file.
 */
function substitutedModuleNames(): string[] {
  const source = parse(path.join(PACKAGE_DIR, 'esbuild.js'), ts.ScriptKind.JS);
  const names: string[] = [];
  walk(source, node => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'build.onResolve' &&
      node.arguments[1]?.getText(source).includes(STUB_SUFFIX)
    ) {
      names.push(substitutedName(node, source));
    }
  });
  return names;
}

const bindingNames = (name: ts.BindingName): string[] =>
  ts.isIdentifier(name)
    ? [name.text]
    : name.elements.flatMap(element =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
      );

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === kind);

/**
 * The names a module exports at runtime, sorted. Type-only exports are left
 * out: esbuild erases them without checking them, so a stub need not declare
 * them, and tsc checks the importers' types against the replaced module.
 */
function runtimeExports(file: string): string[] {
  const source = parse(file);
  const typeNames = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      typeNames.add(statement.name.text);
    }
    const clause = ts.isImportDeclaration(statement)
      ? statement.importClause
      : undefined;
    const bindings = clause?.namedBindings;
    if (clause?.isTypeOnly && clause.name) {
      typeNames.add(clause.name.text);
    }
    if (bindings && ts.isNamedImports(bindings)) {
      bindings.elements
        .filter(element => clause.isTypeOnly || element.isTypeOnly)
        .forEach(element => typeNames.add(element.name.text));
    }
  }

  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) {
        continue;
      }
      const clause = statement.exportClause;
      if (!clause) {
        names.add(
          `* from ${(statement.moduleSpecifier as ts.StringLiteral).text}`
        );
      } else if (ts.isNamespaceExport(clause)) {
        names.add(clause.name.text);
      } else {
        for (const element of clause.elements) {
          const local = (element.propertyName ?? element.name).getText(source);
          const isType =
            element.isTypeOnly ||
            (!statement.moduleSpecifier && typeNames.has(local));
          if (!isType) {
            names.add(element.name.getText(source));
          }
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      names.add(statement.isExportEquals ? 'export =' : 'default');
    } else if (
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement)
    ) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        names.add('default');
      } else if (ts.isVariableStatement(statement)) {
        statement.declarationList.declarations
          .flatMap(declaration => bindingNames(declaration.name))
          .forEach(name => names.add(name));
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement) ||
          ts.isModuleDeclaration(statement)) &&
        statement.name
      ) {
        names.add(statement.name.getText(source));
      }
    }
  }
  return [...names].sort();
}

const sourceFiles = (
  readdirSync(SRC_DIR, { recursive: true }) as string[]
).map(file => path.join(SRC_DIR, file));

const substituted = substitutedModuleNames();

const stubs = substituted.flatMap(name =>
  sourceFiles
    .filter(file => path.basename(file) === name + STUB_SUFFIX)
    .map(file => ({
      name,
      stub: path.relative(SRC_DIR, file).split(path.sep).join('/'),
      stubFile: file,
      originalFile: path.join(path.dirname(file), name + '.ts'),
    }))
);

describe('Web build stubs', () => {
  it('exist, next to the module they replace, for every substitution in esbuild.js', () => {
    expect(substituted).not.toEqual([]);
    for (const name of substituted) {
      expect({ name, hasStub: stubs.some(s => s.name === name) }).toEqual({
        name,
        hasStub: true,
      });
    }
    for (const { stub, originalFile } of stubs) {
      expect({ stub, hasOriginal: existsSync(originalFile) }).toEqual({
        stub,
        hasOriginal: true,
      });
    }
  });

  it.each(stubs)(
    '$stub exports the runtime names of the module it replaces',
    ({ stub, stubFile, originalFile }) => {
      expect({ stub, exports: runtimeExports(stubFile) }).toEqual({
        stub,
        exports: runtimeExports(originalFile),
      });
    }
  );
});
