import { extractDomains, findRelevantLinks } from './domain-synonym-parser'

describe('domain synonym parsing', () => {
    describe('extractDomains', () => {
        it('normalizes known email domains while preserving subdomains, occurrence order, and duplicates', () => {
            const html = `
                <p>first@EXAMPLE.COM second@sub.example.org third@shop.example.co.uk first@example.com</p>
            `

            expect(extractDomains(html)).toEqual([
                'example.com',
                'sub.example.org',
                'shop.example.co.uk',
                'example.com',
            ])
        })

        it.each([
            '',
            '<p>No email addresses here</p>',
            '<p>broken @example.com address@localhost address@host.invalid address@-example.com</p>',
        ])('returns no domains when supplied text has no matching valid ICANN domains: %s', html => {
            expect(extractDomains(html)).toEqual([])
        })

        it('extracts supplied source text without requiring well-formed HTML', () => {
            expect(extractDomains('<p>hello+sales@example.com <a href="mailto:support@example.org"')).toEqual([
                'example.com',
                'example.org',
            ])
        })
    })

    describe('findRelevantLinks', () => {
        it('matches visible contact/privacy text, resolves URLs, and deduplicates in document order', () => {
            const html = `
                <a href="/contact">CONTACT us</a>
                <a href="https://example.com/contact"><span>Contact</span></a>
                <a href="../privacy?locale=en#policy">Privacy policy</a>
                <a href="//other.example.org/support">Contact partner</a>
                <a href="/privacy-hidden">Other information</a>
                <a>Contact with no URL</a>
            `

            expect(findRelevantLinks(html, 'https://example.com/company/about')).toEqual([
                'https://example.com/contact',
                'https://example.com/privacy?locale=en#policy',
                'https://other.example.org/support',
            ])
        })

        it('accepts incomplete HTML without introducing fallback links', () => {
            expect(findRelevantLinks('<a href=/contact>Contact', 'https://example.com')).toEqual([
                'https://example.com/contact',
            ])
            expect(findRelevantLinks('<p>No links</p>', 'https://example.com')).toEqual([])
        })

        it('preserves invalid URL rejection so the adapter can map it to the existing empty outcome', () => {
            expect(() => findRelevantLinks('<a href="/contact">Contact</a>', 'invalid URL')).toThrow('Invalid URL')
            expect(() => findRelevantLinks('<a href="http://[malformed">Contact</a>', 'https://example.com')).toThrow(
                'Invalid URL',
            )
        })
    })
})
