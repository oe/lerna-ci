import semver from 'semver'

console.log(semver.inc('a1.23.3-alpha.2', 'prerelease', 'alpha'))