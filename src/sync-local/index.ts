import {
  maxVersion,
  IPackageDigest,
  IVersionMap,
  EVerSource,
  getAllPackageDigests,
  IPackageFilterOptions,
  getVersionsFromRegistry,
  getPackageVersionsFromGit,
  IVersionPickStrategy,
  IUpgradeVersionStrategy,
  getVersionTransformer,
  getGitRoot,
  getProjectRoot,
  getRepoNpmClient,
  IChangedPackage,
  CIError,
} from '../common'
import { planCatalogUpdates, readPnpmCatalogs, validateCatalogReferences } from '../common/pnpm-catalogs'
import { capturePackageInputs, createSyncPlan, ISyncPlan, ISyncSkipped, ISyncTarget, validateSyncPlan } from '../common/sync-plan'
import { planPackageJSON } from '../common/update-package'

export interface ISyncPackageOptions {
  /**
   * version source, default to `all` for the API (`local` for the CLI)
   * how to get latest locale package versions: npm, git, local or all
   * @default 'all'
   */
  versionSource?: EVerSource
  /**
   * npm/git version strategy
   * @default 'latest'
   */
  versionStrategy?: IVersionPickStrategy
  /**
   * filter which package should be synced
   */
  packageFilter?: IPackageFilterOptions
  /**
   * version range strategy
   * @default 'retain'
   */
  versionRangeStrategy?: IUpgradeVersionStrategy
  /**
   * only check, with package.json and pnpm-workspace.yaml files untouched
   * validate package whether need to update, don't change package.json file actually
   */
  checkOnly?: boolean
  /**
   * check whether packages' versions are exactly same
   * @default true
   */
  exact?: boolean
  /** Reject registry failures and ranges requiring manual changes. Legacy API default false. */
  strict?: boolean
}

const DEFAULT_OPTIONS: ISyncPackageOptions = {
  versionSource: EVerSource.ALL,
  versionStrategy: 'latest',
  versionRangeStrategy: 'retain',
  // The 2.0.2 API rewrote satisfying ranges by default. Keep that behavior while
  // allowing callers to opt into the corrected exact:false containment check.
  exact: true,
}

/**
 * sync all local packages' version
 *  return all packages' digest info that need to update (has been upated if isValidate is false)
 */
export async function syncLocal(syncOptions: ISyncPackageOptions = {}): Promise<IChangedPackage[] | false> {
  const options = { ...syncOptions, strict: syncOptions.strict ?? false }
  const plan = await planSyncLocal(options)
  validateSyncPlan(plan, options.strict)
  return options.checkOnly ? (plan.changes.length ? plan.changes : false) : plan.apply()
}

/** Plan all edits without writing. Keeps the API's all-source default; strict by default. */
export async function planSyncLocal(syncOptions: ISyncPackageOptions = {}): Promise<ISyncPlan> {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const strict = options.strict ?? true
  const rootPath = await getProjectRoot()
  const isPnpm = await getRepoNpmClient(rootPath) === 'pnpm'
  const catalogs = isPnpm ? await readPnpmCatalogs(rootPath) : undefined
  const allPkgs = await getAllPackageDigests(options.packageFilter, rootPath)
  if (!allPkgs.length) {
    throw new Error('no packages found in current project')
  }
  const inputs = capturePackageInputs(allPkgs)

  if (isPnpm) validateCatalogReferences(catalogs, inputs)
  const { versions: latestVersions, targets } = await getLatestVersions(options.versionSource!, inputs.map(item => item.digest), options.versionStrategy, strict)
  const skipped: ISyncSkipped[] = []
  const customTransform = typeof options.versionRangeStrategy === 'function'
  const versionTransform = getVersionTransformer(options.versionRangeStrategy)
  const catalogUpdate = planCatalogUpdates(catalogs, latestVersions, versionTransform, options.exact, skipped, customTransform)
  const manifestTransform = isPnpm
    ? (name: string, oldVersion: string, newVersion: string) => oldVersion.startsWith('catalog:') ? oldVersion : versionTransform(name, oldVersion, newVersion)
    : versionTransform
  const manifests = inputs.map(({ digest, content, manifest }) => planPackageJSON({
    pkgDigest: digest, content, manifest,
    latestVersions,
    versionTransform: manifestTransform,
    pkgVersion: latestVersions[digest.name],
    exact: options.exact
  }, skipped, customTransform))
  const pkgsUpdated = manifests.map((item, index): IChangedPackage | false => item.changes && { ...inputs[index].digest, changes: item.changes })
    .filter((item): item is IChangedPackage => !!item)
  const files = manifests.map(item => item.file)
  if (catalogUpdate) {
    pkgsUpdated.push(catalogUpdate.change)
  }
  if (catalogs) files.push(catalogUpdate?.file || { path: catalogs.file, before: catalogs.content, after: catalogs.content })
  return createSyncPlan({
    command: 'synclocal', changes: pkgsUpdated, targets, unmatchedTargets: [],
    skipped: skipped.filter(item => !isPnpm || !item.oldVersion.startsWith('catalog:')),
  }, files, strict, false)
}

/**
 * get versions from remote server
 * @param verSource version source: from git, npm or both
 * @param pkgs packages need version info
 */
async function getLatestVersions(
  verSource: EVerSource,
  pkgs: IPackageDigest[],
  versionStrategy?: IVersionPickStrategy,
  strict = false,
) {
  // local package versions
  const localVers: IVersionMap = {}
  pkgs.reduce((acc, cur) => {
    acc[cur.name] = cur.version
    return acc
  }, localVers)
  if (verSource === EVerSource.LOCAL) return {
    versions: localVers,
    targets: Object.entries(localVers).filter(([, version]) => !!version).map(([name, version]): ISyncTarget => ({ name, version, source: 'local' })),
  }

  // versions info from npm
  let npmVers: IVersionMap = {}
  if (verSource !== EVerSource.GIT) {
    // can not get version from private package
    npmVers = await getVersionsFromRegistry({ pkgNames: pkgs.filter(p => !p.private).map(item => item.name), versionStrategy, throwOnError: strict, allowMissing: true })
  }

  // versions info from git
  let gitVers: IVersionMap = {}
  if (verSource !== EVerSource.NPM) {
    const gitRoot = await getGitRoot()
    if (gitRoot) {
      gitVers = await getPackageVersionsFromGit(versionStrategy)
    } else if (strict && verSource === EVerSource.GIT) {
      throw new CIError('git-source-unavailable', 'Git version source requires a Git repository')
    }
  }

  const vers: IVersionMap = {}
  Object.keys(localVers).reduce((acc, key) => {

    acc[key] = maxVersion(npmVers[key], gitVers[key], localVers[key])!
    return acc
  }, vers)
  const result: IVersionMap = {}
  pkgs.reduce((acc, item) => {
    if (vers[item.name]) acc[item.name] = vers[item.name]
    return acc
  }, result)
  return {
    versions: result,
    targets: Object.entries(result).map(([name, version]): ISyncTarget => ({
      name, version, source: localVers[name] === version ? 'local' : npmVers[name] === version ? 'registry' : 'git',
    })),
  }
}
