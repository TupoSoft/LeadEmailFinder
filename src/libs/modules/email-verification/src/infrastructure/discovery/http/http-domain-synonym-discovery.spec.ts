import { HttpDomainSynonymDiscovery } from './http-domain-synonym-discovery'
import { Test } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { of, Subject, throwError } from 'rxjs'
import { Logger } from '@nestjs/common'

describe('HttpDomainSynonymDiscovery', () => {
    let finder: HttpDomainSynonymDiscovery
    let mockedHttpService: jest.Mocked<HttpService>
    let mockedLogger: jest.Mocked<Logger>

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                HttpDomainSynonymDiscovery,
                {
                    provide: HttpService,
                    useValue: {
                        get: jest.fn(),
                    },
                },
                {
                    provide: Logger,
                    useValue: {
                        error: jest.fn(),
                    },
                },
            ],
        }).compile()

        finder = moduleRef.get(HttpDomainSynonymDiscovery)
        mockedHttpService = moduleRef.get(HttpService)
        mockedLogger = moduleRef.get(Logger)
    })

    beforeEach(() => {
        jest.resetAllMocks()
    })

    it('should return an empty array if homepage has no emails', async () => {
        mockedHttpService.get.mockReturnValueOnce(
            of({ data: '<html lang="en"><body>No emails here</body></html>' }) as any,
        )

        const results = await finder.findSynonymDomains('https://fakeurl.com')
        expect(results).toEqual([])
    })

    it('should return domains from homepage if found', async () => {
        const expectedLength = 1
        mockedHttpService.get.mockReturnValueOnce(
            of({ data: '<html lang="en"><body>Email me at hello@gmail.com</body></html>' } as any),
        )
        mockedHttpService.get.mockReturnValueOnce(
            of({ data: '<html lang="en"><body>No more emails</body></html>' } as any),
        )

        const results = await finder.findSynonymDomains('https://fakeurl.com')
        expect(results).toContain('gmail.com')
        expect(results.length).toBe(expectedLength)
    })

    it('should follow contact and privacy links and parse them too', async () => {
        const expectedLength = 3

        mockedHttpService.get.mockReturnValueOnce(
            of({
                data: `
            <html lang="en">
                <body>
                    <a href="/contact">Contact</a>
                    <a href="/privacy-policy">Privacy</a>
                    <p>Homepage email: user1@example.com</p>
                </body>
            </html>
        `,
            } as any),
        )

        mockedHttpService.get.mockReturnValueOnce(
            of({
                data: `
            <html lang="en">
                <body>
                    <p>Contact page email: support@example.org</p>
                </body>
            </html>
        `,
            } as any),
        )

        mockedHttpService.get.mockReturnValueOnce(
            of({
                data: `
            <html lang="en">
                <body>
                    <p>Privacy page email: privacy@example.net</p>
                </body>
            </html>
        `,
            } as any),
        )

        const results = await finder.findSynonymDomains('https://fakeurl.com')
        expect(results).toEqual(expect.arrayContaining(['example.com', 'example.org', 'example.net']))
        expect(results.length).toBe(expectedLength)
    })

    it('should return empty array without logging the domain or remote error if the homepage cannot be fetched', async () => {
        const sentinel = 'unique-person@private.example'
        const remoteError = new Error(`Network error for ${sentinel}`)
        Object.defineProperty(remoteError, 'constructor', { value: { name: sentinel } })
        mockedHttpService.get.mockReturnValueOnce(throwError(() => remoteError))

        const results = await finder.findSynonymDomains(`https://${sentinel}`)

        expect(mockedLogger.error).toHaveBeenCalledWith('domain_synonym_fetch_failed', { errorClass: 'Error' })
        expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain(sentinel)
        expect(results).toEqual([])
    })

    it('should return an empty array if badly formatted email', async () => {
        mockedHttpService.get.mockReturnValueOnce(
            of({ data: '<html lang="en"><body> My email is: igor @tuposoft.com</body></html>' } as any),
        )

        const results = await finder.findSynonymDomains('https://fakeurl.com')
        expect(results).toEqual([])
    })

    it.each([null, 123, { html: 'person@example.com' }, ['person@example.com']])(
        'returns the existing empty outcome for a non-text homepage without exposing its body',
        async data => {
            mockedHttpService.get.mockReturnValueOnce(of({ data } as any))

            await expect(finder.findSynonymDomains('https://example.com')).resolves.toEqual([])
            expect(mockedHttpService.get).toHaveBeenCalledTimes(1)
            expect(mockedLogger.error).toHaveBeenCalledWith('domain_synonym_fetch_failed', { errorClass: 'Error' })
            expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain('person@example.com')
        },
    )

    it('retains home and successful child results while ignoring rejected and malformed children', async () => {
        mockedHttpService.get
            .mockReturnValueOnce(
                of({
                    data: `home@example.com
                        <a href="/contact">Contact</a>
                        <a href="/privacy">Privacy</a>
                        <a href="/privacy-json">Privacy details</a>`,
                } as any),
            )
            .mockReturnValueOnce(
                of({ data: 'contact@example.org <a href="/nested-contact">Contact further</a>' } as any),
            )
            .mockReturnValueOnce(throwError(() => new Error('sensitive external message')))
            .mockReturnValueOnce(of({ data: { content: 'person@example.net' } } as any))

        await expect(finder.findSynonymDomains('https://example.com')).resolves.toEqual(['example.com', 'example.org'])
        expect(mockedHttpService.get.mock.calls).toEqual([
            ['https://example.com'],
            ['https://example.com/contact'],
            ['https://example.com/privacy'],
            ['https://example.com/privacy-json'],
        ])
        expect(mockedLogger.error).not.toHaveBeenCalled()
    })

    it('requests each unique link once and deduplicates domains across pages', async () => {
        mockedHttpService.get
            .mockReturnValueOnce(
                of({
                    data: `first@example.com second@example.com
                        <a href="/contact">Contact</a>
                        <a href="https://example.com/contact">Contact again</a>`,
                } as any),
            )
            .mockReturnValueOnce(of({ data: 'first@example.org second@EXAMPLE.COM third@example.org' } as any))

        await expect(finder.findSynonymDomains('https://example.com')).resolves.toEqual(['example.com', 'example.org'])
        expect(mockedHttpService.get).toHaveBeenCalledTimes(2)
    })

    it('preserves document order when child responses complete in the opposite order', async () => {
        const contact = new Subject<any>()
        const privacy = new Subject<any>()
        mockedHttpService.get
            .mockReturnValueOnce(
                of({
                    data: `first@example.com
                        <a href="/contact">Contact</a>
                        <a href="/privacy">Privacy</a>`,
                } as any),
            )
            .mockReturnValueOnce(contact)
            .mockReturnValueOnce(privacy)

        const result = finder.findSynonymDomains('https://example.com')
        await Promise.resolve()
        await Promise.resolve()
        privacy.next({ data: 'person@example.net' })
        contact.next({ data: 'person@example.org' })

        await expect(result).resolves.toEqual(['example.com', 'example.org', 'example.net'])
    })

    it('preserves the empty result when a relevant URL is invalid even if the homepage contains a domain', async () => {
        mockedHttpService.get.mockReturnValueOnce(
            of({ data: 'first@example.com <a href="http://[malformed">Contact</a>' } as any),
        )

        await expect(finder.findSynonymDomains('https://example.com')).resolves.toEqual([])
        expect(mockedHttpService.get).toHaveBeenCalledTimes(1)
        expect(mockedLogger.error).toHaveBeenCalledWith('domain_synonym_fetch_failed', {
            errorClass: expect.stringMatching(/^(TypeError|UnknownError)$/),
        })
        expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain('http://[malformed')
    })
})
