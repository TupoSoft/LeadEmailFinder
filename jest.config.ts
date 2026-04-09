import type { Config } from 'jest'

const config: Config = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': '@swc/jest',
    },
    collectCoverageFrom: ['**/*.(t|j)s'],
    coverageDirectory: '../coverage',
    testEnvironment: 'node',
    moduleNameMapper: {
        '@tuposoft/lead-email-finder/redis': '<rootDir>/libs/redis/src',
        '@tuposoft/lead-email-finder/key': '<rootDir>/libs/key/src',
        '@tuposoft/lead-email-finder/socket': '<rootDir>/libs/socket/src',
        '@tuposoft/lead-email-finder/dns': '<rootDir>/libs/dns/src',
        '@tuposoft/lead-email-finder/catch-all': '<rootDir>/libs/catch-all/src',
        '@tuposoft/lead-email-finder/common': '<rootDir>/libs/common/src',
        '@tuposoft/lead-email-finder/proto': '<rootDir>/libs/proto/src',
        '@tuposoft/lead-email-finder/grpc': '<rootDir>/libs/grpc/src',
        '@tuposoft/lead-email-finder/modules/api-key': '<rootDir>/libs/modules/api-key/src',
        '@tuposoft/lead-email-finder/redis/(.*)': '<rootDir>/libs/redis/src/$1',
        '@tuposoft/lead-email-finder/key/(.*)': '<rootDir>/libs/key/src/$1',
        '@tuposoft/lead-email-finder/socket/(.*)': '<rootDir>/libs/socket/src/$1',
        '@tuposoft/lead-email-finder/dns/(.*)': '<rootDir>/libs/dns/src/$1',
        '@tuposoft/lead-email-finder/catch-all/(.*)': '<rootDir>/libs/catch-all/src/$1',
        '@tuposoft/lead-email-finder/common/(.*)': '<rootDir>/libs/common/src/$1',
        '@tuposoft/lead-email-finder/proto/(.*)': '<rootDir>/libs/proto/src/$1',
        '@tuposoft/lead-email-finder/grpc/(.*)': '<rootDir>/libs/grpc/src/$1',
        '@tuposoft/lead-email-finder/modules/api-key/(.*)': '<rootDir>/libs/modules/api-key/src/$1',
        '@tuposoft/lead-email-finder/config': '<rootDir>/libs/config/src',
        '@tuposoft/lead-email-finder/config/(.*)': '<rootDir>/libs/config/src/$1',
    },
}

export default config
