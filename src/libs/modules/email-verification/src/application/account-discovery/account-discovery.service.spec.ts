import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { AccountDiscoveryService } from './account-discovery.service'
import { AccountDiscoveryProviderUnavailableError } from './approved-account-discovery-verifier'

function verifier(): jest.Mocked<ICatchAllVerifier> {
    return { sourceName: 'microsoft_2', verify: jest.fn() }
}

describe(AccountDiscoveryService.name, () => {
    it('returns separate empty evidence arrays when no provider is selected', async () => {
        const discovery = new AccountDiscoveryService()

        const first = await discovery.discover('first@example.test')
        const second = await discovery.discover('second@example.test')

        expect(first).toEqual([])
        expect(second).toEqual([])
        expect(first).not.toBe(second)
    })

    it('dispatches exactly once and returns source evidence for a positive response', async () => {
        const provider = verifier()
        provider.verify.mockResolvedValue(true)
        const discovery = new AccountDiscoveryService(provider)

        await expect(discovery.discover('person@example.test')).resolves.toEqual([{ sourceName: 'microsoft_2' }])
        expect(provider.verify).toHaveBeenCalledTimes(1)
        expect(provider.verify).toHaveBeenCalledWith('person@example.test')
    })

    it('returns no evidence for a negative response', async () => {
        const provider = verifier()
        provider.verify.mockResolvedValue(false)

        await expect(new AccountDiscoveryService(provider).discover('person@example.test')).resolves.toEqual([])
        expect(provider.verify).toHaveBeenCalledTimes(1)
    })

    it.each([new Error('external failure'), new AccountDiscoveryProviderUnavailableError()])(
        'normalizes a rejected provider or approval failure to no evidence',
        async error => {
            const provider = verifier()
            provider.verify.mockRejectedValue(error)

            await expect(new AccountDiscoveryService(provider).discover('person@example.test')).resolves.toEqual([])
            expect(provider.verify).toHaveBeenCalledTimes(1)
        },
    )

    it('normalizes synchronous provider failures to no evidence', async () => {
        const provider = verifier()
        provider.verify.mockImplementation(() => {
            throw new Error('external failure')
        })

        await expect(new AccountDiscoveryService(provider).discover('person@example.test')).resolves.toEqual([])
        expect(provider.verify).toHaveBeenCalledTimes(1)
    })

    it('keeps concurrent input results separate and returns fresh positive evidence', async () => {
        const pending = new Map<string, (exists: boolean) => void>()
        const provider = verifier()
        provider.verify.mockImplementation(email => new Promise(resolve => pending.set(email, resolve)))
        const discovery = new AccountDiscoveryService(provider)
        const first = discovery.discover('first@example.test')
        const second = discovery.discover('second@example.test')
        const third = discovery.discover('third@example.test')

        pending.get('third@example.test')!(true)
        pending.get('second@example.test')!(false)
        pending.get('first@example.test')!(true)
        const [firstEvidence, secondEvidence, thirdEvidence] = await Promise.all([first, second, third])

        expect(firstEvidence).toEqual([{ sourceName: 'microsoft_2' }])
        expect(secondEvidence).toEqual([])
        expect(thirdEvidence).toEqual([{ sourceName: 'microsoft_2' }])
        expect(firstEvidence).not.toBe(thirdEvidence)
        expect(firstEvidence[0]).not.toBe(thirdEvidence[0])
        expect(provider.verify.mock.calls).toEqual([
            ['first@example.test'],
            ['second@example.test'],
            ['third@example.test'],
        ])
    })
})
