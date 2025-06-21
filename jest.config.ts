import type { Config } from 'jest'

const config: Config = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    collectCoverageFrom: ['**/*.(t|j)s'],
    coverageDirectory: '../coverage',
    testEnvironment: 'node',
    moduleNameMapper: {
        '@tuposoft/lead-email-finder/redis': '<rootDir>/libs/redis/src/$1',
        '@tuposoft/lead-email-finder/key': '<rootDir>/libs/key/src/$1',
        '@tuposoft/lead-email-finder/socket': '<rootDir>/libs/socket/src/$1',
        '@tuposoft/lead-email-finder/dns': '<rootDir>/libs/dns/src/$1',
        '@tuposoft/lead-email-finder/catch-all': '<rootDir>/libs/catch-all/src/$1',
        '@tuposoft/lead-email-finder/common': '<rootDir>/libs/common/src/$1',
        '@tuposoft/lead-email-finder/proto': '<rootDir>/libs/proto/src/$1',
        '@tuposoft/lead-email-finder/grpc': '<rootDir>/libs/grpc/src/$1',
    },
}

export default config
