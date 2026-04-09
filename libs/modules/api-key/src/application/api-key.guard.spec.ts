import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { ApiKeyGuard } from './api-key.guard'
import { KeyPermissions } from '../domain/key.enum'
import { ApiKeyService } from './api-key.service'

describe('ApiKeyGuard', () => {
    let guard: ApiKeyGuard
    let reflector: jest.Mocked<Reflector>
    let apiKeyService: jest.Mocked<ApiKeyService>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ApiKeyGuard,
                {
                    provide: Reflector,
                    useValue: {
                        getAllAndOverride: jest.fn(),
                    },
                },
                {
                    provide: ApiKeyService,
                    useValue: {
                        validateKeyForRoles: jest.fn(),
                    },
                },
            ],
        }).compile()

        guard = module.get(ApiKeyGuard)
        reflector = module.get(Reflector)
        apiKeyService = module.get(ApiKeyService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should be defined', () => {
        expect(guard).toBeDefined()
    })

    it('should return true if route is public', async () => {
        reflector.getAllAndOverride.mockReturnValue(true)

        const context = {
            getHandler: () => ({}),
            getClass: () => ({}),
        } as ExecutionContext

        const result = await guard.canActivate(context)
        expect(result).toBe(true)
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', expect.any(Array))
    })

    it('should throw UnauthorizedException if token is missing', async () => {
        reflector.getAllAndOverride.mockReturnValue(false)

        const context = {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {},
                }),
            }),
        } as unknown as ExecutionContext

        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    })

    it('should call validateKeyForRoles with bearer token', async () => {
        reflector.getAllAndOverride.mockImplementation(key => {
            if (key === 'isPublic') return false
            if (key === 'permissions') return [KeyPermissions.READ]
            return null
        })

        const token = 'test-token'
        const context = {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {
                        authorization: `Bearer ${token}`,
                    },
                }),
            }),
        } as unknown as ExecutionContext

        apiKeyService.validateKeyForRoles.mockResolvedValue(true)

        const result = await guard.canActivate(context)

        expect(result).toBe(true)
        expect(apiKeyService.validateKeyForRoles).toHaveBeenCalledWith(token, [KeyPermissions.READ])
    })

    it('should call validateKeyForRoles with x-api-key header', async () => {
        reflector.getAllAndOverride.mockImplementation(key => {
            if (key === 'isPublic') return false
            if (key === 'permissions') return []
            return null
        })

        const token = 'test-x-api-key'
        const context = {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {
                        'x-api-key': token,
                    },
                }),
            }),
        } as unknown as ExecutionContext

        apiKeyService.validateKeyForRoles.mockResolvedValue(true)

        const result = await guard.canActivate(context)

        expect(result).toBe(true)
        expect(apiKeyService.validateKeyForRoles).toHaveBeenCalledWith(token, [])
    })

    it('should return false if ApiKeyService returns false', async () => {
        reflector.getAllAndOverride.mockImplementation(key => {
            if (key === 'isPublic') return false
            if (key === 'permissions') return []
            return null
        })

        const token = 'invalid-token'
        const context = {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {
                        'x-api-key': token,
                    },
                }),
            }),
        } as unknown as ExecutionContext

        apiKeyService.validateKeyForRoles.mockResolvedValue(false)

        const result = await guard.canActivate(context)

        expect(result).toBe(false)
        expect(apiKeyService.validateKeyForRoles).toHaveBeenCalledWith(token, [])
    })
})
