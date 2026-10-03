const { chmodSync, readFileSync } = require('fs')

const cli = 'dist/bin/index.js'
if (!readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node\n')) {
  throw new Error('CLI build is missing its executable shebang')
}
chmodSync(cli, 0o755)
