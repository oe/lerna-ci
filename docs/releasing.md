# Preparing a release

The next version is 2.1.0. `package.json` and `CHANGELOG.md` describe the prepared
release; the current npm version remains 2.0.2 until publication.

1. Review and merge the maintenance PR. Require the Linux/Windows runtime matrix
   and latest-pnpm catalog integration to pass on the final commit.
2. Change the 2.1.0 changelog heading from Unreleased to the actual release date,
   remove its unpublished-status paragraph, and remove the upcoming-release note
   from the README. Commit these final release-status edits.
3. Use Node 24 and the pinned pnpm version. Run `pnpm install --frozen-lockfile`,
   `pnpm test:package`, and `pnpm test:catalog`.
4. Inspect the packed manifest, README, CHANGELOG, declarations, executable CLI,
   and runtime dependencies. `test:package` already installs the tarball into an
   isolated consumer and checks public exports, types, CLI and regressions.
5. Preview publication with `pnpm publish --dry-run`. Verify the intended npm
   account/registry and release version before publishing the reviewed artifact.
6. Publish 2.1.0 using the project's npm release process, then verify npm's version,
   README, description, keywords, homepage, and issue link. Create matching Git tag
   and release notes through the repository's release process.

This file is a release procedure; no npm publication is performed by creating it.
`lerna-ci canpublish` is intended for managed workspace releases and is not a
substitute for this package's tarball/consumer validation.
