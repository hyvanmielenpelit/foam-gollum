// also see https://code.visualstudio.com/api/working-with-extensions/bundling-extension
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const polyfillPlugin = require('esbuild-plugin-polyfill-node');

// pass the platform to esbuild as an argument

function getPlatform() {
  const args = process.argv.slice(2);
  const pArg = args.find(arg => arg.startsWith('--platform='));
  if (pArg) {
    return pArg.split('=')[1];
  }
  throw new Error('No platform specified. Pass --platform <web|node|webview>.');
}

const platform = getPlatform();
assert(
  ['web', 'node'].includes(platform),
  'Platform must be "web" or "node".'
);

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Release values (FOAM_SENTRY_DSN, SENTRY_AUTH_TOKEN) come from the environment
// or from the gitignored .env next to this file; the environment wins.
const envFile = path.join(__dirname, '.env');
if (production && fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const sentryDsn = production ? process.env.FOAM_SENTRY_DSN ?? '' : '';
if (production && !sentryDsn) {
  console.warn('error reporting disabled: FOAM_SENTRY_DSN not set');
}
const uploadSourceMaps = production && !!process.env.SENTRY_AUTH_TOKEN;

// Versions baked into the bundle at build time so telemetry can attach
// `foam.version` / `foam.coreVersion` without runtime package.json reads.
// Mirrors the pattern used by `packages/foam-cli/esbuild.js`.
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);
const corePkg = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../foam-core/package.json'),
    'utf8'
  )
);
const versionDefines = {
  __FOAM_VSCODE_VERSION__: JSON.stringify(pkg.version),
  __CORE_VERSION__: JSON.stringify(corePkg.version),
  __FOAM_SENTRY_DSN__: JSON.stringify(sentryDsn),
};

function sentryPlugins() {
  if (!uploadSourceMaps) {
    return [];
  }
  const { sentryEsbuildPlugin } = require('@sentry/esbuild-plugin');
  return [
    sentryEsbuildPlugin({
      org: 'hyvan-mielen-pelit-ry',
      project: 'foam-for-gollum',
      url: 'https://de.sentry.io/',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: `foam-vscode-gollum@${pkg.version}` },
      sourcemaps: { filesToDeleteAfterUpload: ['out/bundles/*.map'] },
      telemetry: false,
    }),
  ];
}

const config = {
  extension: {
    web: {
      platform: 'browser',
      format: 'cjs',
      outfile: `out/bundles/extension-web.js`,
      define: {
        global: 'globalThis',
        ...versionDefines,
      },
      plugins: [
        polyfillPlugin.polyfillNode({
          // Options (optional)
        }),
        {
          name: 'path-browserify',
          setup(build) {
            build.onResolve({ filter: /^path$/ }, args => {
              return { path: require.resolve('path-browserify') };
            });
          },
        },
        {
          name: 'wikilink-embed',
          setup(build) {
            build.onResolve({ filter: /wikilink-embed/ }, args => {
              return {
                path: require.resolve(
                  args.resolveDir + '/wikilink-embed-web-extension.ts'
                ),
              };
            });
          },
        },
        {
          name: 'foam-query-renderer',
          setup(build) {
            build.onResolve({ filter: /foam-query-renderer/ }, args => {
              return {
                path: require.resolve(
                  args.resolveDir + '/foam-query-renderer-web-extension.ts'
                ),
              };
            });
          },
        },
        {
          name: 'untrusted-write',
          setup(build) {
            build.onResolve({ filter: /untrusted-write/ }, args => {
              return {
                path: require.resolve(
                  args.resolveDir + '/untrusted-write-web-extension.ts'
                ),
              };
            });
          },
        },
        {
          name: 'error-reporting',
          setup(build) {
            build.onResolve({ filter: /error-reporting$/ }, args => {
              return {
                path: require.resolve(
                  path.join(args.resolveDir, args.path) + '-web-extension.ts'
                ),
              };
            });
          },
        },
        {
          name: 'parse-entities-no-dom',
          setup(build) {
            // parse-entities maps ./decode-entity -> ./decode-entity.browser.js via
            // its package.json `browser` field when platform=browser. That version
            // uses document.createElement which is unavailable in VS Code Web
            // Extension host (Web Worker). Intercept the import before esbuild
            // applies the browser field remap and redirect to the Node.js version
            // that uses a pure lookup table instead.
            // Addresses #1566
            build.onResolve({ filter: /\/decode-entity$/ }, args => {
              if (args.resolveDir.includes('parse-entities')) {
                return {
                  path: require.resolve('parse-entities/decode-entity.js'),
                };
              }
            });
          },
        },
      ],
      entryPoints: ['src/extension.ts'],
      external: ['vscode'],
    },
    node: {
      platform: 'node',
      format: 'cjs',
      outfile: `out/bundles/extension-node.js`,
      define: versionDefines,
      plugins: [],
      entryPoints: ['src/extension.ts'],
      external: ['vscode'],
    },
  },
};

async function buildTarget(targetConfig) {
  const ctx = await esbuild.context({
    ...targetConfig,
    bundle: true,
    minify: production,
    sourcemap: production ? uploadSourceMaps : true,
    sourcesContent: uploadSourceMaps,
    logLevel: 'silent',
    plugins: [
      ...targetConfig.plugins,
      ...sentryPlugins(),
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

async function main() {
  await buildTarget(config.extension[platform]);
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log('[watch] build finished');
    });
  },
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
