import { describe, expect, it } from 'vitest'

import { linkedinHref } from './urls'

describe('linkedinHref', () => {
  it('allows linkedin.com paths', () => {
    expect(linkedinHref('linkedin.com/in/foo')).toBe('https://linkedin.com/in/foo')
  })

  it('rejects non-LinkedIn hosts', () => {
    expect(linkedinHref('https://evil.com/phish')).toBeNull()
  })

  it('returns null for empty', () => {
    expect(linkedinHref('')).toBeNull()
    expect(linkedinHref(null)).toBeNull()
  })
})
