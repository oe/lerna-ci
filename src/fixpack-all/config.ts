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
    'scripts'
  ],
  'sortedSubItems': [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'jshintConfig',
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