import { fileURLToPath } from 'node:url'
import type { Config } from 'jest'

const config: Config = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    testRegex: '.*\\.spec\\.ts$',
    testPathIgnorePatterns: ['<rootDir>/apps/web/'],
    coveragePathIgnorePatterns: ['<rootDir>/apps/web/'],
    transform: {
        '^.+\\.(t|j)s$': ['@swc/jest', { configFile: fileURLToPath(new URL('./apps/api/.swcrc', import.meta.url)) }],
    },
    collectCoverageFrom: ['**/*.(t|j)s'],
    coverageDirectory: '../coverage',
    testEnvironment: 'node',
    // Wildcard ("/(.*)") entries must come before their bare counterparts: jest's moduleNameMapper
    // uses the first regex that matches, and a bare entry has no capture group, so if it matched
    // first it would collapse any deep import under that path down to the bare mapped directory,
    // silently discarding the rest of the specifier.
    moduleNameMapper: {
        // NodeNext packages (e.g. apps/mcp-server) require explicit .js extensions on relative
        // imports even though the source files are .ts; strip the extension so Jest resolves them.
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '@tuposoft/lead-email-finder/redis/(.*)': '<rootDir>/apps/api/src/libs/redis/src/$1',
        '@tuposoft/lead-email-finder/keycloak-admin-http/(.*)': '<rootDir>/apps/api/src/libs/keycloak-admin-http/src/$1',
        '@tuposoft/lead-email-finder/socket/(.*)': '<rootDir>/apps/api/src/libs/socket/src/$1',
        '@tuposoft/lead-email-finder/dns/(.*)': '<rootDir>/apps/api/src/libs/dns/src/$1',
        '@tuposoft/lead-email-finder/common/(.*)': '<rootDir>/apps/api/src/libs/common/src/$1',
        '@tuposoft/lead-email-finder/modules/credits/(.*)': '<rootDir>/apps/api/src/libs/modules/credits/src/$1',
        '@tuposoft/lead-email-finder/modules/email-verification/(.*)':
            '<rootDir>/apps/api/src/libs/modules/email-verification/src/$1',
        '@tuposoft/lead-email-finder/modules/identity/(.*)': '<rootDir>/apps/api/src/libs/modules/identity/src/$1',
        '@tuposoft/lead-email-finder/modules/organization-onboarding/(.*)':
            '<rootDir>/apps/api/src/libs/modules/organization-onboarding/src/$1',
        '@tuposoft/lead-email-finder/modules/service-client-management/(.*)':
            '<rootDir>/apps/api/src/libs/modules/service-client-management/src/$1',
        '@tuposoft/lead-email-finder/modules/payments/(.*)': '<rootDir>/apps/api/src/libs/modules/payments/src/$1',
        '@tuposoft/lead-email-finder/modules/proxy/(.*)': '<rootDir>/apps/api/src/libs/modules/proxy/src/$1',
        '@tuposoft/lead-email-finder/config/(.*)': '<rootDir>/apps/api/src/libs/config/src/$1',
        '@tuposoft/lead-email-finder/better-auth': '<rootDir>/apps/api/src/libs/better-auth/src',
        '@tuposoft/lead-email-finder/redis': '<rootDir>/apps/api/src/libs/redis/src',
        '@tuposoft/lead-email-finder/keycloak-admin-http': '<rootDir>/apps/api/src/libs/keycloak-admin-http/src',
        '@tuposoft/lead-email-finder/socket': '<rootDir>/apps/api/src/libs/socket/src',
        '@tuposoft/lead-email-finder/dns': '<rootDir>/apps/api/src/libs/dns/src',
        '@tuposoft/lead-email-finder/common': '<rootDir>/apps/api/src/libs/common/src',
        '@tuposoft/lead-email-finder/modules/auth': '<rootDir>/apps/api/src/libs/modules/auth/src',
        '@tuposoft/lead-email-finder/modules/bff-session': '<rootDir>/apps/api/src/libs/modules/bff-session/src',
        '@tuposoft/lead-email-finder/modules/credits': '<rootDir>/apps/api/src/libs/modules/credits/src',
        '@tuposoft/lead-email-finder/modules/email-verification':
            '<rootDir>/apps/api/src/libs/modules/email-verification/src',
        '@tuposoft/lead-email-finder/modules/identity': '<rootDir>/apps/api/src/libs/modules/identity/src',
        '@tuposoft/lead-email-finder/modules/organization-onboarding':
            '<rootDir>/apps/api/src/libs/modules/organization-onboarding/src',
        '@tuposoft/lead-email-finder/modules/service-client-management':
            '<rootDir>/apps/api/src/libs/modules/service-client-management/src',
        '@tuposoft/lead-email-finder/modules/payments': '<rootDir>/apps/api/src/libs/modules/payments/src',
        '@tuposoft/lead-email-finder/modules/proxy': '<rootDir>/apps/api/src/libs/modules/proxy/src',
        '@tuposoft/lead-email-finder/config': '<rootDir>/apps/api/src/libs/config/src',
    },
}

export default config
