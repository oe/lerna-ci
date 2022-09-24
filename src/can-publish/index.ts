import { getAllPackageDigests, EVerSource } from '../common'
import { syncLocal } from '../sync-local'

export async function canPublish(options: { versionType: string; noPrivate: boolean }) {
  if (options.versionType !== 'alpha') {
    const result = await syncLocal({
      versionRangeStrategy: 'retain',
      versionSource: EVerSource.ALL,
      checkOnly: true
    })
    if (result.length) {
      throw new Error('local packages version are not synced to the latest')
    }
    return true
  }
  const pkgs = await getAllPackageDigests()
}
