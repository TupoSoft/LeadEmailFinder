import type { Config } from 'jest'

const config: Config = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    testRegex: '.*\\.spec\\.ts$',
    testPathIgnorePatterns: ['<rootDir>/apps/web/'],
    coveragePathIgnorePatterns: ['<rootDir>/apps/web/'],
    transform: {
        '^.+\\.(t|j)s$': '@swc/jest',
    },
    collectCoverageFrom: ['**/*.(t|j)s'],
    coverageDirectory: '../coverage',
    testEnvironment: 'node',
    // Wildcard ("/(.*)") entries must come before their bare counterparts: jest's moduleNameMapper
    // uses the first regex that matches, and a bare entry has no capture group, so if it matched
    // first it would collapse any deep import under that path down to the bare mapped directory,
    // silently discarding the rest of the specifier.
    moduleNameMapper: {
        '@tuposoft/lead-email-finder/redis/(.*)': '<rootDir>/src/libs/redis/src/$1',
        '@tuposoft/lead-email-finder/keycloak-admin-http/(.*)': '<rootDir>/src/libs/keycloak-admin-http/src/$1',
        '@tuposoft/lead-email-finder/socket/(.*)': '<rootDir>/src/libs/socket/src/$1',
        '@tuposoft/lead-email-finder/dns/(.*)': '<rootDir>/src/libs/dns/src/$1',
        '@tuposoft/lead-email-finder/common/(.*)': '<rootDir>/src/libs/common/src/$1',
        '@tuposoft/lead-email-finder/modules/credits/(.*)': '<rootDir>/src/libs/modules/credits/src/$1',
        '@tuposoft/lead-email-finder/modules/email-verification/(.*)':
            '<rootDir>/src/libs/modules/email-verification/src/$1',
        '@tuposoft/lead-email-finder/modules/identity/(.*)': '<rootDir>/src/libs/modules/identity/src/$1',
        '@tuposoft/lead-email-finder/modules/organization-onboarding/(.*)':
            '<rootDir>/src/libs/modules/organization-onboarding/src/$1',
        '@tuposoft/lead-email-finder/modules/service-client-management/(.*)':
            '<rootDir>/src/libs/modules/service-client-management/src/$1',
        '@tuposoft/lead-email-finder/modules/payments/(.*)': '<rootDir>/src/libs/modules/payments/src/$1',
        '@tuposoft/lead-email-finder/modules/proxy/(.*)': '<rootDir>/src/libs/modules/proxy/src/$1',
        '@tuposoft/lead-email-finder/config/(.*)': '<rootDir>/src/libs/config/src/$1',
        '@tuposoft/lead-email-finder/redis': '<rootDir>/src/libs/redis/src',
        '@tuposoft/lead-email-finder/keycloak-admin-http': '<rootDir>/src/libs/keycloak-admin-http/src',
        '@tuposoft/lead-email-finder/socket': '<rootDir>/src/libs/socket/src',
        '@tuposoft/lead-email-finder/dns': '<rootDir>/src/libs/dns/src',
        '@tuposoft/lead-email-finder/common': '<rootDir>/src/libs/common/src',
        '@tuposoft/lead-email-finder/modules/auth': '<rootDir>/src/libs/modules/auth/src',
        '@tuposoft/lead-email-finder/modules/bff-session': '<rootDir>/src/libs/modules/bff-session/src',
        '@tuposoft/lead-email-finder/modules/credits': '<rootDir>/src/libs/modules/credits/src',
        '@tuposoft/lead-email-finder/modules/email-verification':
            '<rootDir>/src/libs/modules/email-verification/src',
        '@tuposoft/lead-email-finder/modules/identity': '<rootDir>/src/libs/modules/identity/src',
        '@tuposoft/lead-email-finder/modules/organization-onboarding':
            '<rootDir>/src/libs/modules/organization-onboarding/src',
        '@tuposoft/lead-email-finder/modules/service-client-management':
            '<rootDir>/src/libs/modules/service-client-management/src',
        '@tuposoft/lead-email-finder/modules/payments': '<rootDir>/src/libs/modules/payments/src',
        '@tuposoft/lead-email-finder/modules/proxy': '<rootDir>/src/libs/modules/proxy/src',
        '@tuposoft/lead-email-finder/config': '<rootDir>/src/libs/config/src',
    },
}

export default config
