import { jest } from '@jest/globals'
import type { authenticate as realAuthenticate } from '../authenticate'

export const authenticate: typeof realAuthenticate = jest
    .fn<typeof authenticate>()
    .mockImplementation((req, res, next) => {
        next()
    })
