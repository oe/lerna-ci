#!/usr/bin/env node
import colors from 'picocolors'
import yargs, { Options } from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
  syncLocal,
  syncRemote,
  canPublish,
  fixPackageJson,
  ISyncDepOptions,
  setConfig,
  logger,
  SUPPORTED_NPM_CLIENTS,
  getRepoNpmClient,
  getIndent,
} from '../index'
import { getCliConfig, CLI_NAME } from './config'
import {
  printChangedPackages,
  printGitSyncStatus,
  printPkgVersionConflicts,
  printGitStatus,
} from './pretty-print'

setConfig({ debug: true })


const getVersionRangeOption = ()  => ({
  alias: 'r',
  default: 'retain',
  describe: 'version range, you can use caret(^), tilde(~), gte(>=), gt(>), eq(=), retain(keep what it is)',
  coerce: (v) => {
    const rangeMap = { caret: '^', tilde: '~', gte: '>=', gt: '>', eq: '=', retain: 'retain' }
    const val = rangeMap[v] || (Object.values(rangeMap).includes(v) && v)
    if (!val) {
      throw new Error(colors.red(`unsupported version range "${v}"`))
    }
    return val
  }
})

const npmClientOptions = {
  alias: 'n',
  describe: 'current repo preferred npm client',
  coerce: (v) => {
    if (!v) return v
    if (/^yarn(.*)$/.test(v)) {
      if (RegExp.$1 === '' || RegExp.$1 === '1') return 'yarn'
      return 'yarn-next'
    }
    if (SUPPORTED_NPM_CLIENTS.includes(v)) return v
    throw new Error(colors.red(`unsupported npm client "${v}"`))
  },
  choices: SUPPORTED_NPM_CLIENTS
}

const checkOnlyOptions: Options = {
  alias: 'c',
  describe: 'check for changes with package.jsons untouched',
  type: 'boolean',
}

yargs(hideBin(process.argv))
  .scriptName(CLI_NAME)
  .usage('$0 <cmd> [args]')
  // command fixpack
  .command(
    'fixpack',
    'format all packages\' package.json',
    async () => {
      const repoConfig = await getCliConfig()
      if (!repoConfig.fixpack) {
        logger.info('custom fixpack config not found, using default config')
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
      .option('check-only', checkOnlyOptions)
      .option('npm', npmClientOptions)
      .version(false)
      .help(false),
    async (argv) => {
      const cmdName = 'synclocal'
      const repoConfig = await getCliConfig()
      console.log(`[${CLI_NAME}][${cmdName}] try to sync local package versions`)
      const source = argv.source || repoConfig.synclocal?.source || 'all'
      const versionRange = argv.range || repoConfig.synclocal?.versionRange
      const options = {
        versionSource: source,
        versionRangeStrategy: versionRange,
        checkOnly: argv.checkOnly,
      }
      // @ts-ignore
      const updatedPkgs = await syncLocal(options)

      if (updatedPkgs) {
        logger.log(`[${CLI_NAME}][${cmdName}] the following package.json files ${argv.checkOnly ? 'can be updated' : 'are updated'}:`)
        await printChangedPackages(updatedPkgs)
        if (!argv.checkOnly) {
          let npmClient = argv.npm || await getRepoNpmClient()
          npmClient = /^yarn/.test(npmClient) ? 'yarn' : npmClient
          await logger.log(`[${CLI_NAME}][${cmdName}] you may need run \`${npmClient} install\` to make changes take effect`)
        } else {
          logger.error(`[${CLI_NAME}][${cmdName}] local packages' versions are messed`)
          // throw an error when checking
          process.exit(1)
        }
      } else {
        logger.success(`[${CLI_NAME}][${cmdName}] all packages.json files\' are up to update, nothing touched`)
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
      .option('check-only', checkOnlyOptions)
      .help(),
    async (argv) => {
      const cmdName = 'syncremote'
      const repoConfig = await getCliConfig()
      const syncRemoteConfig = argv.packages?.length ? argv.packages : repoConfig.syncremote
      if (!syncRemoteConfig) {
        logger.warn(`[${CLI_NAME}][${cmdName}] no configuration provided for \`${cmdName}\`, this command has had no effect`)
        return
      }
      logger.info(`[${CLI_NAME}][${cmdName}] try to sync packages\' dependencies\' versions`)
      const options = Array.isArray(syncRemoteConfig)
        ? parsePackageNames(syncRemoteConfig)
        : { versionMap: syncRemoteConfig }
      // @ts-ignore
      const updatedPkgs = await syncRemote(Object.assign(options, {
        versionRangeStrategy: argv.range,
        checkOnly: argv.checkOnly
      }))
      if (updatedPkgs) {
        logger.log(`[${CLI_NAME}][${cmdName}] the following package.json files' dependencies ${argv.checkOnly ? 'can be updated' : 'are updated'}:`)
        await printChangedPackages(updatedPkgs)
        if (!argv.checkOnly) {
          let npmClient = argv.npm || await getRepoNpmClient()
          npmClient = /^yarn/.test(npmClient) ? 'yarn' : npmClient
          await logger.log(`[${CLI_NAME}][${cmdName}] you may need run \`${npmClient} install\` to make changes take effect`)
        } else {
          logger.error(`[${CLI_NAME}][${cmdName}] local packages' dependencies is outdated`)
          // throw an error when checking
          process.exit(1)
        }
      } else {
        logger.success(`[${CLI_NAME}][${cmdName}] all package.json files\' dependencies are up to update, nothing touched`)
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
      const cmdName = 'canpublish'
      const result = await canPublish({
        // @ts-ignore
        publishStrategy: argv.versionType,
        noPrivate: argv.noPrivate,
        checkCommit: argv.checkGit
      })
      if (result.eligible) {
        logger.success(`✨[${CLI_NAME}][${cmdName}] ready to publish!`)
      } else {
        logger.error(`⚠️  [${CLI_NAME}][${cmdName}]unable to publish, due to some issues:`)
        for (const reason of result.reasons!) {
          switch (reason.type) {
            case 'git-not-clean':
              logger.warn(`${getIndent(1)}local git is not clean:`)
              await printGitStatus(reason.content, 2)
              break
            case 'git-outdated':
              logger.warn(`${getIndent(1)}local git is outdated:`)
              await printGitSyncStatus(reason.content, 2)
              break
            case 'local-version-outdated':
              logger.warn(`${getIndent(1)}local project packages' versions are outdated:`)
              await printChangedPackages(reason.content, 2)
              break
            case 'next-version-unavailable':
              logger.warn(`${getIndent(1)}next release versions of some packages' are occupied:`)
              await printPkgVersionConflicts(reason.content, 2)
          }
        }
        process.exit(1)
      }
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