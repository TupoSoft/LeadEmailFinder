import { MulterOptionsFactory } from '@nestjs/platform-express'
import { Injectable } from '@nestjs/common'
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface'
import multerS3 from 'multer-s3'
import { S3Client } from '@aws-sdk/client-s3'

@Injectable()
export class MulterOptionsFactoryImpl implements MulterOptionsFactory {
    createMulterOptions(): MulterOptions | Promise<MulterOptions> {
        return {
            storage: multerS3({
                s3: new S3Client({
                    credentials: {
                        accessKeyId: 'minioadmin',
                        secretAccessKey: 'minioadmin',
                    },
                    region: 'us-east-1',
                    endpoint: 'http://minio:9000',
                    forcePathStyle: true,
                }),
                bucket: 'batch-email-verification',
            }),
        }
    }
}
