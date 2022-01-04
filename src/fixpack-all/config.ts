/**
 * default configuration for fixpack
 *  see https://github.com/HenrikJoreteg/fixpack#configuration for details
 */

export default {
  'files': [
    'package.json'
  ],
  'quiet': false,
  'required': [
    'name',
    'version'
  ],
  'requiredOnPrivate': [],
  'sortToTop': [
    'name',
    'version',
    'description',
    'private',
    'author',
    'homepage',
    'repository',
    'main',
    'module',
    'exports',
    'types',
    'typings',
    'bin',
    'files',
    'scripts',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ],
  'sortedSubItems': [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'keywords',
  ],
  'warn': [
    'description',
    'author',
    'repository',
    'main',
    'license'
  ],
  'warnOnPrivate': [
    'name',
    'version',
    'description',
    'main'
  ],
  'dryRun': false,
  'wipe': false,
  'indent': null,
  'newLine': null,
  'finalNewLine': null
}