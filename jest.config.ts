import type { Config } from 'jest'

const config: Config = {
    modulePathIgnorePatterns: ['<rootDir>/nest/'],
    preset: 'ts-jest',
    testEnvironment: 'node',
}

export default config
