# API reference

[Getting started](../readme.md) · [Development and compatibility](development.md)

The package ships CommonJS modules and TypeScript declarations. Both forms work:

```ts
import { EVerSource, syncLocal, syncDeps, canPublish, getAllPackageDigests, fixpack } from 'lerna-ci'
```

```js
const { EVerSource, syncLocal, syncDeps, canPublish } = require('lerna-ci')
```

Native ESM default imports work on the minimum Node 14.6 runtime. Native named
imports from CommonJS require Node 14.13 or later. TypeScript with `esModuleInterop`
and `isolatedModules` is supported. Operations use the current working directory;
run them inside the intended workspace.

## Synchronization results

`syncLocal` and `syncDeps` return `Promise<IChangedPackage[] | false>`.
`false` means no changes were proposed or made. Check-only returns the same change
shape while leaving package manifests and `pnpm-workspace.yaml` untouched.

```ts
interface IChangedPackage {
  name: string
  location: string
  private: boolean
  changes: IChangedCategory[]
}
interface IChangedCategory {
  field: string
  changes: IChangedPkg[]
}
interface IChangedPkg {
  name: string
  oldVersion: string
  newVersion: string
}
```

For package changes, fields include `version`, `dependencies`, `devDependencies`,
`peerDependencies`, and `optionalDependencies`. For catalog changes, the item name
is `pnpm-workspace.yaml`, its location is the workspace root, and fields include
`catalog` or `catalogs.next`. Git-backed operations can fetch tags even in check-only mode.

## syncLocal

Align local dependency ranges and, for remote sources, package versions.

```ts
async function checkInternalRanges() {
  return syncLocal({
    versionSource: EVerSource.LOCAL,
    exact: false,
    checkOnly: true,
  })
}
```

| `ISyncPackageOptions` field | Meaning / default |
| --- | --- |
| `versionSource` | `EVerSource.ALL` (API default), `LOCAL`, `NPM`, or `GIT`; the CLI defaults to `local` |
| `versionStrategy` | Remote version selection: `latest` (default), `max`, or `max-stable` |
| `packageFilter` | Object or predicate selecting workspace packages |
| `versionRangeStrategy` | `retain` (default), `^`, `~`, `>`, `>=`, empty string, or a custom transform |
| `checkOnly` | Return proposed changes without writing manifests; default false |
| `exact` | Apply the transformed version even when the target satisfies the old range; default true |

`LOCAL` uses local versions without querying registry or Git versions. Remote sources
choose the maximum of local and selected remote versions. Private packages are
excluded from registry queries. Git version retrieval fetches `origin` tags.
Package filters select local package names; shared catalogs can affect other consumers.

See [CLI workflow](../readme.md#synclocal).

## syncDeps

Apply explicit target versions and/or fetch selected dependency versions.

```ts
async function checkChosenDependencies() {
  return syncDeps({
    versionMap: { react: '19.0.0', 'react-dom': '19.0.0' },
    exact: false,
    checkOnly: true,
  })
}
```

| `ISyncDepOptions` field | Meaning / default |
| --- | --- |
| `packageNames` | Names or wildcard patterns whose versions should be fetched |
| `versionMap` | Explicit name/pattern-to-version targets; takes precedence over fetched versions |
| `versionPickStrategy` | Registry selection: `max-stable` (default), `latest`, or `max` |
| `versionRangeStrategy` | `retain` (default), `^`, `~`, `>`, `>=`, `<`, `<=`, empty string, or a custom transform |
| `checkOnly` | Return proposed changes without writing manifests; default false |
| `exact` | Apply the transformed version; set false to preserve a range containing the target |

Patterns such as `@babel/*` or `eslint-plugin-*` match names already present in the
workspace or its pnpm catalogs. Explicit wildcard targets avoid redundant registry
requests. All four dependency fields participate, including peer dependencies.
Missing names have no matching manifest entry to update. An empty target set returns false.

Built-in range strategies preserve protocol dependencies and `*`. pnpm catalog
references are preserved even when a custom transform is used; the transform receives
the catalog entry's actual value instead. `exact: false` checks semver containment.

See [CLI workflow](../readme.md#syncdeps) and [catalog behavior](../readme.md#pnpm-catalogs).

## getAllPackageDigests

Returns `Promise<IPackageDigest[]>`, including the root package once. Versions and
manifests are read fresh on each call.

```ts
interface IPackageDigest {
  name: string
  version: string
  private: boolean
  location: string
}
```

```ts
async function publicInternalPackages() {
  return getAllPackageDigests({ ignorePrivate: true, keyword: '@internal/' })
}
```

Import `getAllPackageDigests` from `lerna-ci`. A predicate
`(pkg, index, packages) => boolean` is also accepted. The optional second argument
provides an already-resolved root path. Object-form Yarn Classic workspaces are supported.

## canPublish

Returns `Promise<IPublishQualification>`. It performs checks without publishing.
Git fetch and registry/command failures can reject the promise.

```ts
async function checkUniformPatchRelease() {
  const result = await canPublish({ releaseType: 'patch', checkCommit: true })
  if (!result.eligible) console.error(result.reasons)
  return result
}
```

| `ICanPushOptions` field | Meaning |
| --- | --- |
| `releaseType` | Required: `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, or `prerelease` |
| `period` | Prerelease identifier; defaults to `alpha` when relevant |
| `checkCommit` | Check uncommitted files; opt in for API calls, true by default in the CLI |
| `useMaxVersion` | Also require local versions to match the maximum of local/Git/npm versions |

The result is `{ eligible: true }` or `{ eligible: false, reasons }`. Reason types
are `git-not-clean`, `git-outdated`, `local-version-outdated`, and
`next-version-unavailable`; each includes structured content. Unresolved conflicts
and upstream comparison still apply when `checkCommit` is false.

Lerna or Changesets selects packages; without either, a Git workspace checks all
discovered packages. The **same release type** is applied to each selected package.
Changesets' per-package planned versions are not used. Run before a uniform bump;
mixed release plans require separate validation. Private packages skip registry
availability checks. Publish credentials and packed artifacts are outside this check.

See [release prerequisites and examples](../readme.md#release-preflight).

## getChanged

Returns `Promise<IPackageDigest[]>` selected by Lerna's changed command or Changesets'
status output. Requires Git plus an installed/configured provider. Plain workspaces
raise `CIError` with type `not-support`; a non-Git directory raises `not-in-git-repo`.
Changesets status uses isolated temporary files, including concurrent calls.

## fixpack

Returns `Promise<IPackageDigest[]>` for manifests that changed or would change.
`IFixPackOptions` accepts `packageFilter` and a `config` forwarded to fixpack.

```ts
async function previewFormatting() {
  return fixpack({ config: { dryRun: true } })
}
```

Import `fixpack` from `lerna-ci`. With no custom config, the project's default
[formatting configuration](../src/fixpack-all/config.ts) is used. Custom config
replaces that configuration; see [fixpack options](https://github.com/HenrikJoreteg/fixpack#configuration).

## Registry and Git helpers

| Function | Result and behavior |
| --- | --- |
| `getRepoNpmClient(rootDir?)` | Promise of `npm`, `pnpm`, `yarn`, or `yarn-next`; detects the workspace client |
| `getVersionFormRegistry(options)` | Promise of a version string or undefined; the public name retains its original `Form` spelling |
| `getVersionsFromRegistry(options)` | Promise of a name/version map; names are deduplicated, requests are limited to six active workers |
| `getPackageVersionsFromGit(strategy?)` | Promise of a name/version map from `packageName@version` tags; fetches `origin` first |

`getVersionFormRegistry` accepts `pkgName`, optional `version`, `versionStrategy`
(`latest`, `max`, `max-stable`), `npmClient`, and `throwOnError`. An explicit version
is returned only if found; absence can produce an empty string. Ordinary command
failures warn and return undefined. `throwOnError: true` propagates failures except
`E404`, which is treated as unpublished. Batch results omit unresolved versions.
For pnpm projects these helpers invoke npm, so configure npm/`.npmrc` for custom
registries and authentication. pnpm's YAML-only registry settings are not consumed.
Yarn projects use the corresponding Yarn command and configuration.

`getVersionsFromRegistry` accepts `pkgNames`, optional `versionStrategy` (default
`max`) and `npmClient`. Git helper strategies are `latest` (default: newest tag by
creation date), `max` (highest semver), and `max-stable` (highest stable semver,
falling back to prereleases when no stable version exists).

## Other public utilities

| Export | Purpose |
| --- | --- |
| `getRootPackageDigest(rootPath?)` | Read the current root digest |
| `getProjectRoot()` | Resolve the current workspace/project root |
| `getGitRoot()` | Resolve the Git root, or false outside Git |
| `findFileRecursive(names, dir?, isDir?)` | Search the current directory and ancestors |
| `readPackageJson(directory)` / `readRootPkgJson()` | Read fresh JSON manifests |
| `isManagedByLerna()` / `isLernaAvailable()` | Detect configuration / installed Lerna |
| `runShellCmd(command, args?, options?)` | Shell execution by default for compatibility; pass `{ shell: false }` for literal arguments; reject failed exits/signals |
| `runNpmCmd(...args)` | Run npx in the project root |
| `syncPruneGitTags()` | Fetch origin tags and prune stale remote-tracking branches |
| `maxVersion(...versions)` | Maximum of valid semver inputs; use full versions such as `0.1.0` |
| `pickOne(items, compare)` | Select the maximum without mutating the input array |
| `getVersionTransformer(strategy?)` | Build a range-preserving/explicit/custom transform |
| `updatePackageJSON(options)` | Update one manifest; honors check-only and reports changed categories |
| `getAllDependencies(digests)` | Unique dependency names from workspace manifests |
| `isAsteriskPkgName(name)` / `isPkgNameMatchingPattern(name, pattern)` | Validate and match wildcard names |
| `getConfig()` / `setConfig(options)` | Read/set the library debug setting |
| `logger`, `formatMessages`, `getIndent` | Logging and message formatting |
| `CIError` | Error with a workflow-specific `type` |
| `EVerSource`, `RELEASE_TYPES`, `SUPPORTED_NPM_CLIENTS`, `PKG_DEP_KEYS`, `isWin` | Shared values and platform information |

Full option/result interfaces ship in `dist/*.d.ts`. CommonJS entry points and
existing module paths are preserved; no API renaming is required for 2.1.0.
