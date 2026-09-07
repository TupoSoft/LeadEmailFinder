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
    Validate,
    ValidateIf,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator'
import {
    ACCOUNT_DISCOVERY_PROVIDERS,
    type AccountDiscoveryProvider,
    Environment,
    IsFileVar,
    WithFileVars,
} from '@tuposoft/lead-email-finder/config'
import { PaddleEnvironmentName, PaymentsProviderName } from '@tuposoft/lead-email-finder/modules/payments'
import { Transform, Type } from 'class-transformer'

function transformBoolean(value: unknown): boolean {
    return value === true || value === 'true'
}

const OPTIONAL_FILE_VARIABLES = [
    'POSTGRES_TLS_CA',
    'REDIS_TLS_CA',
    'S3_KMS_KEY_ID',
    'CATCH_ALL_HTTP_PROXY_URL',
] as const

interface AccountDiscoveryProviderEnvironment {
    CATCH_ALL_HTTP_PROXY_URL?: unknown
    CATCH_ALL_HTTP_PROXY_URL_FILE?: unknown
    CATCH_ALL_PROVIDER?: unknown
    CATCH_ALL_PROVIDER_APPROVAL_ID?: unknown
    CATCH_ALL_PROVIDER_REGION?: unknown
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
}

function isConfiguredDirectlyOrByFile(
    environment: AccountDiscoveryProviderEnvironment,
    property: 'CATCH_ALL_HTTP_PROXY_URL',
): boolean {
    return isNonEmptyString(environment[property]) || isNonEmptyString(environment[`${property}_FILE`])
}

@ValidatorConstraint({ name: 'accountDiscoveryProviderConfiguration', async: false })
class AccountDiscoveryProviderConfigurationConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, { object }: ValidationArguments): boolean {
        const environment = object as AccountDiscoveryProviderEnvironment
        const { CATCH_ALL_PROVIDER: provider } = environment

        if (provider === undefined) {
            return (
                environment.CATCH_ALL_PROVIDER_APPROVAL_ID === undefined &&
                environment.CATCH_ALL_PROVIDER_REGION === undefined
            )
        }

        return (
            typeof provider === 'string' &&
            ACCOUNT_DISCOVERY_PROVIDERS.includes(provider as AccountDiscoveryProvider) &&
            isConfiguredDirectlyOrByFile(environment, 'CATCH_ALL_HTTP_PROXY_URL') &&
            isNonEmptyString(environment.CATCH_ALL_PROVIDER_APPROVAL_ID) &&
            isNonEmptyString(environment.CATCH_ALL_PROVIDER_REGION) &&
            (provider !== 'mimecast' ||
                environment.CATCH_ALL_PROVIDER_REGION === 'us' ||
                environment.CATCH_ALL_PROVIDER_REGION === 'uk')
        )
    }

    defaultMessage(): string {
        return 'account discovery provider configuration is incomplete or unsupported'
    }
}

function isOptionalFileVariableConfigured(
    property: (typeof OPTIONAL_FILE_VARIABLES)[number],
): (environment: Record<string, unknown>) => boolean {
    return (environment: Record<string, unknown>): boolean =>
        environment[property] !== undefined || environment[`${property}_FILE`] !== undefined
}

export function normalizePaymentCheckoutUrlConfiguration(config: Record<string, unknown>): Record<string, unknown> {
    const checkoutUrl = config['PAYMENTS_CHECKOUT_URL']
    const legacyCheckoutUrl = config['PAYMENTS_CHECKOUT_RETURN_URL']

    if (checkoutUrl !== undefined && legacyCheckoutUrl !== undefined && checkoutUrl !== legacyCheckoutUrl) {
        throw new Error('PAYMENTS_CHECKOUT_URL and PAYMENTS_CHECKOUT_RETURN_URL must match when both are set')
    }

    if (checkoutUrl === undefined && legacyCheckoutUrl !== undefined) {
        return { ...config, PAYMENTS_CHECKOUT_URL: legacyCheckoutUrl }
    }

    return config
}

export function normalizeEnvironmentConfiguration(config: Record<string, unknown>): Record<string, unknown> {
    const normalizedConfig = normalizePaymentCheckoutUrlConfiguration(config)

    for (const property of OPTIONAL_FILE_VARIABLES) {
        if (normalizedConfig[property] !== undefined && normalizedConfig[`${property}_FILE`] !== undefined) {
            throw new Error(`${property}: multiple-sources`)
        }
    }

    return normalizedConfig
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

    @IsFileVar(
        environment =>
            environment['CATCH_ALL_PROVIDER'] !== undefined ||
            environment['CATCH_ALL_HTTP_PROXY_URL'] !== undefined ||
            environment['CATCH_ALL_HTTP_PROXY_URL_FILE'] !== undefined,
    )
    @IsOptional()
    @IsString()
    CATCH_ALL_HTTP_PROXY_URL?: string

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @Validate(AccountDiscoveryProviderConfigurationConstraint)
    CATCH_ALL_PROVIDER?: AccountDiscoveryProvider

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @Validate(AccountDiscoveryProviderConfigurationConstraint)
    CATCH_ALL_PROVIDER_APPROVAL_ID?: string

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @Validate(AccountDiscoveryProviderConfigurationConstraint)
    CATCH_ALL_PROVIDER_REGION?: string

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

    @IsEnum(PaymentsProviderName)
    PAYMENTS_PROVIDER: PaymentsProviderName

    @IsJSON()
    PAYMENTS_CREDIT_PACKS: string

    @IsUrl({ require_protocol: true, require_tld: false })
    PAYMENTS_CHECKOUT_URL: string

    @IsOptional()
    @IsUrl({ require_protocol: true, require_tld: false })
    PAYMENTS_CHECKOUT_RETURN_URL?: string

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
