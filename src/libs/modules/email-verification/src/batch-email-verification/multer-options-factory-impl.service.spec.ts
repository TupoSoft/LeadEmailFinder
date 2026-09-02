import { Test, TestingModule } from '@nestjs/testing'
import { MulterOptionsFactoryImpl } from './multer-options-factory-impl.service'
import { getS3ConnectionToken } from 'nestjs-s3'
import { ConfigService } from '@nestjs/config'
import { UnauthorizedException } from '@nestjs/common'
import { setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { Request } from 'express'
import multerS3 from 'multer-s3'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import {
    CustomerObjectWriteSecurityMapping,
    customerObjectWriteSecurityContract,
} from '@tuposoft/lead-email-finder/common/testing'

jest.mock('multer-s3')

type MulterS3KeyCallback = (
    req: Request,
    file: Express.Multer.File,
    callback: (error: unknown, key?: string) => void,
) => void

interface MulterS3Options {
    key: MulterS3KeyCallback
    cacheControl?: string
    serverSideEncryption?: string
    sseKmsKeyId?: string
}

const developmentObjectWriteSecurity: CustomerObjectWriteSecurity = {
    mode: 'development-local',
    cacheControl: 'no-store',
}

function readSecurityMapping(options: MulterS3Options): CustomerObjectWriteSecurityMapping {
    if ('serverSideEncryption' in options || 'sseKmsKeyId' in options) {
        return {
            cacheControl: options.cacheControl as 'no-store',
            serverSideEncryption: options.serverSideEncryption as 'aws:kms',
            kmsKeyId: options.sseKmsKeyId as string,
        }
    }

    return { cacheControl: options.cacheControl as 'no-store' }
}

describe('MulterOptionsFactoryImpl', () => {
    let factory: MulterOptionsFactoryImpl
    let keyCallback: MulterS3KeyCallback
    let multerS3Options: MulterS3Options

    async function buildFactory(objectWriteSecurity: CustomerObjectWriteSecurity): Promise<MulterOptionsFactoryImpl> {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MulterOptionsFactoryImpl,
                {
                    provide: getS3ConnectionToken('default'),
                    useValue: {},
                },
                {
                    provide: CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN,
                    useValue: objectWriteSecurity,
                },
                {
                    provide: ConfigService,
                    useValue: { get: jest.fn().mockReturnValue('bucket') },
                },
            ],
        }).compile()

        return module.get(MulterOptionsFactoryImpl)
    }

    beforeEach(async () => {
        ;(multerS3 as unknown as jest.Mock).mockImplementation((options: MulterS3Options) => {
            multerS3Options = options
            keyCallback = options.key
            return 'storage-engine'
        })

        factory = await buildFactory(developmentObjectWriteSecurity)
        void factory.createMulterOptions()
    })

    customerObjectWriteSecurityContract('batch input multer-S3 adapter', {
        writeWithSecurity: async security => {
            const securedFactory = await buildFactory(security)
            void securedFactory.createMulterOptions()

            return readSecurityMapping(multerS3Options)
        },
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
