import { MulterOptionsFactory } from '@nestjs/platform-express'
import { Inject, Injectable } from '@nestjs/common'
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import multerS3 from 'multer-s3'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariablesDto } from '../../environment-variables.dto'

@Injectable()
export class MulterOptionsFactoryImpl implements MulterOptionsFactory {
    private readonly bucket: string

    constructor(
        @Inject(getS3ConnectionToken('default')) private readonly s3: S3,
        config: ConfigService<EnvironmentVariablesDto, true>,
    ) {
        this.bucket = config.get('S3_BUCKET')
    }

    createMulterOptions(): MulterOptions | Promise<MulterOptions> {
        return {
            storage: multerS3({
                bucket: this.bucket,
                s3: this.s3,
            }),
        }
    }
}
