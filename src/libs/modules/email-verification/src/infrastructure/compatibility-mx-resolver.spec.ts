import { IDnsService } from '@tuposoft/lead-email-finder/common'
import { CompatibilityMxResolver } from './compatibility-mx-resolver'

describe('CompatibilityMxResolver', () => {
    it('resolves MX records and returns the exchange hostnames in the order given', async () => {
        const dnsService: jest.Mocked<IDnsService> = {
            resolve: jest.fn().mockResolvedValue([
                { exchange: 'mx1.example.com', priority: 10 },
                { exchange: 'mx2.example.com', priority: 20 },
            ]),
        }
        const resolver = new CompatibilityMxResolver(dnsService)

        await expect(resolver.resolve('example.com')).resolves.toEqual(['mx1.example.com', 'mx2.example.com'])
        expect(dnsService.resolve).toHaveBeenCalledWith('example.com', 'MX')
    })

    it('returns an empty list when no MX records are found', async () => {
        const dnsService: jest.Mocked<IDnsService> = { resolve: jest.fn().mockResolvedValue([]) }
        const resolver = new CompatibilityMxResolver(dnsService)

        await expect(resolver.resolve('no-mx.example.com')).resolves.toEqual([])
    })
})
