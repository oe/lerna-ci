/**
 * fixpack
 * created by henrikjoreteg <https://github.com/henrikjoreteg>
 * modified from https://github.com/henrikjoreteg/fixpack:
 *    1. added an option `newline` to config whether add new line on EOF
 *       without new line by default(wthich be the opposite of original repo)
 */
import ALCE from 'alce'
import extend from 'extend-object'
import fs from 'fs'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
import defaultConfig from './config'

function checkMissing (pack, config) {
  var warnItems
  var required
  if (pack.private) {
    warnItems = config.warnOnPrivate
    required = config.requiredOnPrivate
  } else {
    warnItems = config.warn
    required = config.required
  }
  required.forEach(function (key) {
    if (!pack[key]) throw new Error('[lerna-ci] ' + config.filepath + ' must have a ' + key)
  })

  const missedKeys = warnItems.filter((key) => !pack[key])
  if (!config.quiet && missedKeys.length) {
    console.warn(`[lerna-ci] ${config.filepath.replace(process.cwd(), '.')} missing following keys:\n  ${missedKeys.join('\n  ')}`)
  }
  return missedKeys
}

function sortAlphabetically (object) {
  if (Array.isArray(object)) {
    object.sort()
    return object
  } else {
    var sorted = {}
    Object.keys(object).sort().forEach(function (key) {
      sorted[key] = object[key]
    })
    return sorted
  }
}

export default function (filepath, config) {
  config = extend({}, defaultConfig, config || {})
  if (!fs.existsSync(filepath)) {
    if (!config.quiet) console.log('No such file: ' + filepath)
    process.exit(1)
  }
  config.fileName = path.basename(filepath)
  config.filepath = filepath
  var original = fs.readFileSync(filepath, { encoding: 'utf8' })
  var pack = ALCE.parse(original)
  var out = {}
  var outputString = ''
  var key

  // make sure we have everything
  checkMissing(pack, config)

  // handle the specific ones we want, then remove
  config.sortToTop.forEach(function (key) {
    if (pack[key]) out[key] = pack[key]
    delete pack[key]
  })

  // sort the remaining
  pack = sortAlphabetically(pack)

  // add in the sorted ones
  for (key in pack) {
    out[key] = pack[key]
  }

  // sometimes people use a string rather than an array for the `keywords`
  // field when there is only one item listed
  // @ts-ignore
  if (typeof out.keywords === 'string') out.keywords = [out.keywords]

  // sort some sub items alphabetically
  config.sortedSubItems.forEach(function (key) {
    if (out[key]) out[key] = sortAlphabetically(out[key])
  })

  // wipe version numbers
  if (config.wipe) {
    var versionedKeys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    versionedKeys.forEach(function (key) {
      const depGroup = out[key]
      if (depGroup) {
        for (var item in depGroup) {
          depGroup[item] = '*'
        }
      }
    })
  }

  // write it out
  outputString = JSON.stringify(out, null, 2) + (config.newline ? '\n' : '')

  if (outputString !== original) {
    fs.writeFileSync(filepath, outputString, { encoding: 'utf8' })
    return true
  } else {
    return false
  }
}