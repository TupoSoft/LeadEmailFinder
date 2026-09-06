// This fixture is used only by the isolated metadata child process, never by runtime bootstrap.
export function installPreviewEnvironment(): void {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, {
        NODE_ENV: 'development',
        API_URL: 'http://metadata.invalid',
        REDIS_URL: 'redis://metadata.invalid:6379',
        POSTGRES_URL: 'postgresql://metadata:unused@metadata.invalid/metadata',
        S3_ACCESS_KEY_ID: 'metadata-unused',
        S3_SECRET_KEY: 'metadata-unused',
        S3_URL: 'http://metadata.invalid:9000',
        S3_REGION: 'us-east-1',
        S3_FORCE_PATH_STYLE: 'true',
        S3_BUCKET: 'metadata',
        TYPEORM_SYNCHRONIZE: 'false',
        OIDC_ISSUER_URL: 'http://metadata.invalid/realms/metadata',
        OIDC_AUDIENCE: 'metadata',
        APP_BASE_URL: 'http://metadata.invalid',
        BFF_CLIENT_ID: 'metadata',
        BFF_CLIENT_SECRET: 'metadata-unused',
        SESSION_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
        KEYCLOAK_ORG_ADMIN_CLIENT_ID: 'metadata',
        KEYCLOAK_ORG_ADMIN_CLIENT_SECRET: 'metadata-unused',
        PAYMENTS_PROVIDER: 'stub',
        PAYMENTS_CREDIT_PACKS: '{}',
        PAYMENTS_CHECKOUT_URL: 'http://metadata.invalid/checkout',
        PAYMENTS_STUB_WEBHOOK_SECRET: 'metadata-unused',
    })
}
