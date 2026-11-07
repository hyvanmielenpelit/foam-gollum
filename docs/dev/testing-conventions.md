# Testing in Foam VS Code Extension

This document explains the testing strategy and conventions used in the Foam VS Code extension.

## Test File Types

We use two distinct types of test files, each serving different purposes:

### `.test.ts` Files - Pure Unit Tests

- **Purpose**: Test business logic and algorithms in complete isolation
- **Dependencies**: No VS Code APIs dependencies
- **Environment**: Vitest with Node.js
- **Speed**: Very fast execution
- **Location**: Throughout the codebase alongside source files

### `.spec.ts` Files - Integration Tests with VS Code APIs

- **Purpose**: Test features that integrate with VS Code APIs and user workflows
- **Dependencies**: Will likely depend on VS Code APIs (`vscode` module), otherwise avoid incurring the performance hit
- **Environment**: Can run in TWO environments:
  - **Mock Environment**: Vitest with VS Code API mocks (fast)
  - **Real VS Code**: Full VS Code extension host (slow but comprehensive)
- **Speed**: Depends on environment (see performance section below)
- **Location**: Primarily in `src/vscode/features/` and service layers

## Key Principle: Environment Flexibility for `.spec.ts` Files

**`.spec.ts` files use VS Code APIs**, but they can run in different environments:

- **Mock Environment**: Uses our VS Code API mocks for speed
- **Real VS Code**: Uses actual VS Code extension host for full integration testing

This dual-environment capability allows us to:

- Run specs quickly during development (mock environment)
- Verify full integration during CI/CD (real VS Code environment)
- Gradually migrate specs to mock-compatible implementations

## Performance Comparison

| Test Type             | Environment            | Typical Duration | VS Code APIs     |
| --------------------- | ---------------------- | ---------------- | ---------------- |
| **`.test.ts`**        | Vitest (Node.js)       | fastest          | **No**           |
| **`.spec.ts` (mock)** | Vitest + VS Code Mocks | fast             | **Yes** (mocked) |
| **`.spec.ts` (real)** | VS Code Extension Host | sloooooow.       | **Yes** (real)   |

## Running Tests

### Available Commands

- **`yarn test:unit`**: Runs `.test.ts` files (no VS Code dependencies) + `@unit-ready` marked `.spec.ts` files using mocks
- **`yarn test:unit-without-specs`**: Runs only `.test.ts` files
- **`yarn test:e2e`**: Runs all `.spec.ts` files in full VS Code extension host
- **`yarn test`**: Runs both unit and e2e test suites sequentially

## Mock Environment Migration

We're gradually enabling `.spec.ts` files to run in our fast mock environment while maintaining their ability to run in real VS Code.

### The `@unit-ready` Annotation

Spec files marked with `/* @unit-ready */` or `// @unit-ready` can run in both environments (`vitest.config.mts` looks for either form):

```typescript
/* @unit-ready */
import * as vscode from 'vscode';
// ... test uses VS Code APIs but works with our mocks
```

### Common Migration Fixes

**Configuration defaults**: Our mocks don't load package.json defaults

```typescript
// Before
const afterCompletion = getFoamVsCodeConfig('dateSnippets.afterCompletion');

// After (defensive)
const afterCompletion = getFoamVsCodeConfig(
  'dateSnippets.afterCompletion',
  'createNote'
);
```

**File system operations**: Ensure proper async handling

```typescript
// Mock file operations are immediate but still async
await vscode.workspace.fs.writeFile(uri, content);
```

### When NOT to Migrate

Some specs should remain real-VS-Code-only:

- Tests verifying complex VS Code UI interactions
- Tests requiring real file system watching with timing
- Tests validating extension packaging or activation
- Tests that depend on VS Code's complex internal state management

## Mock System Capabilities

Our `vscode-mock.ts` provides comprehensive VS Code API mocking:

- **Types and enums**: `Uri`, `Position`, `Range`, `Selection`, `TextEdit`, `WorkspaceEdit`, `Diagnostic`, `CompletionItem`, `MarkdownString`, `TreeItem`, `EventEmitter` and the enums specs use
- **`workspace`**: documents and `workspace.fs` backed by real files in the test workspace, file system watchers, `findFiles`, `applyEdit`, configuration (without the `package.json` defaults, see above) and the document and file events
- **`window`**: text editors and `showTextDocument`, messages, input boxes and quick picks, tree views, decorations and output channels
- **`commands`, `languages`, `env` and `extensions`**: command registration and execution, the language providers Foam registers, diagnostics collections, and the clipboard
- **Foam itself**: `getTestFoam()` initializes a Foam instance over the test workspace, and `resetMockState()` and `forceCleanup()` reset between tests

## Contributing Guidelines

When adding new tests:

1. **Choose the right type**:

   - Use `.test.ts` for pure business logic with no VS Code dependencies
   - Use `.spec.ts` for anything that needs VS Code APIs

2. **Consider mock compatibility**:

   - When writing `.spec.ts` files, consider if they could run in mock environment
   - Add `/* @unit-ready */` (or `// @unit-ready`) if the test works with our mocks

3. **Follow naming conventions**:

   - Test files should be co-located with source files when possible
   - Use descriptive test names that explain the expected behavior

4. **Performance awareness**:
   - Prefer unit tests for business logic (fastest)
   - Use mock-compatible specs for VS Code integration (fast)
   - Reserve real VS Code specs for complex integration scenarios (comprehensive)

This testing strategy gives us the best of both worlds: fast feedback during development and comprehensive integration verification when needed.

## Gollum Test Convention

Foam for Gollum defaults to Gollum wikilink syntax, while upstream specs assume MediaWiki syntax.

- Pin an upstream describe to MediaWiki with `useFoamConfiguration(MEDIAWIKI_SYNTAX)` inside the describe (in a `*.test.ts`, a `Config.setDefaultConfig` override). Never pin at file level, and never change an upstream expectation.
- Put Gollum cases in their own `... with Gollum syntax` describe that sets `GOLLUM_SYNTAX` explicitly, set up and torn down inside the test.

## End-to-End Tests in VS Code

`yarn test:e2e` runs every `*.spec.ts` with Vitest inside a real VS Code extension host:

- `src/test/run-tests.ts` downloads and launches the pinned VS Code version (the `version` passed to `runTests`) with an isolated user data directory and the test workspace. Linux CI runs it under `xvfb-run`.
- `src/test/suite.ts` starts Vitest in the extension host. Its custom in-process pool, `src/test/support/vitest-pool-vscode.ts`, is a `PoolWorker` that loops messages back to Vitest's worker runtime from `vitest/worker` instead of starting worker processes, which could not `require('vscode')`.
- The custom runner, `src/test/support/vitest-runner-vscode.ts`, loads the tsc-compiled specs from `out/` with Node's `require`, so that `require('vscode')` reaches the extension host.
- Tests use the real `vi` and `expect`. Console interception is disabled, and files run one at a time.

## Benchmarks

Performance-sensitive code has `*.bench.ts` files, run with Vitest 5's bench API. Each benchmark group is a test whose name carries a complexity marker, `[linear]` or `[flat]`, with one bench per input size:

```typescript
test('graph build [linear]', async ({ bench }) => {
  await bench.compare(
    ...sizes.map(n => bench(`${n} notes`, () => buildGraph(n)))
  );
});
```

The JSON reporter writes the results to `out/perf/perf-current.json`. `yarn bench` produces it, `yarn bench:seed` copies it to the baseline when none exists, and `yarn bench:compare` checks it, through the shared logic in `scripts/perf/`, against the baseline and for scaling that breaks its marker.

## Error Reporting

Non-production builds never report errors to Sentry. The DSN is built into the bundle only by `esbuild.js --production`; development builds and tests (`vitest.config.mts` defines `__FOAM_SENTRY_DSN__` as empty) have none.

## Graph Webview (`@foam/graph-view`)

The webview component has its own test stack, separate from the extension tests.

- **Framework**: [Vitest](https://vitest.dev/) with [happy-dom](https://github.com/capricorn86/happy-dom) for a browser-like environment
- **Location**: Test files live in `packages/foam-graph/src/`
- **Command**: `yarn workspace @foam/graph-view test`

The webview tests focus on the framework-agnostic library code in `src/lib/` (graph utilities, color logic, painter). Lit component rendering tests can be added as the component grows.
