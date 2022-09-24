import { runShellCmd } from 'deploy-toolkit'
import { IPackageDigest } from '../types'
import { isWin, runNpmCmd } from '../utils'


/**
 * get all package's info in a lerna project
 */
export async function getAllPackagesViaLerna(): Promise<IPackageDigest[]> {
  const isLernaInstalled = await isLernaAvailable()
  if (!isLernaInstalled) console.warn('[lerna-ci] lerna not installed')
  /**
   * don't install from npm remote if lerna not installed
   */
  const args = ['--no-install', 'lerna', 'list', '-a', '--json']
  // if (needPrivate) args.push('--all')
  // if (searchKwd) args.push(searchKwd)
  const pkgsString = await runNpmCmd(...args)
  return JSON.parse(cleanUpLernaCliOutput(pkgsString)) as IPackageDigest[]
}

/**
 * get all changed packages according to your lerna.json's configuration
 */
export async function getChangedPackages(): Promise<IPackageDigest[]> {
  const pkgsString = await runNpmCmd('--no-install', 'lerna', 'changed', '--json')
  const result = JSON.parse(cleanUpLernaCliOutput(pkgsString)) as IPackageDigest[]
  return result
}

let isLernaInstalled: undefined | boolean
/**
 * detect whether lerna has been installed
 */
export async function isLernaAvailable() {
  if (typeof isLernaInstalled === 'boolean') return isLernaInstalled
  try {
    await runShellCmd(isWin ? 'npx.cmd' : 'npx', [
      '--no-install',
      'lerna',
      '-v'
    ])
    isLernaInstalled = true
    return true
  } catch {
    isLernaInstalled = false
    return false
  }
}

/**
 * lerna cli json output not a pure json string, can not be parsed directly
 *  need to remove prefix/suffix
 */
export function cleanUpLernaCliOutput(str: string): string {
  return str
    .split('\n')
    .filter(l => /^[\s\[\]]/.test(l))
    .join('\n')
}
