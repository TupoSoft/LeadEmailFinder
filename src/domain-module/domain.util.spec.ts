import { extractDomains, findRelevantLinks } from './domain.util'

describe('DomainUtil', () => {
    describe('findRelevantLinks', () => {
        it('should extract relevant links containing "contact" or "privacy" from the HTML', () => {
            const html = `
            <a href="/contact-us">Contact Us</a>
            <a href="/privacy-policy">Privacy Policy</a>
            <a href="/about">About Us</a>
        `
            const baseUrl = 'https://example.com'
            const result = findRelevantLinks(html, baseUrl)
            expect(result).toEqual(['https://example.com/contact-us', 'https://example.com/privacy-policy'])
        })

        it('should return an empty array if no relevant links are found', () => {
            const html = `
            <a href="/about">About Us</a>
            <a href="/services">Services</a>
        `
            const baseUrl = 'https://example.com'
            const result = findRelevantLinks(html, baseUrl)
            expect(result).toEqual([])
        })

        it('should handle absolute links correctly', () => {
            const html = `
            <a href="https://another-site.com/contact">Contact Us</a>
            <a href="/privacy">Privacy Policy</a>
        `
            const baseUrl = 'https://example.com'
            const result = findRelevantLinks(html, baseUrl)
            expect(result).toEqual(['https://another-site.com/contact', 'https://example.com/privacy'])
        })

        it('should remove duplicate links from the result', () => {
            const html = `
            <a href="/contact">Contact Us</a>
            <a href="/contact">Contact</a>
        `
            const baseUrl = 'https://example.com'
            const result = findRelevantLinks(html, baseUrl)
            expect(result).toEqual(['https://example.com/contact'])
        })

        it('should correctly normalize and combine relative links with the base URL', () => {
            const html = `
            <a href="./contact">Contact</a>
            <a href="../privacy">Privacy</a>
        `
            const baseUrl = 'https://example.com/subdir/page'
            const result = findRelevantLinks(html, baseUrl)
            expect(result).toEqual(['https://example.com/subdir/contact', 'https://example.com/privacy'])
        })

        it.todo('should handle invalid URLs gracefully and filter them out')
    })

    describe('extractDomains', () => {
        it('should extract valid domains from a given HTML string', () => {
            const html = 'Contact us at john.doe@example.com or jane.smith@test.org.'
            const result = extractDomains(html)
            expect(result).toEqual(['example.com', 'test.org'])
        })

        it('should return an empty array if no valid email domains are found', () => {
            const html = 'No emails in this text.'
            const result = extractDomains(html)
            expect(result).toEqual([])
        })

        it('should ignore invalid email formats in the HTML string', () => {
            const html = 'Invalid email formats: user@@example.com, user@.org'
            const result = extractDomains(html)
            expect(result).toEqual([])
        })

        it('should return domains in lowercase regardless of their original case', () => {
            const html = 'Contact at USER@Example.COM.'
            const result = extractDomains(html)
            expect(result).toEqual(['example.com'])
        })

        it('should handle multiple emails with the same domain gracefully', () => {
            const html = 'Emails: one@test.com, two@test.com, three@test.com'
            const result = extractDomains(html)
            expect(result).toEqual(['test.com', 'test.com', 'test.com'])
        })
    })
})
