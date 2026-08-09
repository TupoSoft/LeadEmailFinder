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
        '@tuposoft/lead-email-finder/redis': '<rootDir>/src/libs/redis/src',
        '@tuposoft/lead-email-finder/key': '<rootDir>/src/libs/key/src',
        '@tuposoft/lead-email-finder/socket': '<rootDir>/src/libs/socket/src',
        '@tuposoft/lead-email-finder/dns': '<rootDir>/src/libs/dns/src',
        '@tuposoft/lead-email-finder/catch-all': '<rootDir>/src/libs/catch-all/src',
        '@tuposoft/lead-email-finder/common': '<rootDir>/src/libs/common/src',
        '@tuposoft/lead-email-finder/proto': '<rootDir>/src/libs/proto/src',
        '@tuposoft/lead-email-finder/grpc': '<rootDir>/src/libs/grpc/src',
        '@tuposoft/lead-email-finder/modules/api-key': '<rootDir>/src/libs/modules/api-key/src',
        '@tuposoft/lead-email-finder/redis/(.*)': '<rootDir>/src/libs/redis/src/$1',
        '@tuposoft/lead-email-finder/key/(.*)': '<rootDir>/src/libs/key/src/$1',
        '@tuposoft/lead-email-finder/socket/(.*)': '<rootDir>/src/libs/socket/src/$1',
        '@tuposoft/lead-email-finder/dns/(.*)': '<rootDir>/src/libs/dns/src/$1',
        '@tuposoft/lead-email-finder/catch-all/(.*)': '<rootDir>/src/libs/catch-all/src/$1',
        '@tuposoft/lead-email-finder/common/(.*)': '<rootDir>/src/libs/common/src/$1',
        '@tuposoft/lead-email-finder/proto/(.*)': '<rootDir>/src/libs/proto/src/$1',
        '@tuposoft/lead-email-finder/grpc/(.*)': '<rootDir>/src/libs/grpc/src/$1',
        '@tuposoft/lead-email-finder/modules/api-key/(.*)': '<rootDir>/src/libs/modules/api-key/src/$1',
        '@tuposoft/lead-email-finder/config': '<rootDir>/src/libs/config/src',
        '@tuposoft/lead-email-finder/database': '<rootDir>/src/libs/database/src',
        '@tuposoft/lead-email-finder/config/(.*)': '<rootDir>/src/libs/config/src/$1',
        '@tuposoft/lead-email-finder/database/(.*)': '<rootDir>/src/libs/database/src/$1',
    },
}

export default config
