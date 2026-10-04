# Releasing

The current release is 2.1.0. Runtime compatibility and validation are documented in
[development.md](development.md); user-facing changes are in [CHANGELOG.md](../CHANGELOG.md).

1. Update the package version and changelog with the intended release date. Keep
   version, documentation and packed metadata consistent.
2. Use Node 24 and the pinned pnpm version. Run `pnpm install --frozen-lockfile`,
   `pnpm test:package`, and `pnpm test:catalog`. Inspect the packed manifest, README,
   CHANGELOG, declarations, executable CLI and runtime dependencies.
3. Require the Linux/Windows runtime matrix and latest-pnpm catalog integration to
   pass on the final PR commit. Merge with a commit title starting with
   `chore: release lerna-ci `, followed by the release version.
4. Fetch and check out the merged main commit. Rebuild the tarball from that clean
   commit, verify it in an isolated consumer, and preview publication with
   `npm publish ./pack.tgz --dry-run`. Use the intended npm account and registry.
5. Publish that exact validated tarball with `npm publish ./pack.tgz --tag latest`.
   Verify the registry version, dist-tag, integrity, README and metadata.
6. The main CI workflow creates `v<version>` and the GitHub Release after its tests
   pass and npm confirms the version exists. Release notes come from the corresponding
   changelog section. It uses the repository's Actions identity and does not publish
   to npm or need an npm token. Check this job and the resulting tag/release.

Do not commit npm credentials. Supply them through the environment or the normal
package-manager credential configuration. `lerna-ci canpublish` checks managed
workspace releases; it does not replace this package's tarball/consumer validation.
