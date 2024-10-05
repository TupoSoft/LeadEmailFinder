import { beforeEach, describe, it, mock } from 'node:test'
import assert from 'node:assert'
import axios, { AxiosError } from 'axios'

import {
    CatchAllVerificationError,
    type CatchAllVerificationResult,
    CatchAllVerifier,
    type MicrosoftError,
    type MimecastResponse,
} from './catch-all'
import { AxiosHttpClient } from '../../../infrastructure/AxiosHttpClient'

const axiosHttpClient = new AxiosHttpClient(axios)
const catchAllVerifier = new CatchAllVerifier(axiosHttpClient)

void describe('CatchAllVerifier', async () => {
    let mockedGet = mock.method(axiosHttpClient, 'get')
    let mockedPost = mock.method(axiosHttpClient, 'post')

    beforeEach(_ => {
        mockedGet = mock.method(axiosHttpClient, 'get')
        mockedPost = mock.method(axiosHttpClient, 'post')
    })

    await describe('microsoftGetCreds', async () => {
        await it('happy case', async () => {
            // @ts-expect-error mock
            mockedPost.mock.mockImplementationOnce(async () => {
                return {
                    IfExistsResult: 0,
                }
            })

            const result = await catchAllVerifier.microsoftGetCreds('hello@example.com')
            assert.deepStrictEqual(result, {
                success: true,
                source: 'MicrosoftGetCredentialType',
            })
        })

        await it('unhappy case', async () => {
            // @ts-expect-error mock
            mockedPost.mock.mockImplementationOnce(async () => {
                return {
                    IfExistsResult: 1,
                }
            })

            await assert.rejects(
                async () => {
                    await catchAllVerifier.microsoftGetCreds('hello@example.com')
                },
                new CatchAllVerificationError({
                    success: false,
                    source: 'MicrosoftGetCredentialType',
                }),
            )
        })
    })

    await describe('microsoftLogin', async () => {
        await it('happy case', async () => {
            mockedPost.mock.mockImplementationOnce(async () => {
                throw new AxiosError<MicrosoftError>(undefined, undefined, undefined, undefined, {
                    // @ts-expect-error Skip redundant axios response object properties
                    data: {
                        error_codes: [50126],
                    },
                })
            })

            const result = await catchAllVerifier.microsoftLogin('hello@example.com')
            assert.deepStrictEqual(result, {
                success: true,
                source: 'MicrosoftLogin',
            })
        })

        await it('unhappy case', async () => {
            mockedPost.mock.mockImplementationOnce(async () => {
                throw new AxiosError<MicrosoftError>(undefined, undefined, undefined, undefined, {
                    // @ts-expect-error Skip redundant axios response object properties
                    data: {
                        error_codes: [50125],
                    },
                })
            }, 0)

            await assert.rejects(
                async () => await catchAllVerifier.microsoftLogin('hello@example.com'),
                new CatchAllVerificationError({
                    success: false,
                    source: 'MicrosoftLogin',
                }),
            )
        })
    })

    await describe('mimecastLogin', async () => {
        const email = 'foobar@example.com'

        const validResponse: MimecastResponse = {
            data: [
                {
                    authenticate: ['Basic-Cloud'],
                    emailAddress: email,
                    emailToken: 'token',
                },
            ],
        }

        const invalidResponse: MimecastResponse = {
            data: [
                {
                    authenticate: ['JWT'],
                    emailAddress: email,
                    emailToken: 'token',
                },
            ],
        }

        await it('happy case', async () => {
            // @ts-expect-error mock
            mockedPost.mock.mockImplementationOnce(async () => validResponse, 0)
            // @ts-expect-error mock
            mockedPost.mock.mockImplementationOnce(async () => invalidResponse, 1)

            assert.deepStrictEqual(await catchAllVerifier.mimecastLogin('hello@example.com'), {
                success: true,
                source: 'MimecastLogin',
            })
        })

        await it('unhappy case', async () => {
            // @ts-expect-error mock
            mockedPost.mock.mockImplementation(async () => invalidResponse)

            await assert.rejects(async () => await catchAllVerifier.mimecastLogin('hello@example.com'), AggregateError)
        })
    })

    await describe('officeapps', async () => {
        await it('happy case', async () => {
            // @ts-expect-error mock
            mockedGet.mock.mockImplementationOnce(async () => 'MSAccount')

            const result = await catchAllVerifier.officeapps('hello@example.com')
            assert.deepStrictEqual(result, {
                success: true,
                source: 'OfficeApps',
            })
        })

        await it('unhappy case', async () => {
            // @ts-expect-error mock
            mockedGet.mock.mockImplementationOnce(async () => 'Neither')

            await assert.rejects(
                async () => await catchAllVerifier.officeapps('hello@example.com'),
                new CatchAllVerificationError({
                    success: false,
                    source: 'OfficeApps',
                }),
            )
        })
    })

    await describe('linkedin', async () => {
        await it('happy case', async () => {
            mockedPost.mock.mockImplementationOnce(async () => {
                const error = new AxiosError()
                error.status = 400
                throw error
            })

            const actual = await catchAllVerifier.linkedinLogin('hello@example.com')
            const expected: CatchAllVerificationResult = {
                success: true,
                source: 'LinkedInLogin',
            }

            assert.deepStrictEqual(actual, expected)
        })

        await it('unhappy case', async () => {
            await assert.rejects(
                async () => await catchAllVerifier.linkedinLogin('hello@example.com'),
                new CatchAllVerificationError({
                    source: 'LinkedInLogin',
                    success: false,
                }),
            )
        })
    })
})
