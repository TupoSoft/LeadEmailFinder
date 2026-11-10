import { describe, expect, it } from 'vitest'
import { formatCredits } from './format-billing'

describe('billing presentation contracts', () => {
    it('formats credit balances', () => {
        expect(formatCredits(12500)).toBe('12,500')
    })
})
