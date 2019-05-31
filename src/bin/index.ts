import cosmiconfig from 'cosmiconfig'
import { syncRemotePkgVersions, fixPackageJson, syncLocalPkgVersions, EVerSource } from '../index'

interface IConfig {
  // fixpack options: https://github.com/henrikjoreteg/fixpack#configuration
  fixpack?: object
  // package name need to sync
  syncremote?: string[]
  // local package version source: all, git, npm
  synclocal?: EVerSource
}

async function getConfig () {
  const explorer = cosmiconfig('lerna-ci')
  try {
    const result = await explorer.search()
    return (result.config || {}) as IConfig
  } catch (error) {
    return {}
  }
}

async function main () {
  const config = await getConfig()
  let args = process.argv.slice(2)
  args = args.filter((item, idx) => args.indexOf(item) === idx)
  const needRunAll = args.indexOf('all') !== -1
  if (needRunAll || args.indexOf('fixpack') !== -1) {
    console.log('[lerna-ci] try to fix local package.json\'s order')
    await fixPackageJson(config.fixpack)
  }
  if (needRunAll || args.indexOf('syncremote') !== -1) {
    console.log('[lerna-ci] try to sync common remote dependences version')
    if (config.syncremote && config.syncremote.length) {
      await syncRemotePkgVersions(config.syncremote)
    } else {
      console.warn('[lerna-ci] no remote packages specified, nothing touched')
    }
  }
  if (needRunAll || args.indexOf('synclocal') !== -1) {
    console.log('[lerna-ci] try to sync local package dependences\' versions')
    await syncLocalPkgVersions(config.synclocal || EVerSource.ALL)
  }
}

main()