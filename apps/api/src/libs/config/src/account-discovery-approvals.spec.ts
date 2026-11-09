import { resolve } from 'node:path'
import { loadAccountDiscoveryApprovals } from './account-discovery-approvals'

describe('loadAccountDiscoveryApprovals', () => {
    it('loads the repository manifest from the API workspace working directory', async () => {
        const previousDirectory = process.cwd()
        process.chdir(resolve(__dirname, '../../../..'))

        try {
            await expect(loadAccountDiscoveryApprovals()).resolves.toMatchObject({
                schemaVersion: 1,
                approvals: expect.any(Array),
            })
        } finally {
            process.chdir(previousDirectory)
        }
    })
})
