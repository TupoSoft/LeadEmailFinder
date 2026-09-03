import { Test, TestingModule } from '@nestjs/testing'
import { DomainService } from './domain.service'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Domain } from './domain.entity'
import { Mapper } from '@automapper/core'
import { getMapperToken } from '@automapper/nestjs'
import { Repository } from 'typeorm'
import { IDomainResponseDto } from '@tuposoft/lead-email-finder/common'
import { DomainResponseDto } from './domain-response.dto'
import { DomainNotFoundException } from './domain-not-found.exception'

const date = new Date()

describe('DomainService', () => {
    let service: DomainService
    let domainRepoMock: jest.Mocked<Pick<Repository<Domain>, 'findOneBy'>>
    let mapperMock: jest.Mocked<Mapper>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainService,
                {
                    provide: getRepositoryToken(Domain),
                    useValue: {
                        findOneBy: jest.fn(),
                    },
                },
                {
                    provide: getMapperToken(),
                    useValue: {
                        map: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = module.get<DomainService>(DomainService)
        domainRepoMock = module.get(getRepositoryToken(Domain))
        mapperMock = module.get(getMapperToken())
    })

    beforeEach(() => {
        jest.resetAllMocks()
    })

    describe('getDomain', () => {
        it('should return a DomainResponseDto when a domain is found', async () => {
            const domainName = 'example.com'
            const domain: Domain = {
                id: domainName,
                catchAllEnabled: true,
                createdAt: date,
                updatedAt: date,
                isFree: false,
                isDisposable: false,
                isVerificationForbidden: false,
            }
            const domainResponseDto: IDomainResponseDto = {
                name: domainName,
                catchAllEnabled: true,
                createdAt: date,
                updatedAt: date,
            }

            domainRepoMock.findOneBy.mockResolvedValue(domain)
            mapperMock.map.mockReturnValue(domainResponseDto as any)

            const result = await service.getDomain(domainName)

            expect(domainRepoMock.findOneBy).toHaveBeenCalledWith({ id: domainName })
            expect(mapperMock.map).toHaveBeenCalledWith(domain, Domain, DomainResponseDto)
            expect(result).toEqual(domainResponseDto)
        })

        it('should throw DomainNotFoundException when a domain is not found', async () => {
            const domainName = 'non-existent.com'

            domainRepoMock.findOneBy.mockResolvedValue(null)

            const error = await service.getDomain(domainName).catch((caughtError: unknown) => caughtError)

            expect(error).toBeInstanceOf(DomainNotFoundException)
            expect((error as Error).message).toBe('Domain not found.')
            expect((error as Error).message).not.toContain(domainName)
            expect(domainRepoMock.findOneBy).toHaveBeenCalledWith({ id: domainName })
            expect(mapperMock.map).not.toHaveBeenCalled()
        })
    })

    describe('isVerificationAllowed', () => {
        it('should return true when domain does not exist', async () => {
            const domainName = 'non-existent.com'

            domainRepoMock.findOneBy.mockResolvedValue(null)

            const result = await service.isVerificationAllowed(domainName)

            expect(domainRepoMock.findOneBy).toHaveBeenCalledWith({ id: domainName })
            expect(result).toBe(true)
        })

        it('should return true when domain exists and isVerificationForbidden is false', async () => {
            const domainName = 'example.com'
            const domain: Domain = {
                id: domainName,
                isVerificationForbidden: false,
                createdAt: date,
                updatedAt: date,
                catchAllEnabled: false,
                isFree: false,
                isDisposable: false,
            }

            domainRepoMock.findOneBy.mockResolvedValue(domain)

            const result = await service.isVerificationAllowed(domainName)

            expect(domainRepoMock.findOneBy).toHaveBeenCalledWith({ id: domainName })
            expect(result).toBe(true)
        })

        it('should return false when domain exists and isVerificationForbidden is true', async () => {
            const domainName = 'forbidden.com'
            const domain: Domain = {
                id: domainName,
                isVerificationForbidden: true,
                createdAt: date,
                updatedAt: date,
                catchAllEnabled: false,
                isFree: false,
                isDisposable: false,
            }

            domainRepoMock.findOneBy.mockResolvedValue(domain)

            const result = await service.isVerificationAllowed(domainName)

            expect(domainRepoMock.findOneBy).toHaveBeenCalledWith({ id: domainName })
            expect(result).toBe(false)
        })
    })
})
