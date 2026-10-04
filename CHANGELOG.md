# Changelog

## 2.1.0 — 2026-10-04

### Added

- `planSyncDeps` and `planSyncLocal` return proposed changes, target version sources,
  unmatched targets, skipped specifiers and an `apply()` function without rewriting
  manifests during planning. Stale inputs block application; ordinary write errors
  trigger best-effort restoration of attempted writes.
- Synchronization CLI JSON reports (`--json`) with a versioned schema, status and
  error codes. `syncdeps --require-match` rejects unmatched targets.
- Automatic pnpm default and named catalog synchronization. Catalog references remain
  in manifests; version changes go to `pnpm-workspace.yaml` and preserve its comments,
  quoting and line endings. Check-only, explicit/wildcard targets and range strategies
  also work with catalogs. Newer workspace/file/link catalog values are preserved.
- A runtime `EVerSource` enum compatible with isolated TypeScript compilation.
- Quick-start, CI and release-preflight examples, separate API/compatibility references,
  and npm metadata describing pnpm/npm/Yarn support.

### Fixed

- Range containment with `exact: false`, wildcard version overrides, CLI option forwarding,
  configuration precedence. Preserve the API's all-source recovery default and the
  CLI's local-only default; default API calls continue to rewrite satisfying ranges.
- CLI `synclocal --help` and config-only `syncdeps` invocation. Missing targets now
  fail explicitly; existing command targets and the `syncremote` alias remain supported.
- Synchronization computes every edit before writing. A later manifest transform
  failure cannot leave earlier manifests or catalogs already updated.
- CLI synchronization fails on registry lookup errors and incompatible retained
  complex ranges instead of reporting a successful check with incomplete results.
- Fresh workspace manifests, private/keyword filtering and duplicate root packages.
- Literal arguments for internal commands and errors from missing or signal-terminated
  executables. The public `runShellCmd` retains shell execution by default.
- Project root discovery cannot cross a Git repository boundary into an enclosing
  pnpm workspace. Non-catalog workspace settings avoid unrelated YAML alias expansion.
- Git conflict detection, locale-independent upstream comparison, registry failure
  handling and stable-version selection.
- Changesets temporary-file cleanup and concurrent status checks.

### Changed

- Development uses pnpm 10, TypeScript 6, Vite 8, ESLint 10 flat configuration and tsx.
- Workspace scans resolve the root once; registry requests are deduplicated and keep
  at most six requests active. No persistent manifest cache is introduced.
- Catalog editing indexes YAML entries and assembles output once to avoid quadratic
  work when many catalog entries change.
- Compatible runtime dependencies are updated. YAML loads only for pnpm workspace
  operations, and type-only dependencies move out of production dependencies.
- The declared Node minimum now matches the existing documented requirement: >=14.6.
  CommonJS exports, declarations and CLI entry paths remain available.

### Compatibility notes

- Development requires Node 22.13+ within the 22 series, or Node 24+.
- Invalid CLI configuration and empty CLI synchronization targets now fail explicitly.
  Release preflight also blocks unresolved Git conflicts and registry failures that
  the previous release could ignore. These stricter failures are intentional.
- Synchronization CLI and new planning APIs are strict by default. Existing
  `syncLocal`/`syncDeps` API calls keep lenient defaults; `strict: true` opts in.
  Unmatched targets warn by default, and `--require-match` makes them fail.
- Write-error restoration is best effort, not atomic across files or process crashes.
  Synchronization does not update package-manager lockfiles.
- Catalog support activates only in pnpm projects; npm/Yarn keep ordinary synchronization.
  Run the package manager install command after updates to refresh the lockfile.
- Catalog targets apply across matching named catalogs. Shared YAML anchors/aliases,
  merges and block scalars that need updating require manual edits.
- `canpublish` predicts one uniform release type for selected packages. It does not
  validate mixed Changesets release plans or guarantee that publishing will succeed.
- The transitive `braces` advisory
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched
  release. The native scanner bounds pattern nesting; the audit warning remains.

## 2.0.2 — 2024-05-17

Previous published release. Historical changes are available in the
[Git history](https://github.com/oe/lerna-ci/commits/main/).
