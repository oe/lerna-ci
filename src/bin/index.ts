#!/usr/bin/env node
import colors from 'picocolors'
import yargs, { Options } from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
  syncLocal,
  syncDeps,
  canPublish,
  fixpack,
  ISyncDepOptions,
  setConfig,
  logger,
  getRepoNpmClient,
  getIndent,
  RELEASE_TYPES,
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
      await fixpack(repoConfig.fixpack)
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
      .option('exact', {
        describe: 'use exact version with custom version `range` options(^, ~, >=, >, =, no punctuation)',
        alias: 'e',
        type: 'boolean',
        default: true,
      })
      .version(false)
      .help(false),
    async (argv) => {
      const cmdName = 'synclocal'
      const repoConfig = await getCliConfig()
      const cliMessage = argv.checkOnly
        ? 'try to check local packages\' versions whether are synced'
        : 'try to sync local packages\' versions'

      console.log(`[${CLI_NAME}][${cmdName}] ${cliMessage}`)
      const source = argv.source || repoConfig.synclocal?.source || 'all'
      const versionRange = argv.range || repoConfig.synclocal?.versionRange
      const options = {
        versionSource: source,
        versionRangeStrategy: versionRange,
        checkOnly: argv.checkOnly,
        exact: argv.exact,
      }
      // @ts-ignore
      const updatedPkgs = await syncLocal(options)

      if (updatedPkgs) {
        logger.log(`[${CLI_NAME}][${cmdName}] the following package.json files ${argv.checkOnly ? 'can be updated' : 'are updated'}:`)
        await printChangedPackages(updatedPkgs)
        if (!argv.checkOnly) {
          let npmClient = await getRepoNpmClient()
          npmClient = /^yarn/.test(npmClient) ? 'yarn' : npmClient
          await logger.log(`[${CLI_NAME}][${cmdName}] you may need run \`${npmClient} install\` to make changes take effect`)
        } else {
          logger.error(`[${CLI_NAME}][${cmdName}] local packages' versions are messed`)
          // throw an error when checking
          process.exit(1)
        }
      } else {
        logger.success(`[${CLI_NAME}][${cmdName}] all packages.json files\' are up to update${argv.checkOnly ? '': ', nothing touched'}`)
      }
      console.log('')
    }
  )
  // command syncdeps
  .command(
    ['syncdeps <packages...>','syncremote'],
    'sync packages\' dependencies versions',
    (yargs) => yargs
      .usage('$0 syncdeps <packages...> [--range <versionRange>]')
      .positional('packages', {
        description: 'packages\' names that need to be synced, support: specified package name, package name ',
        type: 'string',
        array: true
      })
      .example([
        ['$0 syncdeps react react-dom', 'update to latest stable version'],
        ['$0 syncdeps react react-dom -r "~"', 'update to latest stable version with custom version range'],
        ['$0 syncdeps "react@18" "react-dom@18" "webpack@^5.0.0"', 'update to specified versions with ranges'],
        ['$0 syncdeps parcel "@parcel/*"', 'by using *, update all parcel related dependencies'],
        ['$0 syncdeps "*plugin*"', 'update all packages that name contains `plugin`'],
        ['$0 syncdeps "parcel@2.7.0" "@parcel/*@2.7.0"', 'update all parcel related dependencies to specified version'],
      ])
      .option('range', getVersionRangeOption())
      .option('exact', {
        describe: 'use exact version with custom version `range` options(^, ~, >=, >, =, no punctuation), or only update when existing version range is not satisfied',
        alias: 'e',
        type: 'boolean',
        default: true,
      })
      .option('check-only', checkOnlyOptions)
      .help(),
    async (argv) => {
      const cmdName = 'syncdeps'
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
      const updatedPkgs = await syncDeps(Object.assign(options, {
        versionRangeStrategy: argv.range,
        checkOnly: argv.checkOnly
      }))
      if (updatedPkgs) {
        logger.log(`[${CLI_NAME}][${cmdName}] the following package.json files' dependencies ${argv.checkOnly ? 'can be updated' : 'are updated'}:`)
        await printChangedPackages(updatedPkgs)
        if (!argv.checkOnly) {
          let npmClient = await getRepoNpmClient()
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
    'canpublish [releaseType]',
    'check whether it\'s eligible to publish next version',
    (yargs) => yargs
      .usage('$0 canpublish [releaseType]')
      .positional('releaseType', {
        description: 'next version type, like major, minor, patch or alpha(for test), default to patch',
        default: 'patch',
        choices: RELEASE_TYPES,
      })
      .options('check-git', {
        alias: 'g',
        default: true,
        describe: 'check whether git is committed, default true',
        type: 'boolean',
      })
      .options('period', {
        alias: 'p',
        describe: 'period when release a pre-version, default to alpha',
        type: 'string',
        default: 'alpha',
      })
      .options('use-max-version', {
        alias: 'm',
        describe: 'check whether local packages are using the maximal versions',
        type: 'boolean',
      })
      .version(false)
      .help(),
    async (argv) => {
      const cmdName = 'canpublish'
      const result = await canPublish({
        // @ts-ignore
        releaseType: argv.releaseType,
        checkCommit: argv.checkGit,
        useMaxVersion: argv.useMaxVersion,
        period: argv.period,
      })
      if (result.eligible) {
        logger.success(`✨  [${CLI_NAME}][${cmdName}] ready to publish!`)
        console.log('')
      } else {
        logger.error(`⚠️  [${CLI_NAME}][${cmdName}] unable to publish, due to some issues:`)
        for (const reason of result.reasons!) {
          switch (reason.type) {
            case 'git-not-clean':
              logger.warn(`${getIndent(1)}local git is not clean:`)
              await printGitStatus(reason.content, 2)
              break
            case 'git-outdated':
              logger.warn(`${getIndent(1)}local git is not sync with remote origin:`)
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