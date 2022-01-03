import semver from 'semver'
import { runShellCmd } from 'deploy-toolkit'

/** platform detect */
const isWin = /^win/.test(process.platform)

let isLernaInstalled: undefined | boolean

/** run npm command via npx */
export function runNpmCmd(...args: string[]) {
  return runShellCmd(isWin ? 'npx.cmd' : 'npx', args)
}
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

/** calc max value with custom compare */
export function pickOne<V>(list: V[], compare: ((a: V, b: V) => number)): V | undefined {
  if (!list.length) return
  const arr = list.slice(0)
  return arr.reduce((acc, cur) => {
    return compare(acc, cur) >= 0 ? acc : cur
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  }, arr.shift()!)
}

/** get maxVersion of from the given version list  */
export function maxVersion(...vers: (string | undefined)[]) {
  return pickOne(vers.filter(v => !!v) as string[], semver.compare)
}
