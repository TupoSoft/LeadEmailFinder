import { beforeEach, describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { CatchAllVerifier, type MicrosoftError, type MimecastResponse } from './CatchAllVerifier'
import { AxiosHttpClient } from '../../../infrastructure/AxiosHttpClient'
import axios, { AxiosError } from 'axios'

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
            assert.strictEqual(result, true)
        })

        await it('unhappy case', async () => {
            // @ts-expect-error mock
            mockedPost.mock.mockImplementationOnce(async () => {
                return {
                    IfExistsResult: 1,
                }
            })

            const result = await catchAllVerifier.microsoftGetCreds('hello@example.com')
            assert.strictEqual(result, false)
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
            assert.strictEqual(result, true)
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

            const result = await catchAllVerifier.microsoftLogin('hello@example.com')
            assert.strictEqual(result, false)
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

            const result = await catchAllVerifier.mimecastLogin('hello@example.com')
            assert.strictEqual(result, true)
        })

        await it('unhappy case', async () => {
            // @ts-expect-error mock
            mockedPost.mock.mockImplementation(async () => invalidResponse)

            const result = await catchAllVerifier.mimecastLogin('hello@example.com')
            assert.strictEqual(result, false)
        })
    })

    await describe('officeapps', async () => {
        await it('happy case', async () => {
            // @ts-expect-error mock
            mockedGet.mock.mockImplementationOnce(async () => 'MSAccount')

            const result = await catchAllVerifier.officeapps('hello@example.com')
            assert.strictEqual(result, true)
        })

        await it('unhappy case', async () => {
            // @ts-expect-error mock
            mockedGet.mock.mockImplementationOnce(async () => 'Neither')

            const result = await catchAllVerifier.officeapps('hello@example.com')
            assert.strictEqual(result, false)
        })
    })
})
