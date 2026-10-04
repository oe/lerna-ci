import { getRepoNpmClient, logger, setConfig } from '../common'
import { ISyncPlan, ISyncReport, validateSyncPlan } from '../common/sync-plan'
import { printChangedPackageJsons } from './pretty-print'
import { CLI_NAME } from './config'

interface ISyncCliOptions {
  json?: boolean
  checkOnly?: boolean
  requireMatch?: boolean
}

/** Also recognize JSON requests when parsing fails before a command handler runs. */
export function wantsJson(args: string[]) {
  let enabled = false
  for (let index = 0; index < args.length && args[index] !== '--'; index++) {
    if (args[index] === '--no-json' || args[index] === '--json=false') enabled = false
    else if (args[index] === '--json=true') enabled = true
    else if (args[index] === '--json') enabled = args[index + 1] !== 'false'
  }
  return enabled
}

function emptyReport(command: string, checkOnly?: boolean): ISyncReport {
  return {
    schemaVersion: 1, command: command === 'syncremote' ? 'syncdeps' : command,
    mode: checkOnly ? 'check' : 'apply', status: 'failed', changes: [], targets: [], unmatchedTargets: [], skipped: [], errors: [],
  }
}

export function printSyncFailure(error: unknown, report: ISyncReport, json: boolean) {
  report.status = 'failed'
  report.errors = [{
    code: error && typeof error === 'object' && 'type' in error ? String(error.type) : 'operation-failed',
    message: error instanceof Error ? error.message : String(error),
  }]
  if (json) console.log(JSON.stringify(report))
  else console.error(report.errors[0].message)
  process.exitCode = 1
}

export function printParseFailure(error: unknown, args: string[]) {
  const command = args.find(arg => ['synclocal', 'syncdeps', 'syncremote', 'changed', 'fixpack', 'canpublish'].includes(arg)) || ''
  let checkOnly = false
  for (let index = 0; index < args.length && args[index] !== '--'; index++) {
    const arg = args[index]
    if (arg === '--check-only' || arg === '-c') checkOnly = args[index + 1] !== 'false'
    else if (arg === '--check-only=true' || arg === '-c=true') checkOnly = true
    else if (arg === '--check-only=false' || arg === '--no-check-only' || arg === '-c=false') checkOnly = false
  }
  printSyncFailure(error, emptyReport(command, checkOnly), wantsJson(args))
}

export async function runSyncCommand(command: 'synclocal' | 'syncdeps', argv: ISyncCliOptions, buildPlan: () => Promise<ISyncPlan>) {
  const json = !!argv.json
  setConfig({ debug: !json })
  const report = emptyReport(command, argv.checkOnly)
  try {
    logger.log(`[${CLI_NAME}][${command}] ${argv.checkOnly ? 'check synchronization' : 'try to synchronize dependencies'}`)
    const plan = await buildPlan()
    Object.assign(report, { changes: plan.changes, targets: plan.targets, unmatchedTargets: plan.unmatchedTargets, skipped: plan.skipped })
    validateSyncPlan(plan, true, argv.requireMatch)
    const client = !json && !argv.checkOnly && plan.changes.length ? await getRepoNpmClient() : undefined
    if (!argv.checkOnly) plan.apply()
    report.status = plan.changes.length ? argv.checkOnly ? 'changes-needed' : 'applied' : 'unchanged'
    process.exitCode = report.status === 'changes-needed' ? 1 : 0
    if (json) {
      console.log(JSON.stringify(report))
      return
    }
    if (plan.unmatchedTargets.length) logger.warn(`[${CLI_NAME}][${command}] unmatched targets: ${plan.unmatchedTargets.join(', ')}`)
    if (plan.skipped.length) logger.warn(`[${CLI_NAME}][${command}] skipped ${plan.skipped.length} dependencies; preserved managed specifiers or unchanged transforms`)
    if (plan.changes.length) {
      logger.log(`[${CLI_NAME}][${command}] the following manifests ${argv.checkOnly ? 'can be updated' : 'are updated'}:`)
      await printChangedPackageJsons(plan.changes)
      if (!argv.checkOnly) {
        logger.log(`[${CLI_NAME}][${command}] you may need run \`${/^yarn/.test(client!) ? 'yarn' : client} install\` to make changes take effect`)
      }
    } else {
      logger.success(`[${CLI_NAME}][${command}] ${plan.unmatchedTargets.length || plan.skipped.length ? 'no applicable updates; review skipped and unmatched targets' : 'all dependencies are up to date, nothing touched'}`)
    }
  } catch (error) {
    printSyncFailure(error, report, json)
  }
}
