#!/usr/bin/env node
import { cosmiconfig } from 'cosmiconfig'
import colors from 'picocolors'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
  syncLocal,
  EVerSource,
  syncRemote,
  fixPackageJson,
  ISyncDepOptions
} from '../index'

const CLI_NAME = 'lerna-cli'
const cwd = process.cwd()

interface IConfig {
  // package name need to sync
  syncremote?: string[] | Record<string, string>
  // local package version source: all, git, npm, local
  synclocal?: {
    source: EVerSource
    versionRange: string
  }
  // configuration for fixPackagesJson
  fixpack?: any
}
let cachedConfig: IConfig
async function getConfig () {
  if (cachedConfig) return cachedConfig
  const explorer = cosmiconfig(CLI_NAME)
  try {
    const result = await explorer.search()
    cachedConfig = (result?.config || {}) as IConfig
    return cachedConfig
  } catch (error) {
    return {}
  }
} 

const getVersionRangeOption = ()  => ({
  alias: 'r',
  default: 'retain',
  describe: 'version range, you can use caret(^), tilde(~), gte(>=), gt(>), eq(=), retain(keep what it is)',
  coerce: (v) => {
    const rangeMap = { caret: '^', tilde: '~', gte: '>=', gt: '>', eq: '=' }
    const val = rangeMap[v] || (Object.values(rangeMap).includes(v) && v)
    if (!val) {
      throw new Error(colors.red(`unsupported version range "${v}"`))
    }
    return val
  }
})

const SUPPORTED_NPM_CLIENTS = ['yarn', 'yarn-next', 'npm']

const npmClientOptions = {
  alias: 'n',
  describe: 'current repo preferred npm client',
  coerce: (v) => {
    if (!v) return v
    if (/^yarn\(.*)$/.test(v)) {
      if (RegExp.$1 === '' || RegExp.$1 === '1') return 'yarn'
      return 'yarn-next'
    }
    if (SUPPORTED_NPM_CLIENTS.includes(v)) return v
    throw new Error(colors.red(`unsupported npm client "${v}"`))
  },
  choices: SUPPORTED_NPM_CLIENTS
}

yargs(hideBin(process.argv))
  .scriptName(CLI_NAME)
  .usage('$0 <cmd> [args]')
  // command fixpack
  .command(
    'fixpack',
    'format all packages\' package.json',
    async () => {
      const repoConfig = await getConfig()
      if (!repoConfig.fixpack) {
        console.log(colors.dim('custom fixpack config not found, using default config'))
      }
      await fixPackageJson(repoConfig.fixpack)
    }
  )
  // command synclocal
  .command(
    'synclocal [source]',
    'sync local packages versions to remote(git tags, npm versions)',
    (yargs) => yargs
      .usage('$0 synclocal [source] [--range <versionRange>]')
      .positional('source', {
        describe: 'packages\' versions sources, could be:\
          local: monorepo itself\
          npm: if any packages has been publish to any registry\
          git: git tags, tag should like `packageName@versionNo`\
          all: from all these sources, and choose the max',
        choices: ['local', 'npm', 'git', 'all'],
        type: 'string',
        array: false
      })
      .option('range', getVersionRangeOption())
      .option('npm', npmClientOptions)
      .version(false)
      .help(),
    async (argv) => {
      const repoConfig = await getConfig()
      console.log('[lerna-ci] try to sync local package versions')
      const source = argv.source || repoConfig.synclocal?.source || 'all'
      const versionRange = argv.range || repoConfig.synclocal?.versionRange
      const options = { versionSource: source, versionRangeStrategy: versionRange }
      // @ts-ignore
      const updatedPkgs = await syncLocal(options)
      if (updatedPkgs.length) {
        console.log('[lerna-ci] the following package.json are updated:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
      } else {
        console.log('[lerna-ci] all package.json files\' are up to update, nothing touched')
      }
      console.log('')
    }
  )
  // command syncremote
  .command(
    'syncremote [packages...]',
    'sync packages\' dependencies versions',
    (yargs) => yargs
      .usage('$0 syncremote [packages...] [--range <versionRange>]')
      .positional('packages', {
        description: 'packages\' names that need to be synced, support: specified package name, package name ',
        // demandOption: true,
        type: 'string',
        array: true
      })
      .option('range', getVersionRangeOption())
      .option('npm', npmClientOptions)
      .version(false)
      .help(),
    async (argv) => {
      const repoConfig = await getConfig()
      const syncRemoteConfig = argv.packages?.length ? argv.packages : repoConfig.syncremote
      if (!syncRemoteConfig) {
        console.log('[lerna-ci] no configuration provided for syncremote, this command has had no effect')
        return
      }
      console.log('[lerna-ci] try to sync packages\' dependencies\' versions')
      const options = Array.isArray(syncRemoteConfig)
        ? parsePackageNames(syncRemoteConfig)
        : { versionMap: syncRemoteConfig}
    
      const updatedPkgs = await syncRemote(Object.assign({ versionRangeStrategy: argv.range }, options))
      if (updatedPkgs.length) {
        console.log('[lerna-ci] the following package.json files\' dependencies are updated:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(process.cwd(), '.')}/package.json(${item.name})`).join('\n  '))
      } else {
        console.log('[lerna-ci] all package.json files\' dependencies are up to update, nothing touched')
      }
      console.log('')
    }
  )

  .command(
    'canpublish <versionType>',
    'check whether it\'s eligible to publish next version',
    (yargs) => yargs
      .usage('$0 canpublish <versionType>')
      .positional('versionType', {
        description: 'next version type, like major, minor, patch or alpha(for test), default to patch',
        default: 'patch',
        choices: ['major', 'minor', 'patch', 'alpha']
      })
      .options('no-private', {
        alias: 'n',
        default: true,
        describe: 'set it true to skip checking private packages, default true',
        type: 'boolean',
      })
      .options('check-git', {
        alias: 'g',
        default: true,
        describe: 'check whether git is committed, default true',
        type: 'boolean',
      })
      .version(false)
      .help(),
    async (argv) => {
      console.log('can publish', argv)
    }
  )
  // require command or throw an error and output help info
  .demandCommand(1)
  .strict()
  .parse()
  


/**
 * parse name to package names and version map
 * @param names package names need to sync
 */
function parsePackageNames(names: string[]) {
  const result: Required<Pick<ISyncDepOptions, 'packageNames' | 'versionMap'>> = {
    packageNames: [],
    versionMap: {}
  }
  const exactPkgReg = /^(.+)@(.+)$/
  return names.reduce((acc, name) => {
    if (exactPkgReg.test(name)) {
      acc.versionMap[RegExp.$1] = RegExp.$2
    } else {
      acc.packageNames.push(name)
    }
    return acc
  }, result)
}