import { describe, expect, it } from 'vitest'
import { tombstoneCutoff } from '../src/jobs/scheduled'
describe('scheduled maintenance', () => {
  it('retains tombstones newer than ninety days', () => expect(tombstoneCutoff(new Date('2026-09-21T00:00:00Z'))).toBe('2026-06-23T00:00:00.000Z'))
})
