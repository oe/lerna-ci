import { cosmiconfig } from 'cosmiconfig'
import { join } from 'path'
import { syncPackageVersions, detectLerna, EVerSource, syncPackageDependenceVersion } from '../index'

interface IConfig {
  // package name need to sync
  syncremote?: string[]
  // local package version source: all, git, npm, local
  synclocal?: EVerSource
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

  const isLernaInstalled = await detectLerna()
  if (!isLernaInstalled) {
    console.warn(
      '[lerna-ci] lerna not installed.\n  If you are using lerna in this project, \n  please excute `yarn` or `npm` to install lerna'
    )
  }
  const cwd = process.cwd()

  const needRunAll = args.indexOf('all') !== -1

  const repoConfig = await getConfig()

  if (needRunAll || args.indexOf('synclocal') !== -1) {
    console.log('[lerna-ci] try to sync local package versions')
    const updatedPkgs = await syncPackageVersions({ versionSource: repoConfig.synclocal || EVerSource.ALL})
    if (updatedPkgs.length) {
      console.log('[lerna-ci] the following package.json are updated:\n  ' + 
        updatedPkgs.map(item => `${item.location.replace(cwd, '.')}/package.json(${item.name})`).join('\n  '))
    } else {
      console.log('[lerna-ci] all package.json files\' are up to update, nothing touched')
    }
    console.log('')
  }

  if ((needRunAll || args.indexOf('syncremote') !== -1) && repoConfig.syncremote) {
    console.log('[lerna-ci] try to sync packages\' dependencies\' versions')
    const options = Array.isArray(repoConfig.syncremote)
      ? { packageNames: repoConfig.syncremote }
      : { versionMap: repoConfig.syncremote}
    
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

main()