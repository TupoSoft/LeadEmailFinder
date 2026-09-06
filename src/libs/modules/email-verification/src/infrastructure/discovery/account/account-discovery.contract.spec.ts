import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import {
    MicrosoftGetCredentialType,
    MicrosoftLogin,
    MimecastLogin,
    OfficeApps,
} from '@tuposoft/lead-email-finder/catch-all'
import { Observable, of, Subject, throwError } from 'rxjs'
import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
    AccountDiscoveryApprovalView,
    AccountDiscoveryProviderName,
    Clock,
} from '../../../application/account-discovery/approved-account-discovery-verifier'
import { AccountDiscovery } from '../../../application/ports/account-discovery'
import { AccountDiscoveryProviderAdapters, composeAccountDiscovery } from './account-discovery-composition'

const providers = [
    ['microsoft_get_credential_type', 'microsoft_4'],
    ['microsoft_login', 'microsoft_1'],
    ['mimecast', 'mimecast'],
    ['office_apps', 'microsoft_2'],
] as const
const NOW = new Date('2026-09-02T10:30:00Z')
const clock: Clock = { now: () => NOW }

interface AccountDiscoveryFixture {
    requests: {
        get: jest.Mock<Observable<unknown>, [string]>
        post: jest.Mock<Observable<unknown>, [string, unknown, unknown]>
    }
    logger: { debug: jest.Mock }
    adapters: AccountDiscoveryProviderAdapters
    approval: AccountDiscoveryApprovalView
    selected: AccountDiscovery
}

function fixture(
    provider: AccountDiscoveryProviderName,
    region = 'us',
    injectedClock = clock,
): AccountDiscoveryFixture {
    const requests = {
        get: jest.fn<Observable<unknown>, [string]>(),
        post: jest.fn<Observable<unknown>, [string, unknown, unknown]>(),
    }
    const logger = { debug: jest.fn() }
    const http = requests as unknown as HttpService
    const log = logger as unknown as Logger
    const adapters = {
        microsoftGetCredentialType: new MicrosoftGetCredentialType(log, http),
        microsoftLogin: new MicrosoftLogin(http),
        mimecastLogin: new MimecastLogin(log, http),
        officeApps: new OfficeApps(log, http),
    }
    const approval: AccountDiscoveryApprovalView = {
        id: 'contract-approval',
        provider,
        purpose: ACCOUNT_DISCOVERY_PURPOSE,
        status: 'active',
        region,
        effectiveAt: '2026-09-02T10:00:00Z',
        expiresAt: '2026-09-02T11:00:00Z',
    }
    const configuration = {
        CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080',
        CATCH_ALL_PROVIDER: provider,
        CATCH_ALL_PROVIDER_APPROVAL_ID: approval.id,
        CATCH_ALL_PROVIDER_REGION: region,
    }
    const selected = composeAccountDiscovery(configuration, [approval], adapters, injectedClock)!

    return { requests, logger, adapters, approval, selected }
}

function response(provider: AccountDiscoveryProviderName, exists: boolean): Observable<unknown> {
    switch (provider) {
        case 'microsoft_get_credential_type':
            return of({ data: { IfExistsResult: exists ? 0 : 10 } })
        case 'microsoft_login':
            return exists ? throwError(() => ({ response: { data: { error_codes: [50126] } } })) : of({ data: {} })
        case 'mimecast':
            return of({ data: { data: [{ authenticate: exists ? ['Basic-Ad'] : ['Other'] }] } })
        case 'office_apps':
            return of({ data: exists ? 'OrgId' : 'Neither' })
    }
}

describe('configured account discovery adapter contract', () => {
    it('makes zero provider requests with no selected provider, including with a proxy', () => {
        const { requests, adapters } = fixture('office_apps')

        expect(composeAccountDiscovery({}, [], adapters, clock)).toBeUndefined()
        expect(
            composeAccountDiscovery({ CATCH_ALL_HTTP_PROXY_URL: 'http://proxy.example:8080' }, [], adapters, clock),
        ).toBeUndefined()
        expect(requests.get).not.toHaveBeenCalled()
        expect(requests.post).not.toHaveBeenCalled()
    })

    describe.each(providers)('%s', (provider, sourceName) => {
        it.each([true, false])('preserves the %s result and source after exactly one request', async exists => {
            const { selected, requests } = fixture(provider)
            requests.get.mockReturnValue(response(provider, exists))
            requests.post.mockReturnValue(response(provider, exists))

            expect(selected.sourceName).toBe(sourceName)
            await expect(selected.verify('contract@example.test')).resolves.toBe(exists)
            expect(requests.get.mock.calls.length + requests.post.mock.calls.length).toBe(1)
        })

        it('does not disclose another address when the approval expires after startup', async () => {
            let now = NOW
            const { selected, requests } = fixture(provider, 'us', { now: () => now })
            requests.get.mockReturnValue(response(provider, true))
            requests.post.mockReturnValue(response(provider, true))

            await expect(selected.verify('first@example.test')).resolves.toBe(true)
            now = new Date('2026-09-02T11:00:00Z')
            await expect(selected.verify('second@example.test')).rejects.toThrow(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)
            expect(requests.get.mock.calls.length + requests.post.mock.calls.length).toBe(1)
            expect(JSON.stringify([...requests.get.mock.calls, ...requests.post.mock.calls])).not.toContain(
                'second@example.test',
            )
        })

        it('keeps concurrent address-bearing requests isolated when responses arrive out of order', async () => {
            const { selected, requests } = fixture(provider)
            const firstResponse = new Subject<unknown>()
            const secondResponse = new Subject<unknown>()
            const request = provider === 'office_apps' ? requests.get : requests.post
            request.mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse)

            const first = selected.verify('first@example.test')
            const second = selected.verify('second@example.test')
            const firstRequest: readonly unknown[] = request.mock.calls[0]
            const secondRequest: readonly unknown[] = request.mock.calls[1]

            expect(JSON.stringify(firstRequest)).toContain('first@example.test')
            expect(JSON.stringify(firstRequest)).not.toContain('second@example.test')
            expect(JSON.stringify(secondRequest)).toContain('second@example.test')
            expect(JSON.stringify(secondRequest)).not.toContain('first@example.test')
            if (provider !== 'office_apps') expect(firstRequest[1]).not.toBe(secondRequest[1])

            response(provider, false).subscribe(secondResponse)
            response(provider, true).subscribe(firstResponse)

            await expect(Promise.all([first, second])).resolves.toEqual([true, false])
            expect(requests.get.mock.calls.length + requests.post.mock.calls.length).toBe(2)
        })

        it.each(['ECONNRESET', 'ECONNABORTED'])(
            'maps %s transport failures to false without logging sentinels or dispatching a fallback',
            async code => {
                const { selected, requests, logger } = fixture(provider)
                const email = 'provider-sentinel@example.test'
                const credential = 'credential-sentinel'
                const externalMessage = `Provider echoed ${email} ${encodeURIComponent(email)} ${credential}`
                const failure = Object.assign(new Error(externalMessage), {
                    code,
                    config: { url: `https://provider.example?email=${encodeURIComponent(email)}`, auth: credential },
                    response: { data: { email, credential } },
                })
                requests.get.mockReturnValue(throwError(() => failure))
                requests.post.mockReturnValue(throwError(() => failure))

                await expect(selected.verify(email)).resolves.toBe(false)
                expect(requests.get.mock.calls.length + requests.post.mock.calls.length).toBe(1)
                const logs = JSON.stringify(logger.debug.mock.calls)
                for (const sentinel of [email, encodeURIComponent(email), credential, externalMessage]) {
                    expect(logs).not.toContain(sentinel)
                }
                if (provider === 'microsoft_login') {
                    expect(logger.debug).not.toHaveBeenCalled()
                } else {
                    expect(logger.debug).toHaveBeenCalledWith({
                        event: 'account_discovery_verification',
                        provider,
                        outcome: 'failed',
                    })
                }
            },
        )
    })

    it.each(['us', 'uk'])('binds Mimecast to exactly the approved %s region', async region => {
        const { selected, requests } = fixture('mimecast', region)
        requests.post.mockReturnValue(response('mimecast', true))

        await expect(selected.verify('region@example.test')).resolves.toBe(true)
        expect(requests.post).toHaveBeenCalledTimes(1)
        expect(requests.post.mock.calls[0][0]).toBe(
            `https://login-${region}.mimecast.com/u/proxy/api/login/discover-authentication`,
        )
    })
})
