import { IsBoolean, IsEnum, IsString } from 'class-validator'
import { Environment, IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { Transform } from 'class-transformer'

@WithFileVars()
export class EnvironmentVariablesDto {
    @IsEnum(Environment)
    NODE_ENV: Environment

    @IsFileVar()
    @IsString()
    REDIS_URL: string

    @IsFileVar()
    @IsString()
    POSTGRES_URL: string

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

    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    TYPEORM_SYNCHRONIZE: boolean

    @IsBoolean()
    @Transform(({ value }) => value === 'true')
    TYPEORM_MIGRATIONS_RUN: boolean
}
