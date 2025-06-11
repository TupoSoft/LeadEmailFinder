import { IsBoolean, IsEnum, IsString } from 'class-validator'
import { IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { Transform } from 'class-transformer'

enum Environment {
    Development = 'development',
    Production = 'production',
}

@WithFileVars()
export class EnvironmentVariablesDto {
    @IsEnum(Environment)
    NODE_ENV: Environment

    @IsFileVar()
    @IsString()
    REDIS_URL: string

    @IsFileVar()
    @IsString()
    MONGO_URL: string

    @IsFileVar()
    @IsString()
    CATCH_ALL_HTTP_PROXY_URL: string

    @IsFileVar()
    @IsString()
    S3_ACCESS_KEY_ID: string

    @IsFileVar()
    @IsString()
    S3_SECRET_KEY: string

    @IsFileVar()
    @IsString()
    S3_URL: string

    @IsString()
    S3_REGION: string

    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    S3_FORCE_PATH_STYLE: boolean

    @IsString()
    S3_BUCKET: string
}
