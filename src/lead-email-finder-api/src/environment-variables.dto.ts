import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator'
import { Environment, IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { Transform, Type } from 'class-transformer'

function transformBoolean(value: unknown): boolean {
    return value === true || value === 'true'
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
    POSTGRES_URL: string

    @IsOptional()
    @IsString()
    CATCH_ALL_HTTP_PROXY_URL?: string

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
    @Type(() => String)
    @Transform(({ value }) => transformBoolean(value))
    S3_FORCE_PATH_STYLE: boolean

    @IsString()
    S3_BUCKET: string

    @IsBoolean()
    @Type(() => String)
    @Transform(({ value }) => transformBoolean(value))
    TYPEORM_SYNCHRONIZE: boolean

    @IsUrl({ require_protocol: true, require_tld: false })
    OIDC_ISSUER_URL: string

    @IsString()
    OIDC_AUDIENCE: string

    @IsUrl({ require_protocol: true, require_tld: false })
    APP_BASE_URL: string

    @IsString()
    BFF_CLIENT_ID: string

    @IsFileVar()
    @IsString()
    BFF_CLIENT_SECRET: string

    @IsFileVar()
    @IsString()
    SESSION_ENCRYPTION_KEY: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    SESSION_IDLE_TIMEOUT_MS?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    SESSION_ABSOLUTE_TIMEOUT_MS?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    PROXY_MX_REQUESTS_PER_MINUTE?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    PROXY_LEASE_TTL_MS?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(65535)
    SMTP_PORT?: number
}
