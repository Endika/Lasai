import { describe, it, expect } from 'vitest'
import { appVersion } from '@/shared/appVersion'

describe('appVersion', () => {
  it('is a non-empty version string', () => {
    expect(typeof appVersion).toBe('string')
    expect(appVersion.length).toBeGreaterThan(0)
  })
})
