import path from 'path'
import fs from 'fs'
import { runShellCmd } from 'deploy-toolkit'
import { IGetPkgVersionFromRegistryOptions } from './common'
import { getProjectRoot, readRootPkgJson } from '../../utils'
import { IVersionPickStrategy, IVersionMap } from '../../types'
import { logger } from '../../logger'
import * as npm from './npm'
import * as yarn from './yarn'
import * as yarnNext from './yarn-next'

export const SUPPORTED_NPM_CLIENTS = <const>['yarn', 'yarn-next', 'npm', 'pnpm'] 

export type INpmClient =  typeof SUPPORTED_NPM_CLIENTS[number]

const processors: Record<INpmClient, typeof npm> = {
  'yarn-next': yarnNext,
  yarn,
  npm,
  pnpm: npm
}

/**
 * get versions from npm server
 */
export async function getVersionsFromNpm(pkgNames: string[], versionStrategy?: IVersionPickStrategy, npmClient?: INpmClient) {
  const result: IVersionMap = {}
  const client = npmClient || await getRepoNpmClient()
  if (!processors[client]) {
    throw new Error('unsupported npm client: ' + client)
  }
  while (pkgNames.length) {
    const items = pkgNames.splice(-6)
    const vers = await Promise.all(items.map(name => getPkgVersionFormRegistry({
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

export async function getPkgVersionFormRegistry(
  options: IGetPkgVersionFromRegistryOptions & {npmClient?: INpmClient }): Promise<string | undefined> {
  const npmClient = options.npmClient || await getRepoNpmClient()
  const client = processors[npmClient]
  if (!client) {
    throw new Error('unsupported npm client: ' + npmClient)
  }
  try {
    const version = await client.getPkgVersion(options)
    return version
  } catch (error: any) {
    logger.warn(`[lerna-ci] unable to get version of ${options.pkgName} from registry`, error.message)
    return
  }
}


let repoNpmClient: string | undefined
/**
 * get lerna monorepo preferred npm client
 */
export async function getRepoNpmClient(): Promise<string> {
  if (typeof repoNpmClient !== 'undefined') return repoNpmClient
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
  // @ts-ignore
  repoNpmClient = client
  // @ts-ignore
  return repoNpmClient
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
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    if (file.isFile()) {
      if (/^\.yarnrc\./.test(file.name) || file.name === 'yarn.lock') return 'yarn'
      if (/^\.npmrc\./.test(file.name) || file.name === 'package-lock.json') return 'npm'
      if (/^pnpm-workspace\./.test(file.name)
        || /^\.pnpmfile\./.test(file.name)
        || file.name === 'pnpm-lock.yaml') return 'pnpm'
    }
  }
  return false
}
