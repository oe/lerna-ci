import cosmiconfig from 'cosmiconfig'
import { join } from 'path'
import { syncRemotePkgVersions, fixPackageJson, syncLocalPkgVersions, detectLerna, EVerSource } from '../index'

interface IConfig {
  // fixpack options: https://github.com/henrikjoreteg/fixpack#configuration
  fixpack?: object
  // package name need to sync
  syncremote?: string[]
  // local package version source: all, git, npm
  synclocal?: EVerSource
}

async function getPkgConfig () {
  const explorer = cosmiconfig('lerna-ci')
  try {
    const result = await explorer.search()
    return (result.config || {}) as IConfig
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
    console.warn(require(join(__dirname, '../../package.json')).version)
    return
  }

  const isLernaInstalled = await detectLerna()
  if (!isLernaInstalled) {
    console.warn(
      '[lerna-ci] lerna not installed.\n  If you are using lerna in this project, \n  please excute `yarn` or `npm` to install lerna'
    )
  }

  const needRunAll = args.indexOf('all') !== -1
  const cwd = process.cwd()
  // get config from package.json
  const pkgConfig = await getPkgConfig()

  if (needRunAll || args.indexOf('fixpack') !== -1) {
    console.log('[lerna-ci] try to fix local package.json\'s order')
    const updatedPkgs = await fixPackageJson(pkgConfig.fixpack)
    if (updatedPkgs.length) {
      console.log('[lerna-ci] the following package.json files are formatted:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
    } else {
      console.log('[lerna-ci] all package.json files are well formatted, nothing touched')
    }
    console.log('')
  }

  if (needRunAll || args.indexOf('syncremote') !== -1) {
    console.log('[lerna-ci] try to sync common remote dependences version')
    if (pkgConfig.syncremote && pkgConfig.syncremote.length) {
      const updatedPkgs = await syncRemotePkgVersions(pkgConfig.syncremote)
      if (updatedPkgs.length) {
        console.log('[lerna-ci] the following package.json files\' remote dependences are updated:\n  ' + 
          updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
      } else {
        console.log('[lerna-ci] all package.json files\' remote dependences are up to update, nothing touched')
      }
    } else {
      console.warn('[lerna-ci] no remote packages specified, nothing touched')
    }
    console.log('')
  }


  if (needRunAll || args.indexOf('synclocal') !== -1) {
    console.log('[lerna-ci] try to sync local package dependences\' versions')
    const updatedPkgs = await syncLocalPkgVersions(pkgConfig.synclocal || EVerSource.ALL)
    if (updatedPkgs.length) {
      console.log('[lerna-ci] the following package.json files\' local dependences are updated:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
    } else {
      console.log('[lerna-ci] all package.json files\' local dependences are up to update, nothing touched')
    }
    console.log('')
  }
}

main()