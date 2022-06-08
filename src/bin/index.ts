#!/usr/bin/env node

import { cosmiconfig } from 'cosmiconfig'
import { join } from 'path'
import { syncPackageVersions, isLernaAvailable, EVerSource, syncPackageDependenceVersion, fixPackageJson, ISyncDepOptions  } from '../index'

interface IConfig {
  // package name need to sync
  syncremote?: string[] | Record<string, string>
  // local package version source: all, git, npm, local
  synclocal?: EVerSource
  // configuration for fixPackagesJson
  fixpack?: any
}

async function getConfig () {
  const explorer = cosmiconfig('lerna-ci')
  try {
    const result = await explorer.search()
    return (result?.config || {}) as IConfig
  } catch (error) {
    return {}
  }
}

async function main () {
  // get arguments from command line
  let args = process.argv.slice(2)
  args = args.filter((item, idx) => args.indexOf(item) === idx)

  if (args[0] === '-v' || args[0] === '--version') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    console.log('lerna-ci version: ', require(join(__dirname, '../../package.json')).version)
    return
  }

  const isLernaInstalled = await isLernaAvailable()
  if (!isLernaInstalled) {
    console.warn(
      '[lerna-ci] lerna not installed.\n  If you are using lerna in this project, \n  please excute `yarn` or `npm` to install lerna'
    )
  }
  const cwd = process.cwd()

  const needRunAll = args[0] === 'all'

  const repoConfig = await getConfig()

  // sync packages' versions in monorepo
  if (needRunAll || args[0] === 'synclocal') {
    console.log('[lerna-ci] try to sync local package versions')
    const syncLocalConfig = args[1] || repoConfig.synclocal
    const options = typeof syncLocalConfig === 'string' ? { versionSource: syncLocalConfig } : (syncLocalConfig || {})
    // @ts-ignore
    const updatedPkgs = await syncPackageVersions(options)
    if (updatedPkgs.length) {
      console.log('[lerna-ci] the following package.json are updated:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
    } else {
      console.log('[lerna-ci] all package.json files\' are up to update, nothing touched')
    }
    console.log('')
  }

  // fix all package.json files' writing style
  if (needRunAll || args[0] === 'fixpack') {
    console.log('[lerna-ci] try to fix local package.json\'s order')
    const updatedPkgs = await fixPackageJson(repoConfig.fixpack)
    if (updatedPkgs.length) {
      console.log('\n[lerna-ci] the following package.json files are formatted:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
    } else {
      console.log('\n[lerna-ci] all package.json files are well formatted, nothing touched')
    }
    console.log('')
  }

  // sync all package.json' dependencies/peerDependencies/devDependencies/optionalDependencies versions
  if ((needRunAll || args[0] === 'syncremote')) {
    const syncRemoteConfig = args.length > 1 ? args.slice(1) : repoConfig.syncremote
    if (!syncRemoteConfig) {
      console.log('[lerna-ci] no configuration provided for syncremote, this command has had no effect')
      return
    }
    console.log('[lerna-ci] try to sync packages\' dependencies\' versions')
    const options = Array.isArray(syncRemoteConfig)
      ? parsePackageNames(syncRemoteConfig)
      : { versionMap: syncRemoteConfig}
    
    const updatedPkgs = await syncPackageDependenceVersion(options)
    if (updatedPkgs.length) {
      console.log('[lerna-ci] the following package.json files\' dependencies are updated:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
    } else {
      console.log('[lerna-ci] all package.json files\' dependencies are up to update, nothing touched')
    }
    console.log('')
  }
}

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

main()