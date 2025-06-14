import { Test, TestingModule } from '@nestjs/testing'
import { DomainService } from './domain.service'
import { getModelToken } from '@nestjs/mongoose'
import { Domain } from './domain.schema'
import { Mapper } from '@automapper/core'
import { getMapperToken } from '@automapper/nestjs'
import { Model } from 'mongoose'
import { IDomainResponseDto } from '@tuposoft/lead-email-finder/common'
import { DomainResponseDto } from './domain-response.dto'
import { DomainNotFoundException } from './domain-not-found.exception'

const date = new Date()

describe('DomainService', () => {
    let service: DomainService
    let domainModelMock: jest.Mocked<Model<Domain>>
    let mapperMock: jest.Mocked<Mapper>

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainService,
                {
                    provide: getModelToken(Domain.name),
                    useValue: {
                        findById: jest.fn(),
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
        domainModelMock = module.get(getModelToken(Domain.name))
        mapperMock = module.get(getMapperToken())
    })

    beforeEach(() => {
        jest.resetAllMocks()
    })

    describe('getDomain', () => {
        it('should return a DomainResponseDto when a domain is found', async () => {
            const domainName = 'example.com'
            const domain: Domain = {
                _id: domainName,
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

            domainModelMock.findById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(domain),
            } as any)
            mapperMock.map.mockReturnValue(domainResponseDto as any)

            const result = await service.getDomain(domainName)

            expect(domainModelMock.findById).toHaveBeenCalledWith(domainName)
            expect(mapperMock.map).toHaveBeenCalledWith(domain, Domain, DomainResponseDto)
            expect(result).toEqual(domainResponseDto)
        })

        it('should throw DomainNotFoundException when a domain is not found', async () => {
            const domainName = 'non-existent.com'

            domainModelMock.findById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            } as any)

            await expect(service.getDomain(domainName)).rejects.toThrow(DomainNotFoundException)
            expect(domainModelMock.findById).toHaveBeenCalledWith(domainName)
            expect(mapperMock.map).not.toHaveBeenCalled()
        })
    })

    describe('isVerificationAllowed', () => {
        it('should return true when domain does not exist', async () => {
            const domainName = 'non-existent.com'

            domainModelMock.findById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            } as any)

            const result = await service.isVerificationAllowed(domainName)

            expect(domainModelMock.findById).toHaveBeenCalledWith(domainName)
            expect(result).toBe(true)
        })

        it('should return true when domain exists and isVerificationForbidden is false', async () => {
            const domainName = 'example.com'
            const domain: Domain = {
                _id: domainName,
                isVerificationForbidden: false,
                createdAt: date,
                updatedAt: date,
                catchAllEnabled: false,
                isFree: false,
                isDisposable: false,
            }

            domainModelMock.findById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(domain),
            } as any)

            const result = await service.isVerificationAllowed(domainName)

            expect(domainModelMock.findById).toHaveBeenCalledWith(domainName)
            expect(result).toBe(true)
        })

        it('should return false when domain exists and isVerificationForbidden is true', async () => {
            const domainName = 'forbidden.com'
            const domain: Domain = {
                _id: domainName,
                isVerificationForbidden: true,
                createdAt: date,
                updatedAt: date,
                catchAllEnabled: false,
                isFree: false,
                isDisposable: false,
            }

            domainModelMock.findById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(domain),
            } as any)

            const result = await service.isVerificationAllowed(domainName)

            expect(domainModelMock.findById).toHaveBeenCalledWith(domainName)
            expect(result).toBe(false)
        })
    })
})
