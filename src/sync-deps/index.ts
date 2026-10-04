import {
  getAllPackageDigests,
  getVersionTransformer,
  getVersionsFromRegistry,
  IVersionPickStrategy,
  IVersionRangeStrategy,
  isAsteriskPkgName,
  isPkgNameMatchingPattern,
  IVersionMap,
  IChangedPackage,
  getProjectRoot,
  getRepoNpmClient,
  logger,
} from '../common'
import { getCatalogPackageNames, planCatalogUpdates, readPnpmCatalogs, validateCatalogReferences } from '../common/pnpm-catalogs'
import { capturePackageInputs, createSyncPlan, ISyncPlan, ISyncSkipped, validateSyncPlan } from '../common/sync-plan'
import { planPackageJSON } from '../common/update-package'

export interface ISyncDepOptions {
  /**
   * package names that should update
   *  will fetch its version from npm by default
   *  package name can use asterisk, e.g. @babel/*
   *
   * @example
   *  ['duplex-message', '@typescript-eslint/parser', '@babel/*', '*plugin*', 'react*']
   */
  packageNames?: string[]
  /**
   * version map<pkgName, version>
   *  prefer use this as version map if provided
   *  pkgName can be a pattern like @babel/*
   *  if packageNames also provided, will fetch missing versions
   * @example
   * {'@babel/*': '7.0.0', 'parcel': '^2.0.0', '@types/react': '~18.0.0'}
   */
  versionMap?: IVersionMap
  /**
   * npm version strategy
   *  default to 'max-stable'
   */
  versionPickStrategy?: IVersionPickStrategy
  /**
   * version range strategy, use retain by default
   */
  versionRangeStrategy?: IVersionRangeStrategy
  /** only check, with package.json and pnpm-workspace.yaml files untouched */
  checkOnly?: boolean
  /**
   * update version to the exact given version
   *  set to false only update when existing version range is not satisfied
   * @default true
   */
  exact?: boolean
  /** Reject registry failures and ranges requiring manual changes. Legacy API default false. */
  strict?: boolean
  /** Require every requested target to match a dependency/catalog entry. Default false. */
  requireMatch?: boolean
}

const DEFAULT_OPTIONS: ISyncDepOptions = {
  versionMap: {},
  versionRangeStrategy: 'retain',
  versionPickStrategy: 'max-stable',
  exact: true,
}

/**
 * sync all packages' dependencies' versions
 * @param syncOptions options
 */
export async function syncDeps(syncOptions: ISyncDepOptions): Promise<IChangedPackage[] | false> {
  const options = { ...syncOptions, strict: syncOptions.strict ?? false }
  const plan = await planSyncDeps(options)
  validateSyncPlan(plan, options.strict, options.requireMatch)
  return options.checkOnly ? (plan.changes.length ? plan.changes : false) : plan.apply()
}

/** Plan all edits without writing. Unlike the legacy API, planning is strict by default. */
export async function planSyncDeps(syncOptions: ISyncDepOptions): Promise<ISyncPlan> {
  const options = Object.assign({}, DEFAULT_OPTIONS, syncOptions)
  const strict = options.strict ?? true
  const rootPath = await getProjectRoot()
  const isPnpm = await getRepoNpmClient(rootPath) === 'pnpm'
  const catalogs = isPnpm ? await readPnpmCatalogs(rootPath) : undefined
  const allPkgDigests = await getAllPackageDigests(undefined, rootPath)
  const inputs = capturePackageInputs(allPkgDigests)
  if (isPnpm) validateCatalogReferences(catalogs, inputs)

  const availableNames = Array.from(new Set([...inputs.flatMap(item => item.dependencyNames), ...getCatalogPackageNames(catalogs)]))
  const requested = Array.from(new Set([...(options.packageNames || []), ...Object.keys(options.versionMap || {})]))
  const unmatchedTargets = requested.filter(pattern => !availableNames.some(name => isPkgNameMatchingPattern(name, pattern)))

  let versionMap = options.versionMap || {}
  if (Array.isArray(options.packageNames) && options.packageNames.length) {
    const packageNames = flatPackageNames(options.packageNames, availableNames)
    const pkgsHasVersion = Object.keys(versionMap)
    const pkgsWithoutVersion = packageNames.filter(n => !pkgsHasVersion.some(pattern => isPkgNameMatchingPattern(n, pattern)))
    if (pkgsWithoutVersion.length) {
      const versionFromNpm = await getVersionsFromRegistry({
        pkgNames: pkgsWithoutVersion, versionStrategy: options.versionPickStrategy, throwOnError: strict, allowMissing: false,
      })
      // add version range to versionFromNpm
      versionMap = Object.assign({}, versionFromNpm, versionMap)
    }
  }
  if (!versionMap || !Object.keys(versionMap).length) {
    logger.warn('[lerna-ci] no package names provided, nothing touched')
  }
  const skipped: ISyncSkipped[] = []
  const customTransform = typeof options.versionRangeStrategy === 'function'
  const versionTransform = getVersionTransformer(options.versionRangeStrategy)
  const catalogUpdate = planCatalogUpdates(catalogs, versionMap, versionTransform, options.exact, skipped, customTransform)
  const manifestTransform = isPnpm
    ? (name: string, oldVersion: string, newVersion: string) => oldVersion.startsWith('catalog:') ? oldVersion : versionTransform(name, oldVersion, newVersion)
    : versionTransform
  const manifests = inputs.map(({ digest, content, manifest }) => planPackageJSON({
    pkgDigest: digest, content, manifest,
    latestVersions: versionMap,
    versionTransform: manifestTransform,
    exact: options.exact,
  }, skipped, customTransform))
  const pkgsUpdated = manifests.map((item, index): IChangedPackage | false => item.changes && { ...inputs[index].digest, changes: item.changes })
    .filter((item): item is IChangedPackage => !!item)
  const files = manifests.map(item => item.file)
  if (catalogUpdate) {
    pkgsUpdated.push(catalogUpdate.change)
  }
  if (catalogs) files.push(catalogUpdate?.file || { path: catalogs.file, before: catalogs.content, after: catalogs.content })
  return createSyncPlan({
    command: 'syncdeps', changes: pkgsUpdated, unmatchedTargets,
    targets: Object.entries(versionMap).map(([name, version]) => ({ name, version, source: Object.prototype.hasOwnProperty.call(options.versionMap || {}, name) ? 'explicit' : 'registry' })),
    skipped: skipped.filter(item => !isPnpm || !item.oldVersion.startsWith('catalog:')),
  }, files, strict, options.requireMatch ?? false)
}

/**
 * flat package names according to mono package's all dependencies (e.g. convert @babel/* to all used scoped packages like @babel/core, @babel/preset-env)
 * @param packageNames package names that should update
 * @param allPackageNames all dependency and catalog names
 */
function flatPackageNames(packageNames: string[], allPackageNames: string[]) {
  const scopedNames:string[] = []
  const normalNames:string[] = []
  packageNames.forEach(name => {
    if (isAsteriskPkgName(name)) {
      scopedNames.push(name)
    } else {
      normalNames.push(name)
    }
  })
  if (!scopedNames.length) return packageNames
  const scopedPkgNames = allPackageNames.filter(name => scopedNames.some(scope => isPkgNameMatchingPattern(name, scope)))
  logger.info(`[lerna-ci] found ${scopedPkgNames.length} scoped packages with patterns ${scopedNames.join(', ')}`)
  if (scopedPkgNames.length) {
    logger.info(`    ${scopedPkgNames.join('  ')}`)
  }
  return normalNames.concat(scopedPkgNames)
}
