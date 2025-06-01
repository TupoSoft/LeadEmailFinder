import { MulterOptionsFactory } from '@nestjs/platform-express'
import { Inject, Injectable } from '@nestjs/common'
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import multerS3 from 'multer-s3'

@Injectable()
export class MulterOptionsFactoryImpl implements MulterOptionsFactory {
    constructor(@Inject(getS3ConnectionToken('default')) private readonly s3: S3) {}

    createMulterOptions(): MulterOptions | Promise<MulterOptions> {
        return {
            storage: multerS3({
                bucket: 'batch-email-verification',
                s3: this.s3,
            }),
        }
    }
}
