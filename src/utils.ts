import semver from 'semver'
import { runShellCmd } from 'deploy-toolkit'

/** platform detect */
const isWin = /^win/.test(process.platform)

let isLernaInstalled: null|boolean = null

/** run npm command via npx */
export function runNpmCmd(...args: string[]) {
  return runShellCmd(isWin ? 'npx.cmd' : 'npx', args)
}
/**
 * detect whether lerna has been installed
 */
export async function detectLerna() {
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


interface IGroupedPkgNames {
  specific: string[]
  general: string[]
}

/**
 * remove duplicated item in array
 * @param items array
 */
export function uniqArray<T>(items: T[]): T[] {
  return items.filter((item, i) => items.indexOf(item) === i)
}

/**
 * group scoped(e.g. @babel, @parcel) and specific package names
 * @param pkgNames package names, example ['@elements/*', 'uuid']
 */
export function groupPkgNames(pkgNames: string[]): IGroupedPkgNames {
  const result: IGroupedPkgNames = { specific: [], general: [] }
  pkgNames.reduce((acc, cur) => {
    if (/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(cur)) {
      acc.specific.push(cur)
    } else if (/^@[a-z0-9-~][a-z0-9-._~]*\/\*$/.test(cur)) {
      acc.general.push(cur)
    } else {
      console.warn(`[lerna-ci] package name \`${cur}\` is invalid and ignored`)
    }
    return acc
  }, result)
  return {
    specific: uniqArray(result.specific),
    general: uniqArray(result.general)
  }
}

/** calc max value with custom compare */
export function calcMax<V>(list: V[], compare: ((a: V, b: V) => number)): V | undefined {
  if (!list.length) return
  return list.reduce((acc, cur) => {
    return compare(acc, cur) > 0 ? acc : cur
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  }, list.shift()!)
}

/** get maxVersion of from the given version list  */
export function maxVersion(...vers: (string | undefined)[]) {
  return calcMax(vers.filter(v => !!v) as string[], semver.compare)
}
