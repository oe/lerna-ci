# lerna-ci

[![CI](https://github.com/oe/lerna-ci/actions/workflows/main.yml/badge.svg)](https://github.com/oe/lerna-ci/actions)
[![npm version](https://img.shields.io/npm/v/lerna-ci)](https://www.npmjs.com/package/lerna-ci)

**Monorepo dependency synchronization and release preflight checks for pnpm, npm, and Yarn.**

Align internal dependency ranges, apply chosen dependency versions across workspaces,
and check Git, registry, and tag conflicts before a release. Use the CLI or compose
these operations through the TypeScript/CommonJS API. Lerna is optional for synchronization.

- [Quick start](#quick-start)
- [Choose a workflow](#choose-a-workflow)
- [Commands](#commands)
- [pnpm catalogs](#pnpm-catalogs)
- [CI checks](#ci-checks)
- [JSON reports](#json-reports)
- [Release preflight](#release-preflight)
- [Configuration](#configuration)
- [Library API](#library-api)
- [Choosing a tool](#choosing-a-tool)

## Quick start

Requires **Node >=14.6** at runtime. Install in the workspace root:

```sh
pnpm add -Dw lerna-ci
# npm: npm install --save-dev lerna-ci
# Yarn: yarn add --dev lerna-ci
```

For a single-package pnpm project, use `pnpm add -D lerna-ci` without `-w`.
The root package participates in synchronization along with workspace packages.

Suppose two workspace packages declare React as `^18.3.1` and `~18.3.1`.
Preview a coordinated update to a version you have chosen:

```sh
pnpm exec lerna-ci syncdeps react@19.0.0 --check-only
```

The command reports proposed changes and exits **1** because updates are needed.
It leaves package manifests and `pnpm-workspace.yaml` untouched:

```text
^18.3.1 => ^19.0.0
~18.3.1 => ~19.0.0
```

Apply the same update and refresh the lockfile:

```sh
pnpm exec lerna-ci syncdeps react@19.0.0
pnpm install
```

Existing range prefixes are retained. To accept a range that already contains
the target, add `--exact false`. To choose a different prefix, use `--range '~'`.
Targets cover dependencies, devDependencies, optionalDependencies, and
peerDependencies; review peer ranges because changing them can change consumer compatibility.

## Choose a workflow

| Task | Command | Version source |
| --- | --- | --- |
| Check internal dependency ranges against local package versions | `lerna-ci synclocal local --exact false --check-only` | Local manifests |
| Align internal dependencies with local versions | `lerna-ci synclocal local` | Local manifests |
| Apply a chosen external dependency version | `lerna-ci syncdeps react@19.0.0` | Explicit target |
| Update selected dependencies to the highest stable registry versions | `lerna-ci syncdeps react react-dom` | npm registry |
| Compare local, registry and Git-tag versions after a partial release | `lerna-ci synclocal all --check-only` | Maximum of those sources |
| Check a proposed uniform patch release | `lerna-ci canpublish patch` | Git, registry and current manifests |

Run these commands with `pnpm exec`, `npx`, or `yarn` as appropriate for your project.
Git sources fetch tags from `origin`; inspect the check-only result before applying
recovery changes, especially when stable and prerelease versions coexist.

## Commands

### synclocal

```sh
pnpm exec lerna-ci synclocal local --check-only
pnpm exec lerna-ci synclocal local --exact false
pnpm exec lerna-ci synclocal npm --check-only
pnpm exec lerna-ci synclocal all --check-only
```

The source is `local` by default; `npm`, `git`, and `all` are also supported.
`local` updates dependency ranges to local package versions. Other sources can
also raise package versions to the maximum of local and selected remote versions.
This helps inspect version drift after a partial release; it does not roll back
published packages or complete a failed release automatically.

Built-in range strategies preserve `workspace:`, `file:`, npm aliases and `*`.
For pnpm catalog references, the version is updated in the workspace catalog.

### syncdeps

```sh
# Explicit targets: no registry lookup is needed for these versions.
pnpm exec lerna-ci syncdeps react@19.0.0 react-dom@19.0.0

# Quote wildcard targets so the shell does not expand them.
pnpm exec lerna-ci syncdeps '@babel/*@7.26.0'

# Check whether existing ranges contain a chosen target.
pnpm exec lerna-ci syncdeps react@19.0.0 --exact false --check-only

# Read targets from lerna-ci.syncremote configuration.
pnpm exec lerna-ci syncdeps --check-only
```

`--check-only` compares against the supplied targets; when only names are supplied,
it checks against registry versions. This is a target-version check, rather than
an automatic rule requiring all currently installed versions to match one another.
Explicit versions also make CI independent of newly published registry releases.
The legacy `syncremote` command alias and configuration key remain supported.

### canpublish

See [release preflight](#release-preflight) for prerequisites and the release-type boundary.

### changed

```sh
pnpm exec lerna-ci changed
pnpm exec lerna-ci changed --throw
```

Lists packages selected by Lerna's changed command or Changesets' status output.
Requires Git and an installed/configured Lerna or `@changesets/cli` project.
`--throw` exits 1 when changed packages are found. Plain workspaces do not provide
change detection for this command.

### fixpack

```sh
pnpm exec lerna-ci fixpack
```

Formats workspace manifests using [fixpack](https://github.com/HenrikJoreteg/fixpack).
The API accepts package filters, custom formatting options and dry-run configuration.

Each command supports `--help`. Check-only commands exit 0 when no updates are
needed and 1 when updates are proposed or an error occurs. The API returns structured
results instead of setting the process exit code.

## pnpm catalogs

Catalog synchronization is automatic for **pnpm projects using catalogs**.
npm and Yarn retain their ordinary synchronization behavior. With no explicit
`packageManager`, `pnpm-workspace.yaml` identifies a pnpm workspace.

```yaml
# pnpm-workspace.yaml
packages:
  - packages/*
catalog:
  react: ^18.3.1
catalogs:
  next:
    react: ~18.3.1
```

A package can use `"react": "catalog:"`, `"catalog:default"`, or `"catalog:next"`.
Running `lerna-ci syncdeps react@19.0.0` changes the two YAML ranges to `^19.0.0`
and `~19.0.0` and preserves those references in all package manifests.

- Default, `catalogs.default`, and named catalogs are supported.
- Wildcard targets include catalog-only entries, including entries used by `overrides`.
- Range strategies and `--exact false` operate on the catalog's actual range.
- Check-only leaves both manifests and workspace YAML untouched.
- Version edits preserve comments, quoting, line endings and unrelated pnpm settings.
- Built-in strategies preserve newer pnpm catalog values using `workspace:`, `file:`, or `link:`.

A target applies to matching entries across all catalogs. Catalogs are shared, so
local package filters cannot restrict which consumers receive an updated catalog
entry. Missing entries, recursive references, duplicate default definitions and
invalid YAML fail before writes. Updating YAML anchors, aliases, merges or block
scalars requires manual editing. Run `pnpm install` afterward to update the lockfile.

## CI checks

Choose the versions your repository accepts, rather than querying latest versions
on every pull request. For example, add these scripts to the root `package.json`:

```json
{
  "scripts": {
    "versions:check": "lerna-ci synclocal local --exact false --check-only",
    "deps:check": "lerna-ci syncdeps react@19.0.0 react-dom@19.0.0 --exact false --require-match --check-only"
  }
}
```

Replace the React targets with your repository's policy. Commit `pnpm-lock.yaml`
and pin your existing pnpm version in the root `packageManager` field before using
this GitHub Actions example:

```yaml
name: Workspace versions
on: [pull_request]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run versions:check
      - run: pnpm run deps:check
```

These checks leave manifests and catalogs unchanged. A version mismatch fails the
job; a matching range passes. Dependencies declared through `workspace:*` or
`workspace:^` are preserved because the package manager handles their version expansion.
Synchronization commands fail on registry authentication, network and server errors,
and on complex retained ranges that cannot include the target. Unmatched targets
are reported; `syncdeps --require-match` makes them fail the check as well.

## JSON reports

`syncdeps`, its `syncremote` alias, and `synclocal` accept `--json`:

```sh
pnpm exec lerna-ci syncdeps react@19.0.0 --check-only --require-match --json
```

The command emits one JSON object on stdout, with built-in logs suppressed.
`schemaVersion: 1` includes `changes`, `targets` with their version sources,
`unmatchedTargets`, `skipped` with reasons, and `errors` with codes and messages.
`mode` is `check` or `apply`; inspect `status` to interpret the result:

| Status | Exit code | Meaning |
| --- | --- | --- |
| `unchanged` | 0 | No applicable edits; review any unmatched targets or preserved specifiers |
| `changes-needed` | 1 | Check-only found proposed edits; files remain untouched |
| `applied` | 0 | Planned edits were applied |
| `failed` | 1 | The operation failed; `changes` may contain proposed edits, not completed edits |

Managed specifiers such as `workspace:*`, aliases and `*` are preserved and reported
as skipped. A complex range retained outside the target requires manual editing
or a different `--range` strategy. JSON reporting does not update the lockfile.

## Release preflight

Before a release that applies the same bump type to selected packages:

```sh
pnpm exec lerna-ci canpublish patch
# For the next patch prerelease with a beta identifier:
pnpm exec lerna-ci canpublish prepatch --period beta
```

Run from a Git branch with an `origin` remote and a configured upstream. The
command fetches tags, checks Git conflicts and uncommitted changes, requires the
branch to match its upstream, and checks whether predicted versions already exist
in registry entries or `packageName@version` Git tags. Registry authentication,
network and server failures stop the check; an `E404` means the package is unpublished.

Lerna/Changesets selects changed packages. In a Git workspace without either,
`canpublish` checks all discovered packages. `--check-git false` skips the
uncommitted-files check; conflict and upstream checks still run. `--use-max-version`
also checks local versions against Git/npm versions.

**The command applies one release type to every selected package.** Changesets
provides the package selection, but its per-package release types and planned
`newVersion` values are not consumed. Use this check before the version bump for
uniform releases; mixed Changesets release plans need their own planned-version
validation. Passing this check does not validate publish credentials, packed
artifacts, changelogs, or every requirement of a release pipeline.

## Configuration

Use the root `package.json` field `lerna-ci`:

```json
{
  "lerna-ci": {
    "synclocal": {
      "versionSource": "local",
      "versionRangeStrategy": "retain"
    },
    "syncremote": {
      "react": "19.0.0",
      "react-dom": "19.0.0"
    },
    "fixpack": {
      "config": { "dryRun": true }
    }
  }
}
```

`syncdeps` can run with configured targets, and explicit command targets take
precedence. `synclocal` source/range flags also override configuration. Config files
such as `.lerna-circ.json`, `.lerna-circ.yaml`, and `lerna-ci.config.cjs` are supported.
The legacy `lerna-cli` configuration name remains a fallback; invalid configuration
raises an error.

## Library API

Use the API to embed checks in an existing Node or TypeScript workflow:

```ts
import { EVerSource, syncLocal, syncDeps } from 'lerna-ci'

async function checkVersions() {
  const localChanges = await syncLocal({
    versionSource: EVerSource.LOCAL,
    exact: false,
    checkOnly: true,
  })
  const dependencyChanges = await syncDeps({
    versionMap: { react: '19.0.0', 'react-dom': '19.0.0' },
    exact: false,
    checkOnly: true,
  })
  if (localChanges || dependencyChanges) {
    console.error({ localChanges, dependencyChanges })
    process.exitCode = 1
  }
}

checkVersions().catch(error => { console.error(error); process.exitCode = 1 })
```

Synchronization returns `IChangedPackage[] | false`. A catalog change appears as a
`pnpm-workspace.yaml` item with fields such as `catalog` or `catalogs.next`.
CommonJS `require('lerna-ci')` remains supported; TypeScript declarations are included.
Existing `syncLocal`/`syncDeps` API calls retain lenient registry handling by default;
use `strict: true` for CI checks. The new planning APIs are strict by default:

```ts
import { planSyncDeps } from 'lerna-ci'

async function updateChosenVersion() {
  const plan = await planSyncDeps({ versionMap: { react: '19.0.0' }, requireMatch: true })
  console.log(plan.changes, plan.skipped, plan.unmatchedTargets)
  return plan.apply()
}
```

Planning leaves manifests and catalogs untouched. Application checks that every
input file still matches its snapshot before writing and attempts to restore files
on write errors. This is not a crash-safe transaction; serialize synchronization
with other tools that edit the same files.

[Full API reference](https://github.com/oe/lerna-ci/blob/main/docs/api.md) ·
[Development, compatibility and validation](https://github.com/oe/lerna-ci/blob/main/docs/development.md)

## Choosing a tool

| Need | Consider |
| --- | --- |
| Dependency synchronization, partial-release inspection and scriptable release checks | lerna-ci |
| Dependency consistency rules, exceptions, catalog migration and policy enforcement | [Syncpack](https://github.com/JamieMason/syncpack) |
| Package manifest and internal dependency linting | [Manypkg](https://github.com/Thinkmill/manypkg) |
| Dependency upgrade discovery and interactive selection | [npm-check-updates](https://github.com/raineorshine/npm-check-updates) |
| Release plans, version bumps, changelogs and publishing | [Changesets](https://github.com/changesets/changesets) or [Lerna](https://github.com/lerna/lerna) |

Use lerna-ci alongside the release tool your repository already uses. Choose the
commands needed by your workflow; no migration to a new build system is required.

## Feedback

For a bug or workflow question, [open an issue](https://github.com/oe/lerna-ci/issues)
with the command, expected result, package manager and a small workspace example.
Useful feedback includes whether the check belongs in every pull request, a release
job, or recovery after a failed release.
