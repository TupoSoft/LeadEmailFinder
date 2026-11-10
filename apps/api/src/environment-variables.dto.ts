import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsJSON,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Max,
    Min,
    ValidateIf,
} from 'class-validator'
import { Environment, IsFileVar, WithFileVars } from '@tuposoft/lead-email-finder/config'
import { PaddleEnvironmentName, PaymentsProviderName } from '@tuposoft/lead-email-finder/modules/payments'
import { Transform, Type } from 'class-transformer'

function transformBoolean(value: unknown): boolean {
    return value === true || value === 'true'
}

const OPTIONAL_FILE_VARIABLES = [
    'POSTGRES_TLS_CA',
    'REDIS_TLS_CA',
    'S3_KMS_KEY_ID',
    'BETTER_AUTH_SECRET',
    'AUTH_MAIL_SMTP_PASSWORD',
    'CLOUDFLARE_API_TOKEN',
] as const

function isOptionalFileVariableConfigured(
    property: (typeof OPTIONAL_FILE_VARIABLES)[number],
): (environment: Record<string, unknown>) => boolean {
    return (environment: Record<string, unknown>): boolean =>
        environment[property] !== undefined || environment[`${property}_FILE`] !== undefined
}

export function normalizeEnvironmentConfiguration(config: Record<string, unknown>): Record<string, unknown> {
    if (config['PAYMENTS_CHECKOUT_RETURN_URL'] !== undefined) {
        throw new Error('PAYMENTS_CHECKOUT_RETURN_URL: removed; use PAYMENTS_CHECKOUT_URL')
    }

    for (const property of OPTIONAL_FILE_VARIABLES) {
        if (config[property] !== undefined && config[`${property}_FILE`] !== undefined) {
            throw new Error(`${property}: multiple-sources`)
        }
    }

    return config
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

    @IsFileVar(isOptionalFileVariableConfigured('POSTGRES_TLS_CA'))
    @IsOptional()
    @IsString()
    POSTGRES_TLS_CA?: string

    @IsFileVar(isOptionalFileVariableConfigured('REDIS_TLS_CA'))
    @IsOptional()
    @IsString()
    REDIS_TLS_CA?: string

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

    @IsOptional()
    @IsString()
    S3_SERVER_SIDE_ENCRYPTION?: string

    @IsFileVar(isOptionalFileVariableConfigured('S3_KMS_KEY_ID'))
    @IsOptional()
    @IsString()
    S3_KMS_KEY_ID?: string

    @IsBoolean()
    @Type(() => String)
    @Transform(({ value }) => transformBoolean(value))
    TYPEORM_SYNCHRONIZE: boolean

    @IsUrl({ require_protocol: true, require_tld: false })
    OIDC_ISSUER_URL: string

    @IsString()
    OIDC_AUDIENCE: string

    // Optional realm base for server-side exchange, refresh, and logout; the public issuer stays unchanged.
    @IsOptional()
    @IsUrl({
        require_protocol: true,
        require_tld: false,
        protocols: ['http', 'https'],
        disallow_auth: true,
        allow_query_components: false,
        allow_fragments: false,
    })
    OIDC_BACKCHANNEL_URL?: string

    // Optional: overrides where this server fetches JWKS from, independently of OIDC_ISSUER_URL (which stays
    // host-facing for the browser redirect and the token issuer-claim check). Only set where the containerized
    // api can't reach OIDC_ISSUER_URL directly — see oidc-configuration.ts.
    @IsOptional()
    @IsUrl({ require_protocol: true, require_tld: false })
    OIDC_JWKS_URI?: string

    @IsUrl({ require_protocol: true, require_tld: false })
    APP_BASE_URL: string

    // Native authentication settings stay optional here; BetterAuthRuntimeModule validates the complete set only in
    // a process that composes it, so unrelated processes never need them.
    @IsFileVar(isOptionalFileVariableConfigured('BETTER_AUTH_SECRET'))
    @IsOptional()
    @IsString()
    BETTER_AUTH_SECRET?: string

    @IsOptional()
    @IsString()
    AUTH_MAIL_SMTP_HOST?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(65535)
    AUTH_MAIL_SMTP_PORT?: number

    @IsOptional()
    @IsBoolean()
    @Type(() => String)
    @Transform(({ value }) => transformBoolean(value))
    AUTH_MAIL_SMTP_SECURE?: boolean

    @IsOptional()
    @IsString()
    AUTH_MAIL_SMTP_USER?: string

    @IsFileVar(isOptionalFileVariableConfigured('AUTH_MAIL_SMTP_PASSWORD'))
    @IsOptional()
    @IsString()
    AUTH_MAIL_SMTP_PASSWORD?: string

    @IsOptional()
    @IsString()
    AUTH_MAIL_FROM?: string

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

    @IsString()
    KEYCLOAK_ORG_ADMIN_CLIENT_ID: string

    @IsFileVar()
    @IsString()
    KEYCLOAK_ORG_ADMIN_CLIENT_SECRET: string

    // Optional: overrides where this server reaches Keycloak's Admin REST API, independently of
    // OIDC_ISSUER_URL (which stays host-facing) — same reasoning as OIDC_JWKS_URI above.
    @IsOptional()
    @IsUrl({ require_protocol: true, require_tld: false })
    KEYCLOAK_ADMIN_API_BASE_URL?: string

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

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    SMTP_TLS_CA_FILE?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(86400)
    VERIFICATION_RESULT_CACHE_TTL_SECONDS?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    VERIFICATION_SUBMISSION_RATE_CAPACITY?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    VERIFICATION_SUBMISSION_RATE_REFILL_PER_SECOND?: number

    @IsOptional()
    @IsString()
    CLOUDFLARE_ACCOUNT_ID?: string

    @IsFileVar(isOptionalFileVariableConfigured('CLOUDFLARE_API_TOKEN'))
    @IsOptional()
    @IsString()
    CLOUDFLARE_API_TOKEN?: string

    @IsOptional()
    @IsString()
    VERIFICATION_QUEUE_ID?: string

    @IsOptional()
    @IsString()
    VERIFICATION_RESULTS_QUEUE_ID?: string

    @IsEnum(PaymentsProviderName)
    PAYMENTS_PROVIDER: PaymentsProviderName

    @IsJSON()
    PAYMENTS_CREDIT_PACKS: string

    @IsUrl({ require_protocol: true, require_tld: false })
    PAYMENTS_CHECKOUT_URL: string

    @IsOptional()
    @IsString()
    PAYMENTS_CHECKOUT_ALLOWED_ORIGINS?: string

    @IsFileVar(environment => environment['PAYMENTS_PROVIDER'] === PaymentsProviderName.STUB)
    @IsString()
    PAYMENTS_STUB_WEBHOOK_SECRET?: string

    @IsFileVar(environment => environment['PAYMENTS_PROVIDER'] === PaymentsProviderName.PADDLE)
    @IsString()
    PADDLE_API_KEY?: string

    @IsFileVar(environment => environment['PAYMENTS_PROVIDER'] === PaymentsProviderName.PADDLE)
    @IsString()
    PADDLE_WEBHOOK_SECRET?: string

    @ValidateIf(
        (environment: Record<string, unknown>) => environment['PAYMENTS_PROVIDER'] === PaymentsProviderName.PADDLE,
    )
    @IsEnum(PaddleEnvironmentName)
    PADDLE_ENVIRONMENT?: PaddleEnvironmentName
}
