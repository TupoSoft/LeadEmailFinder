import { HTMLDomainSynonymFinder } from './domain-synonym-finder'
import { describe, expect, it, jest } from '@jest/globals'
import { Test } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'
import { Logger } from '@nestjs/common'

describe('HTMLSynonymFinder', () => {
    let finder: HTMLDomainSynonymFinder
    let mockedHttpService: jest.Mocked<HttpService>
    let mockedLogger: jest.Mocked<Logger>

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                HTMLDomainSynonymFinder,
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

        finder = moduleRef.get(HTMLDomainSynonymFinder)
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

    it('should return empty array if homepage cannot be fetched', async () => {
        mockedHttpService.get.mockReturnValueOnce(throwError(() => new Error('Network Error')))
        const results = await finder.findSynonymDomains('https://unreachable.com')
        expect(mockedLogger.error).toHaveBeenCalled()
        expect(results).toEqual([])
    })

    it('should return an empty array if badly formatted email', async () => {
        mockedHttpService.get.mockReturnValueOnce(
            of({ data: '<html lang="en"><body> My email is: igor @tuposoft.com</body></html>' } as any),
        )

        const results = await finder.findSynonymDomains('https://fakeurl.com')
        expect(results).toEqual([])
    })
})
