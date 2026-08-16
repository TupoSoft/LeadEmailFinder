import { Test, TestingModule } from '@nestjs/testing'
import { MulterOptionsFactoryImpl } from './multer-options-factory-impl.service'
import { getS3ConnectionToken } from 'nestjs-s3'
import { ConfigService } from '@nestjs/config'
import { UnauthorizedException } from '@nestjs/common'
import { setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { Request } from 'express'
import multerS3 from 'multer-s3'

jest.mock('multer-s3')

type MulterS3KeyCallback = (
    req: Request,
    file: Express.Multer.File,
    callback: (error: unknown, key?: string) => void,
) => void

interface MulterS3Options {
    key: MulterS3KeyCallback
}

describe('MulterOptionsFactoryImpl', () => {
    let factory: MulterOptionsFactoryImpl
    let keyCallback: MulterS3KeyCallback

    beforeEach(async () => {
        ;(multerS3 as unknown as jest.Mock).mockImplementation((options: MulterS3Options) => {
            keyCallback = options.key
            return 'storage-engine'
        })

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MulterOptionsFactoryImpl,
                {
                    provide: getS3ConnectionToken('default'),
                    useValue: {},
                },
                {
                    provide: ConfigService,
                    useValue: { get: jest.fn().mockReturnValue('bucket') },
                },
            ],
        }).compile()

        factory = module.get(MulterOptionsFactoryImpl)
        void factory.createMulterOptions()
    })

    it('generates an organization-namespaced key when a principal is present', () => {
        const req = {} as Request
        setAuthPrincipal(req, { organizationId: 'org-1' } as AuthPrincipal)
        const callback = jest.fn()

        keyCallback(req, {} as Express.Multer.File, callback)

        expect(callback).toHaveBeenCalledWith(null, expect.stringMatching(/^organizations\/org-1\/uploads\/.+$/))
    })

    it('rejects with UnauthorizedException when no principal is present', () => {
        const req = {} as Request
        const callback = jest.fn()

        keyCallback(req, {} as Express.Multer.File, callback)

        expect(callback).toHaveBeenCalledWith(expect.any(UnauthorizedException))
    })
})
