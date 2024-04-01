import path from 'path'
import fs from 'fs'
import semver from 'semver'
import child_process, { type SpawnOptions } from 'child_process'
import { IPackageDigest } from './types'

/**
 * dependence key for package.json
 */
export const  PKG_DEP_KEYS = <const>['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** platform detect */
export const isWin = /^win/.test(process.platform)


/**
 * run local shell command with spawn
 *  resolve with command exec outputs if cmd return 0, or reject with error message
 * @param  {String} cmd     cmd name
 * @param  {Array<String>} args    args list
 * @param  {Object} options spawn cmd options, cwd is vital
 */
export function runShellCmd (cmd: string, options?: SpawnOptions): Promise<string>
export function runShellCmd (cmd: string, args?: string[], options?: SpawnOptions): Promise<string>
export function runShellCmd (cmd: string, args?: string[] | SpawnOptions, options?: SpawnOptions) {
  if (!Array.isArray(args)) {
    options = args
    args = []
  }
  const task = child_process.spawn(
    cmd,
    // @ts-ignore
    args,
    Object.assign(
      {
        cwd: process.cwd(),
        shell: true
      },
      options
    )
  )

  return new Promise<string>((resolve, reject) => {
    // record response content
    const stdout: (string | Buffer)[] = []
    const stderr: (string | Buffer)[] = []
    task.stdout!.on('data', data => {
      stdout.push(data)
    })
    task.stderr!.on('data', data => {
      stderr.push(data)
    })

    // listen on error, to aviod command crash
    task.on('error', () => {
      reject(stderr.join('').toString())
    })

    task.on('exit', code => {
      if (code) {
        stderr.unshift(`error code: ${code}\n`)
        reject(stderr.join('').toString())
      } else {
        resolve(stdout.join('').toString())
      }
    })
  })
}

/**
 * find a file(dir) recursive( aka try to find package.json, node_modules, etc.)
 * @param fileName file name(or dir name if isDir is true)
 * @param dir the initial dir path to find, use `process.cwd()` by default
 * @param isDir whether to find a dir
 */
export function findFileRecursive (fileName: string | string[], dir = process.cwd(), isDir = false): string {
  // const filepath = path.join(dir, fileName)
  const fileNames = Array.isArray(fileName) ? fileName : [fileName]
  let f: string | undefined = ''
  // tslint:disable-next-line:no-conditional-assignment
  while ((f = fileNames.shift())) {
    const filepath = path.join(dir, f)
    try {
      const stat = fs.statSync(filepath)
      const isFound = isDir ? stat.isDirectory() : stat.isFile()
      if (isFound) return filepath
    } catch (e) {
      // xxx
    }
  }
  // has reach the top root
  const parentDir = path.dirname(dir)
  if (parentDir === dir) return ''
  return findFileRecursive(fileName, parentDir, isDir)
}

/** run npm command via npx */
export async function runNpmCmd(...args: string[]) {
  const rootPath = await getProjectRoot()
  return runShellCmd(isWin ? 'npx.cmd' : 'npx', args, { cwd: rootPath })
}

export async function readRootPkgJson() {
  const rootRepo = await getProjectRoot()
  return readPackageJson(rootRepo)
}

let projectRoot: string
/**
 * get current project root dir
 */
export async function getProjectRoot(): Promise<string> {
  if (projectRoot) return projectRoot
  const gitRoot = await getGitRoot()
  if (gitRoot && fs.existsSync(path.join(gitRoot, 'package.json'))) {
    projectRoot = gitRoot
  } else {
    const defPkgPath = findFileRecursive('package.json', process.cwd())
    projectRoot = path.dirname(defPkgPath)
  }
  if (!projectRoot) {
    throw new Error('unable to determine project root path')
  }
  return projectRoot
}

let gitRootPath: string | false

/**
 * get git root path, return false if not in git repo
 */
export async function getGitRoot(): Promise<string | false> {
  if (gitRootPath !== undefined) return gitRootPath
  try {
    const result = await runShellCmd('git', ['rev-parse', '--show-toplevel'])
    gitRootPath = result.trim()
  } catch (error) {
    gitRootPath = false
  }
  return gitRootPath
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

/**
 * get parsed package.json in a package
 * @param pkgPath package location
 * @returns 
 */
export function readPackageJson(pkgPath: string) {
  const pkgJsonPath = path.join(pkgPath, 'package.json')
  // not lerna powered project
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`package.json not found in project: ${pkgPath}`)
  }
  try {
    const content = fs.readFileSync(pkgJsonPath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`project root's package.json is corrupted, located in ${pkgPath}`)
  }
}

/**
 * // sync all tags from remote, and prune no-exists tags in locale
 */
export async function syncPruneGitTags() {
  await runShellCmd('git', ['fetch', 'origin', '--prune', '--tags'])
}

function getPackageDependencies(pkgDigest: IPackageDigest, unique?: boolean) {
  const content = readPackageJson(pkgDigest.location)
  let pkgNames: string[] = []
  PKG_DEP_KEYS.forEach(key => {
    if (!content[key]) return
    pkgNames = pkgNames.concat(Object.keys(content[key]))
  })
  return unique ? Array.from(new Set(pkgNames)) : pkgNames
}

export function getAllDependencies(allPkgDigests: IPackageDigest[]) {
  const results = allPkgDigests.map(digest=> getPackageDependencies(digest))
  let allPackageNames: string[] = []
  allPackageNames = results.reduce((acc, cur) => acc.concat(cur), allPackageNames)
  return Array.from(new Set(allPackageNames))
}


export class CIError extends Error {
  type: string
  constructor(type: string, message: string) {
    super(message)
    this.type = type
    this.name = 'CIError'
  }
}