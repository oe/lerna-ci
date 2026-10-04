import fs from 'fs'
import path from 'path'
import { IPackageDigest } from '../types'
import { getProjectRoot, runNpmCmd } from '../utils'

/**
 * get all package's info in a lerna project
 */
export async function getAllPackages(rootPath?: string): Promise<IPackageDigest[] | false> {
  rootPath = rootPath || await getProjectRoot()
  const isUsingLerna = fs.existsSync(path.join(rootPath, 'lerna.json'))
  // not lerna powered project
  if (!isUsingLerna) return false
  const isLernaInstalled = await checkLerna()
  if (!isLernaInstalled) {
    throw new Error('lerna not installed, please install project\' dependencies')
  }
  /**
   * don't install from npm remote if lerna not installed
   */
  const args = ['--no-install', 'lerna', 'list', '-a', '--json']
  // if (needPrivate) args.push('--all')
  // if (searchKwd) args.push(searchKwd)
  const pkgsString = await runNpmCmd(...args)
  return JSON.parse(cleanUpLernaCliOutput(pkgsString)) as IPackageDigest[]
}

/** check whether monorepo is managed by lerna */
export async function isManagedByLerna() {
  const rootRepo = await getProjectRoot()
  // not lerna powered project
  return fs.existsSync(path.join(rootRepo, 'lerna.json'))
}

/**
 * detect whether lerna has been installed
 */
export async function isLernaAvailable() {
  try {
    await runNpmCmd('--no-install', 'lerna', '-v')
    return true
  } catch {
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
    .filter(l => /^[\s[\]]/.test(l))
    .join('\n')
}

async function checkLerna(): Promise<boolean> {
  const isLernaInstalled = await isLernaAvailable()
  if (!isLernaInstalled) {
    console.warn('[lerna-ci] lerna not installed')
    return false
  }
  return true
}
