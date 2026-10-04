import fs from 'fs'
import path from 'path'
import { IChangedPackage, IPackageDigest } from './types'
import { CIError, PKG_DEP_KEYS } from './utils'

export interface ISyncTarget {
  name: string
  version: string
  source: 'explicit' | 'registry' | 'local' | 'git'
}

export interface ISyncSkipped {
  packageName: string
  location: string
  field: string
  name: string
  oldVersion: string
  targetVersion: string
  reason: 'non-semver' | 'wildcard' | 'complex-range' | 'custom-transform'
  requiresManualUpdate: boolean
}

/** Read-only planning does not write manifests or catalogs. Git sources may fetch tags. */
export interface ISyncPlan {
  command: 'syncdeps' | 'synclocal'
  changes: IChangedPackage[]
  targets: ISyncTarget[]
  unmatchedTargets: string[]
  skipped: ISyncSkipped[]
  /** Apply this in-memory plan before its input files change. */
  apply: () => IChangedPackage[] | false
}

export interface ISyncReport {
  schemaVersion: 1
  command: string
  mode: 'check' | 'apply'
  status: 'unchanged' | 'changes-needed' | 'applied' | 'failed'
  changes: IChangedPackage[]
  targets: ISyncTarget[]
  unmatchedTargets: string[]
  skipped: ISyncSkipped[]
  errors: Array<{ code: string; message: string }>
}

export interface IPlannedFile {
  path: string
  before: string
  after: string
}

export function capturePackageInputs(packages: IPackageDigest[]) {
  return packages.map(digest => {
    const content = fs.readFileSync(path.join(digest.location, 'package.json'), 'utf8')
    const manifest = JSON.parse(content)
    return {
      content,
      manifest,
      digest: { ...digest, name: manifest.name || '', version: manifest.version || '', private: !!manifest.private },
      dependencyNames: PKG_DEP_KEYS.flatMap(key => Object.keys(manifest[key] || {})),
    }
  })
}

/** Validate every input before writing; restore attempted writes on ordinary I/O errors. */
export function applyPlannedFiles(files: IPlannedFile[]) {
  for (const file of files) {
    if (fs.readFileSync(file.path, 'utf8') !== file.before) {
      throw new CIError('stale-plan', `Sync plan is stale: ${file.path} changed; create a new plan`)
    }
  }
  const attempted: IPlannedFile[] = []
  try {
    for (const file of files) {
      if (file.after === file.before) continue
      attempted.push(file)
      fs.writeFileSync(file.path, file.after)
    }
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const file of attempted.reverse()) {
      try { fs.writeFileSync(file.path, file.before) } catch { rollbackErrors.push(file.path) }
    }
    const rollback = rollbackErrors.length ? `; unable to restore: ${rollbackErrors.join(', ')}` : '; attempted changes restored'
    throw new CIError('write-failed', `Unable to apply sync plan: ${String(error)}${rollback}`)
  }
}

export function validateSyncPlan(plan: Pick<ISyncPlan, 'unmatchedTargets' | 'skipped'>, strict: boolean, requireMatch = false) {
  if (requireMatch && plan.unmatchedTargets.length) {
    throw new CIError('unmatched-target', `No dependencies or catalog entries matched: ${plan.unmatchedTargets.join(', ')}`)
  }
  const blocked = plan.skipped.filter(item => item.requiresManualUpdate)
  if (strict && blocked.length) {
    throw new CIError('manual-update-required', `Unable to synchronize ${blocked.map(item => `${item.packageName}.${item.field}.${item.name}`).join(', ')}; update these ranges manually or select another range strategy`)
  }
}

export function createSyncPlan(data: Omit<ISyncPlan, 'apply'>, files: IPlannedFile[], strict: boolean, requireMatch: boolean): ISyncPlan {
  return {
    ...data,
    apply: () => {
      validateSyncPlan(data, strict, requireMatch)
      applyPlannedFiles(files)
      return data.changes.length ? data.changes : false
    },
  }
}
