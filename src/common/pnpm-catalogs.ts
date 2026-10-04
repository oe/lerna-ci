import fs from 'fs'
import path from 'path'
import { IChangedCategory, IChangedPackage, IPackageDigest, IVersionMap, IVerTransform } from './types'
import { PKG_DEP_KEYS } from './utils'
import { describeSkippedVersion, updateDepsVersion } from './update-package'
import { ISyncSkipped } from './sync-plan'

interface ICatalog {
  name: string
  path: string[]
  versions: IVersionMap
}

export async function readPnpmCatalogs(rootPath: string) {
  const file = path.join(rootPath, 'pnpm-workspace.yaml')
  if (!fs.existsSync(file)) return undefined
  // Keep the YAML parser out of startup for npm/Yarn and non-workspace projects.
  // A default import also works on Node 14.6, before CJS named-import detection.
  const { default: yaml } = await import('yaml')
  const content = fs.readFileSync(file, 'utf8')
  const document = yaml.parseDocument(content, { merge: true })
  if (document.errors.length) throw new Error(`Invalid ${file}: ${document.errors[0].message}`)
  // Do not convert unrelated pnpm settings (including potentially large alias
  // graphs) when the workspace does not define catalogs. Root merges may define
  // catalogs indirectly, so they still need inspection.
  if (!document.has('catalog') && !document.has('catalogs') && !document.has('<<')) {
    return { file, content, document, catalogs: new Map<string, ICatalog>(), overrides: undefined, rootPath, yaml }
  }
  const manifest = document.toJS({ maxAliasCount: 100 }) || {}
  assertMap(manifest, 'pnpm workspace manifest')
  if (manifest.catalogs != null) assertMap(manifest.catalogs, 'catalogs')
  if (manifest.catalog != null && (manifest.catalogs as Record<string, unknown> | undefined)?.default != null) {
    throw new Error('The default catalog is defined twice; use catalog or catalogs.default, not both')
  }
  const catalogs = new Map<string, ICatalog>()
  const add = (name: string, nodePath: string[], versions: unknown) => {
    assertMap(versions, `catalog ${name}`)
    for (const [pkgName, version] of Object.entries(versions)) {
      if (typeof version !== 'string') throw new Error(`Invalid catalog ${name} entry ${pkgName}: expected a string version`)
      if (version.startsWith('catalog:')) throw new Error(`Catalog ${name} entry ${pkgName} recursively references another catalog`)
    }
    catalogs.set(name, { name, path: nodePath, versions: versions as IVersionMap })
  }
  if (manifest.catalog != null) add('default', ['catalog'], manifest.catalog)
  if (manifest.catalogs != null) {
    assertMap(manifest.catalogs, 'catalogs')
    for (const [name, versions] of Object.entries(manifest.catalogs)) add(name, ['catalogs', name], versions)
  }
  return { file, content, document, catalogs, overrides: manifest.overrides, rootPath, yaml }
}

type IPnpmCatalogs = Awaited<ReturnType<typeof readPnpmCatalogs>>

function assertMap(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}: expected an object`)
}

export function getCatalogPackageNames(context: IPnpmCatalogs): string[] {
  return context ? Array.from(new Set(Array.from(context.catalogs.values()).flatMap(catalog => Object.keys(catalog.versions)))) : []
}

/** Validate all selected references before any manifest or workspace file is written. */
export function validateCatalogReferences(context: IPnpmCatalogs, packages: Array<{ digest: IPackageDigest; manifest: Record<string, any> }>) {
  const validate = (pkgName: string, specifier: unknown, source: string) => {
    if (typeof specifier !== 'string' || !specifier.startsWith('catalog:')) return
    const catalogName = specifier.slice('catalog:'.length).trim() || 'default'
    const catalog = context?.catalogs.get(catalogName)
    if (!catalog || !Object.prototype.hasOwnProperty.call(catalog.versions, pkgName)) {
      throw new Error(`No catalog entry ${pkgName} found in catalog ${catalogName} (${source})`)
    }
  }
  for (const { digest: pkg, manifest } of packages) {
    for (const key of PKG_DEP_KEYS) {
      for (const [name, version] of Object.entries(manifest[key] || {})) validate(name, version, `${pkg.name}.${key}`)
    }
  }
  for (const [selector, version] of Object.entries(context?.overrides || {})) {
    // Match pnpm's parent>child delimiter, excluding '>' inside a version range.
    const delimiter = selector.search(/[^ |@]>/)
    const target = (delimiter < 0 ? selector : selector.slice(delimiter + 2)).trim()
    const name = target.match(/^(@[^/]+\/[^@\s]+|[^@\s]+)/)?.[0] || target
    validate(name, version, `overrides.${selector}`)
  }
}

/** Edit only version tokens so comments, quoting, other settings and CRLF survive. */
export function planCatalogUpdates(context: IPnpmCatalogs, versions: IVersionMap, versionTransform: IVerTransform, exact?: boolean, skipped?: ISyncSkipped[], customTransform = false) {
  if (!context) return undefined
  const { isNode, isMap, isScalar, stringify } = context.yaml
  const categories: IChangedCategory[] = []
  const edits: { start: number; end: number; value: string }[] = []
  for (const catalog of context.catalogs.values()) {
    const changes = updateDepsVersion({
      dependencies: { ...catalog.versions }, versions, versionTransform, exact, customTransform,
      onSkipped: (name, oldVersion, targetVersion) => skipped?.push({
        packageName: 'pnpm-workspace.yaml', location: context.rootPath, field: catalog.path.join('.'), name, oldVersion, targetVersion,
        ...describeSkippedVersion(oldVersion, targetVersion, customTransform),
      }),
    })
    if (!changes) continue
    categories.push({ field: catalog.path.join('.'), changes })
    const mapping = context.document.getIn(catalog.path, true)
    // YAMLMap.get scans its pairs linearly. Index once for large catalogs.
    const nodes = new Map(isMap(mapping) ? mapping.items.map(pair => [
      isScalar(pair.key) ? String(pair.key.value) : '', pair.value,
    ] as const) : [])
    const anchoredParent = catalog.path.some((_key, index) => {
      const parent = context.document.getIn(catalog.path.slice(0, index + 1), true)
      return isNode(parent) && 'anchor' in parent && !!parent.anchor
    })
    for (const change of changes) {
      const node = nodes.get(change.name)
      // Updating a shared anchor would also change unrelated settings. Fail before writing.
      if (!isScalar(node) || !node.range || node.anchor || anchoredParent || node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') {
        throw new Error(`Cannot safely update catalog ${catalog.name} entry ${change.name}: use a direct single-line scalar without a YAML anchor or merge`)
      }
      const type = node.type === 'QUOTE_SINGLE' || node.type === 'QUOTE_DOUBLE' ? node.type : 'PLAIN'
      const value = stringify(change.newVersion, { defaultStringType: type, lineWidth: 0 }).trimEnd()
      edits.push({ start: node.range[0], end: node.range[1], value })
    }
  }
  if (!categories.length) return undefined
  // Assemble once instead of copying the whole workspace file for every edit.
  const parts: string[] = []
  let cursor = 0
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    parts.push(context.content.slice(cursor, edit.start), edit.value)
    cursor = edit.end
  }
  parts.push(context.content.slice(cursor))
  const content = parts.join('')
  const change: IChangedPackage = {
    name: 'pnpm-workspace.yaml', location: context.rootPath, private: true, changes: categories,
  }
  return { change, file: { path: context.file, before: context.content, after: content } }
}
