import { S3ModuleOptions, S3ModuleOptionsFactory } from 'nestjs-s3'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EnvironmentVariablesDto } from './config'

@Injectable()
export class S3ModuleOptionsFactoryImpl implements S3ModuleOptionsFactory {
    constructor(private readonly configService: ConfigService<EnvironmentVariablesDto, true>) {}

    createS3ModuleOptions(): S3ModuleOptions {
        const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID')
        const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY')
        const endpoint = this.configService.get<string>('S3_URL')
        const region = this.configService.get<string>('S3_REGION')
        const forcePathStyle = this.configService.get<boolean>('S3_FORCE_PATH_STYLE')

        return {
            config: {
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
                endpoint,
                region,
                forcePathStyle,
            },
        }
    }
}
