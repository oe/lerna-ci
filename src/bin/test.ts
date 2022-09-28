import semver from 'semver'

console.log(semver.inc('a1.23.3-alpha.2', 'prerelease', 'alpha'))
console.log(new semver.Range('workspace:*'))
console.log(new semver.Range('12.3.2 ~ 13.0.0'))
const range = new semver.Range('12')
console.log(range, range.set[0][0])