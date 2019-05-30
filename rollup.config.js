import babel from 'rollup-plugin-babel';
import typescript from 'rollup-plugin-typescript2'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('./package.json')


export default {
  input: 'src/index.ts',
  external: [
    "@types/semver",
    "deploy-toolkit",
    "fixpack",
    "semver"
  ],
  output: [
    {
      name: 'lerna-ci',
      banner: `/*!
 * lerna-ci v${pkg.version}
 * Copyright© ${new Date().getFullYear()} Saiya ${pkg.homepage}
 */`,
      format: 'cjs',
      file: `dist/index.js`
    },
    {
      name: 'lerna-ci',
      banner: `/*!
 * lerna-ci v${pkg.version}
 * Copyright© ${new Date().getFullYear()} Saiya ${pkg.homepage}
 */`,
      format: 'es',
      file: `dist/index.es.js`
    }
  ],
  plugins: [
    typescript({
      tsconfigOverride: {
        compilerOptions: {
          module: 'esnext'
        }
      },
      typescript: require('typescript')
    }),
    babel()
  ]
}

