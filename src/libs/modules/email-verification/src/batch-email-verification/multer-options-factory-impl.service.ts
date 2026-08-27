import { MulterOptionsFactory } from '@nestjs/platform-express'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import multerS3 from 'multer-s3'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { getAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { BatchUploadConfiguration } from '../email-verification-configuration'

@Injectable()
export class MulterOptionsFactoryImpl implements MulterOptionsFactory {
    private readonly bucket: string

    constructor(
        @Inject(getS3ConnectionToken('default')) private readonly s3: S3,
        config: ConfigService<BatchUploadConfiguration, true>,
    ) {
        this.bucket = config.get('S3_BUCKET')
    }

    createMulterOptions(): MulterOptions | Promise<MulterOptions> {
        return {
            storage: multerS3({
                bucket: this.bucket,
                s3: this.s3,
                key: (req, _file, callback) => {
                    const principal = getAuthPrincipal(req)

                    if (!principal) {
                        callback(new UnauthorizedException('Authentication principal is missing'))
                        return
                    }

                    callback(null, `organizations/${principal.organizationId}/uploads/${randomUUID()}`)
                },
            }),
        }
    }
}
