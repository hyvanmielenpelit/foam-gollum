#!/usr/bin/env node
//
// Releases foam-vscode to the VS Code Marketplace and OpenVSX.
//
// Invoked by the workspace `release` script. Steps are explicit (not
// relying on vsce's `vscode:prepublish` lifecycle hook) so the flow is
// inspectable from this single file.
//
// Required env vars, from the environment or the gitignored .env next to this
// file (the environment wins):
//   - FOAM_SENTRY_DSN (baked into the bundle by esbuild.js for error reporting)
//   - SENTRY_AUTH_TOKEN (source map upload by esbuild.js)
//   - OPENVSX_TOKEN (consumed by the `publish:openvsx` script)
// Marketplace auth comes from the local `vsce` CLI session.
//
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const run = cmd => execSync(cmd, { stdio: 'inherit' });

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
for (const name of ['FOAM_SENTRY_DSN', 'SENTRY_AUTH_TOKEN']) {
  if (!process.env[name]) {
    throw new Error(`${name} is required to release. Nothing was built or published.`);
  }
}

// 1. Clean + production build for both Node and web targets
//    (was: vscode:prepublish).
run('yarn clean');
run('yarn build:node --production');
run('yarn build:web --production');

// 2. Package the .vsix.
run('yarn package');

// 3. Upload to the Marketplace.
run('yarn publish:vscode');

// 4. Upload the same vsix to OpenVSX. Fail fast if the token is missing
//    so the user knows step 3 succeeded but step 4 didn't.
if (!process.env.OPENVSX_TOKEN) {
  throw new Error(
    'OPENVSX_TOKEN env var is required to publish to OpenVSX. ' +
      'Marketplace upload succeeded; rerun this script after exporting the token.'
  );
}
run('yarn publish:openvsx');
