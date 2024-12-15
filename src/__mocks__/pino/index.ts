import { jest } from '@jest/globals'
import type pino from 'pino'
import Mock = jest.Mock

const pinoFactory: Mock<typeof pino> = jest.fn<typeof pino>()

export default pinoFactory
