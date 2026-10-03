import path from 'path'
import fs from 'fs'
import { IGetPkgVersionFromRegistryOptions } from './common'
import { runShellCmd, getProjectRoot, readRootPkgJson } from '../../utils'
import { IVersionPickStrategy, IVersionMap } from '../../types'
import { logger } from '../../logger'
import * as npm from './npm'
import * as yarn from './yarn'
import * as yarnNext from './yarn-next'

export const SUPPORTED_NPM_CLIENTS = ['yarn', 'yarn-next', 'npm', 'pnpm'] as const

export type INpmClient =  typeof SUPPORTED_NPM_CLIENTS[number]

const processors: Record<INpmClient, typeof npm> = {
  'yarn-next': yarnNext,
  yarn,
  npm,
  pnpm: npm
}


export interface IGetPkgVersionsFromRegistryOptions {
  /**
   * package names
   */
  pkgNames: string[]
  /**
   * version pick strategy
   */
  versionStrategy?: IVersionPickStrategy
  /**
   * preferred npm client, detect automatically if not provided
   */
  npmClient?: INpmClient
}

/**
 * get versions from npm registry
 */
export async function getVersionsFromRegistry({ pkgNames, versionStrategy, npmClient }: IGetPkgVersionsFromRegistryOptions) {
  const result: IVersionMap = {}
  const client = npmClient || await getRepoNpmClient()
  if (!processors[client]) {
    throw new Error('unsupported npm client: ' + client)
  }
  for (let offset = 0; offset < pkgNames.length; offset += 6) {
    const items = pkgNames.slice(offset, offset + 6)
    const vers = await Promise.all(items.map(name => getVersionFormRegistry({
      pkgName: name,
      versionStrategy: versionStrategy || 'max',
      // @ts-ignore
      npmClient: client
    })))
    vers.forEach((ver, idx) => {
      if (!ver) return
      result[items[idx]] = ver
    })
  }
  return result
}

export async function getVersionFormRegistry(
  options: IGetPkgVersionFromRegistryOptions & {npmClient?: INpmClient; throwOnError?: boolean }): Promise<string | undefined> {
  const npmClient = options.npmClient || await getRepoNpmClient()
  const client = processors[npmClient]
  if (!client) {
    throw new Error('unsupported npm client: ' + npmClient)
  }
  try {
    const version = await client.getPkgVersion(options)
    return version
  } catch (error: any) {
    // A missing package has no occupied versions; other failures must block publish checks.
    if (options.throwOnError && !/\bE404\b/.test(String(error))) throw error
    logger.warn(`[lerna-ci] unable to get version of ${options.pkgName} from registry`, error instanceof Error ? error.message : String(error))
    return
  }
}


/**
 * get lerna monorepo preferred npm client
 */
export async function getRepoNpmClient(): Promise<INpmClient> {
  let client = await try2ReadPkg()
  if (client === false) {
    client = await try2ReadClientCfg()
    if (client === false) {
      client = await try2getLernaClient()
    }
  }
  if (!client) client = 'npm'
  if (client === 'yarn') {
    const yarnVersion = await runShellCmd('yarn', ['--version'])
    if (!/^[01]\./.test(yarnVersion)) client = 'yarn-next'
  }
  return client as INpmClient
}

async function try2getLernaClient() {
  const rootDir = await getProjectRoot()
  const cfgPath = path.join(rootDir, 'lerna.json')
  if (!fs.existsSync(cfgPath)) return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cfg = fs.readFileSync(cfgPath, 'utf8')
    return JSON.parse(cfg).npmClient
  } catch (error) {
    throw new Error('lerna.json maybe corrupted, unable to read its contents')
  }
}

async function try2ReadPkg() {
  const pkgJson = await readRootPkgJson()
  if (!pkgJson.packageManager) return false
  const [name, version] = pkgJson.packageManager.split('@')
  if (!SUPPORTED_NPM_CLIENTS.includes(name)) {
    throw new Error(`${pkgJson.packageManager} currently not supported by lerna-ci, you may fill an issue`)
  }
  if (name === 'yarn') {
    return /^[01]\./.test(version) ? 'yarn' : 'yarn-next'
  }
  return name
}

async function try2ReadClientCfg() {
  const rootDir = await getProjectRoot()
  const files = await fs.promises.readdir(rootDir, { withFileTypes: true })
  const fileNames = files.filter(f => f.isFile()).map(f => f.name)
  if (fileNames.includes('yarn.lock')) return 'yarn'
  if (fileNames.includes('pnpm-lock.yaml')) return 'pnpm'
  if (fileNames.includes('package-lock.json')) return 'npm'
  return false
}
