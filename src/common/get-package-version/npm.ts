import { runShellCmd } from 'deploy-toolkit'
import { IVersionPickStrategy, IVersionMap } from '../types'
import { getRepoNpmClient } from '../utils'
/**
 * get versions from npm server
 */
export async function getVersionsFromNpm(pkgNames: string[], versionStrategy?: IVersionPickStrategy, npmClient?: 'yarn' | 'npm') {
  const result: IVersionMap = {}
  while (pkgNames.length) {
    const items = pkgNames.splice(-10)
    const vers = await Promise.all(items.map(name => getSingleVersionFromNpm(name, versionStrategy, npmClient)))
    vers.forEach((ver, idx) => {
      if (!ver) return
      result[items[idx]] = ver
    })
  }
  return result
}

/**
 * get single package version info from npm( via yarn cli )
 * @param name package name
 * @param type version strategy, max version or latest version, default latest
 */
export async function getSingleVersionFromNpm(name: string, type: IVersionPickStrategy = 'latest', npmClient?: 'yarn' | 'npm'): Promise<string | undefined> {
  try {
    // actually only tested yarn and npm
    const npmClientName = npmClient || (await getRepoNpmClient()) || 'npm'
    const verStr = await runShellCmd(npmClientName, [
      'info',
      name,
      type === 'latest' ? 'version' : 'versions',
      '--json'
    ])
    if (!verStr) return
    const ver = JSON.parse(verStr)
    const result  = ver && ver.type ==='inspect' ? ver.data : ver
    if (type === 'latest') {
      return typeof result === 'string' ? result : undefined
    }
    if (Array.isArray(result)) return result.pop()
    return ver.data
  } catch (error) {
    console.warn(`[lerna-ci] failed to get version of ${name} from npm`, error)
    return
  }
}