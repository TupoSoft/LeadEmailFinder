import { S3ModuleOptions, S3ModuleOptionsFactory } from 'nestjs-s3'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Environment } from '@tuposoft/lead-email-finder/config'
import { EnvironmentVariablesDto } from './environment-variables.dto'

@Injectable()
export class S3ModuleOptionsFactoryImpl implements S3ModuleOptionsFactory {
    constructor(private readonly configService: ConfigService<EnvironmentVariablesDto, true>) {}

    createS3ModuleOptions(): S3ModuleOptions {
        const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID')
        const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY')
        const endpoint = this.configService.get<string>('S3_URL')
        const region = this.configService.get<string>('S3_REGION')
        const forcePathStyle = this.configService.get<boolean>('S3_FORCE_PATH_STYLE')
        const isProduction = this.configService.get<Environment>('NODE_ENV') === Environment.Production

        if (isProduction) {
            this.assertProductionSecurity(endpoint)
        }

        return {
            config: {
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
                endpoint,
                region,
                forcePathStyle,
                ...(isProduction
                    ? {
                          requestHandler: {
                              httpsAgent: {
                                  rejectUnauthorized: true,
                              },
                          },
                      }
                    : {}),
            },
        }
    }

    private assertProductionSecurity(endpoint: string): void {
        let endpointUrl: URL

        try {
            endpointUrl = new URL(endpoint)
        } catch {
            throw new Error('S3_URL: authenticated-https-required')
        }

        if (endpointUrl.protocol !== 'https:') {
            throw new Error('S3_URL: authenticated-https-required')
        }

        const serverSideEncryption = this.configService.get<string | undefined>('S3_SERVER_SIDE_ENCRYPTION')

        if (serverSideEncryption !== 'aws:kms') {
            throw new Error('S3_SERVER_SIDE_ENCRYPTION: aws-kms-required')
        }

        const kmsKeyId = this.configService.get<string | undefined>('S3_KMS_KEY_ID')

        if (kmsKeyId === undefined || kmsKeyId.trim() === '') {
            throw new Error('S3_KMS_KEY_ID: required')
        }
    }
}
