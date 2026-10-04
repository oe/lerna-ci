/**
 * get changed packages
 *  only works with lerna and changeset
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  isManagedByLerna,
  runNpmCmd,
  IPackageDigest,
  getProjectRoot,
  getGitRoot,
  logger,
  getAllPackageDigests,
  CIError,
} from '../common'
import { cleanUpLernaCliOutput } from '../common/get-all-packages/lerna'

export async function getChanged() {
  const isUsingLerna = await isManagedByLerna()
  const isGit = await getGitRoot()
  if (!isGit) {
    throw new CIError('not-in-git-repo', 'getChanged(changed) only works in git repo')
  }
  if (isUsingLerna) {
    logger.info('using lerna to detect changed packages')
    return await getChangedByLerna()
  }
  const usingChangeset = await isUsingChangeset()
  if (usingChangeset) {
    logger.info('using changesets to detect changed packages')
    return await getChangedByChangeset()
  }
  throw new CIError('not-support', 'only support lerna and changeset to retrieve changed packages')
}

async function getChangedByLerna() {
  try {
    const result = await runNpmCmd('--no-install', 'lerna', 'changed', '--json')
    return JSON.parse(cleanUpLernaCliOutput(result)) as IPackageDigest[]
  } catch (error) {
    // @ts-ignore
    if (/is already released/i.test(error)) return []
    throw new CIError('lerna-error', error as string)
  }
}

async function getChangedByChangeset() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lerna-ci-changeset-'))
  const tempFile = path.join(tempDir, 'status.json')
  try {
    await runNpmCmd('--no-install', 'changeset', 'status', '--output', tempFile)
    const allPkgs = await getAllPackageDigests()
    const content = fs.readFileSync(tempFile, 'utf-8')
    const result = JSON.parse(content)
    const changedPkgNames: string[] = result.releases.map(item => item.name)
    return allPkgs.filter(pkg => changedPkgNames.includes(pkg.name))
  } catch (error) {
    throw new CIError('changeset-error', error as string)
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    fs.rmdirSync(tempDir)
  }
}

async function isUsingChangeset() {
  const root = await getProjectRoot()
  return fs.existsSync(path.join(root, '.changeset'))
}
