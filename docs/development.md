# Development and compatibility

Development uses pnpm 10, TypeScript 6, Vite 8, ESLint 10 with flat configuration,
and tsx. Use Node 22.13+ in the Node 22 series or Node 24+ for development; the
published library and CLI still support Node >=14.6. `.node-version` selects Node 24.

```sh
pnpm install --frozen-lockfile
pnpm build          # CommonJS modules, declarations, executable CLI
pnpm dev:build      # Vite watch mode
pnpm typecheck     # source and tooling configuration types
pnpm test          # lint, tooling types, build, offline regressions
pnpm test:package  # pack, isolated consumer, imports, CLI, public types
pnpm test:catalog  # real pnpm catalogs, frozen install, and publishing conversion
```

Install or activate the version pinned in `packageManager` before running these
commands. Node 24 distributions may need Corepack installed separately; using an
existing pnpm installation is also supported.

Vite preserves the existing `dist/index.js`, `dist/index.d.ts`, CLI entry point,
and module paths. Runtime dependencies stay external. The version-source enum is available at runtime
and its declarations work with `isolatedModules` (including Vite consumers). `tsc` emits declarations
and checks source types; Vite handles JavaScript. `prepack` validates lint and
tooling types before building, and the `files` allowlist publishes only `dist`
plus npm's standard manifest, README, license, and CHANGELOG files. pnpm pins its own version
and stores reproducible dependency resolution in `pnpm-lock.yaml`.

The regression suite uses temporary workspaces and mocked registry processes.
Package tests install the tarball into a separate consumer and verify CommonJS,
native ESM imports, the installed CLI, TypeScript usage, and the regression suite.
CI covers Node 14.6 (the minimum runtime), 22, and 24, plus Windows on Node 22;
modern build tools run on Node 22 before switching to the legacy runtime.
The catalog integration suite also exercises the current latest pnpm release.

See the [release procedure](releasing.md) for the prepared 2.1.0 release.

Workspace scans resolve the project root once per operation and continue to read
fresh manifests. Unlike 2.0.2, repeated scans do not return a permanently cached
package list: this fixes stale versions and working-directory changes, but adds
I/O to repeated API calls. A local comparison against the actual published 2.0.2
tarball (51 packages, 12 fresh processes per version) measured median first scans
of 81 ms versus 69 ms and repeated scans of 0.009 ms versus 24 ms. The old repeated
scan returned stale data after a manifest edit; the new scan returned the updated
version. Median module loading was 141 ms versus 151 ms; RSS after these scans was
45 MiB versus 53 MiB. These are host-specific observations, not performance guarantees.
The earlier 28.8 ms versus 9.7 ms measurement compared two intermediate development
versions and should not be interpreted as a speedup over published 2.0.2.
Catalog edits index YAML entries once and assemble the updated file once.
A synthetic 10,000-entry update plan fell from 3.57 seconds to 68 ms after this
review (five measured runs after warmup); this excludes YAML parsing and file I/O.
Registry lookups deduplicate
package names and keep up to six requests active without waiting for an entire
batch, while preserving result order. Explicit wildcard version overrides also
avoid redundant registry requests.

Runtime `cosmiconfig` and `find-packages` are updated to compatible releases;
TypeScript-only dependencies are development dependencies, and Node's filesystem
APIs replace rimraf. Newer ESM-only or higher-Node versions of detect-indent and
yargs are intentionally deferred to preserve CommonJS and Node 14.6 support.

The `--exact false` option preserves an existing dependency range when it contains
the target version or target range. Explicit range strategies such as `--range '~'`
also apply to existing caret and tilde dependencies. Protocols such as `workspace:*`,
`file:`, and npm aliases are preserved.

`canpublish` blocks unresolved Git conflicts even with `--check-git false`, compares
upstream revision counts independently of Git's display language, and stops if the
registry request fails with an authentication, network, or server error. A missing
package (`E404`) is treated as unpublished. General registry lookups retain their
warning-and-undefined behavior; API callers can opt into errors with `throwOnError: true`.

Synchronization CLI commands and new planning APIs use strict registry handling;
legacy `syncLocal`/`syncDeps` calls remain lenient unless `strict: true` is supplied.
Planning snapshots manifests before registry/Git lookups, computes each transform once,
and reports target sources, unmatched requests and preserved specifiers. Application
checks all captured input bytes before writing and restores attempted writes on ordinary
I/O errors where possible. It does not provide crash-safe multi-file transactions or
lockfile updates. Snapshot strings and proposed output consume memory proportional to
workspace manifest/catalog size; applying a plan adds one input verification read per
file, without a persistent cache or repeated registry lookups.
A separate local check-only comparison against the preceding maintenance commit
(200 packages, 30 dependencies each, ten measured iterations after two warmups)
measured medians of 34.9 ms before versus 46.5 ms after for no edits, and 31.7 ms
versus 42.9 ms for proposed edits. These are synthetic, offline results: planning
and richer reports add work, so this change does not claim an overall speedup.

CLI `--json` suppresses built-in logs and outputs one versioned synchronization report.
Configuration files and custom callbacks are user code; their own console output is
not suppressed. Tests cover strict/legacy differences, stale plans, partial write
restoration, catalog/manifest transform failures, JSON errors and parser failures.

CLI configuration uses the documented `lerna-ci` name. Existing `lerna-cli` files
and package fields remain supported as a fallback. Invalid configuration now raises
an error. `synclocal` CLI flags override configured source and range values.
The API's `syncLocal()` still defaults to `all`, while the CLI defaults to `local`.
`runShellCmd` retains shell execution by default; internal Git/package-manager
commands explicitly pass `shell: false` so names and paths remain literal arguments.

Workspace discovery reads fresh manifests on each call and includes the root
package once. Yarn Classic object-form workspaces (`{ "packages": [...] }`) are
supported. `changed` requires Lerna or Changesets; npm/pnpm/Yarn workspaces alone
do not provide change detection. Remote tag synchronization expects an `origin`
remote, and publish checks require a configured upstream branch.

The native workspace scanner limits brace/parenthesis pattern nesting to 32 to
mitigate [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The transitive `braces` package still has no patched release, so dependency audits
continue to report this advisory. Replace or upgrade that dependency when a fix
becomes available; the guard applies to the native scanner's input, not other tools.

## Migration from 0.0.x

The default fixpack configuration and several API names changed before 2.0.
Restore the [legacy fixpack configuration](https://github.com/oe/lerna-ci/blob/legacy/src/fixpack/config.ts)
through the `fixpack.config` option if needed, and use the [API reference](api.md)
to update old calls. This maintenance release preserves the 2.0.2 public exports.
