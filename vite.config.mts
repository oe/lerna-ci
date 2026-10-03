import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const dependencyNames = Object.keys(pkg.dependencies)

export default defineConfig({
  plugins: [{
    name: 'tsc-commonjs-compatibility',
    renderChunk(code, chunk) {
      const originalShebang = code.match(/^#![^\n]*\n/)?.[0] || ''
      const shebang = chunk.fileName === 'bin/index.js' ? '#!/usr/bin/env node\n' : originalShebang
      const body = code.slice(originalShebang.length)
      // preserveModules does not mark internal default exports as ESM itself.
      // Keep the interop marker emitted by the previous tsc CommonJS build.
      const marker = 'Object.defineProperty(exports, "__esModule", { value: true });\n'
      return { code: shebang + marker + body, map: null }
    },
  }],
  build: {
    target: 'es2020',
    minify: false,
    lib: {
      entry: { index: 'src/index.ts', 'bin/index': 'src/bin/index.ts' },
      formats: ['cjs'],
    },
    rolldownOptions: {
      external: id => isBuiltin(id) || dependencyNames.some(name => id === name || id.startsWith(`${name}/`)),
      treeshake: false,
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        exports: 'named',
        esModule: true,
      },
    },
  },
})
