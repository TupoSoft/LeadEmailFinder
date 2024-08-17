import { mimecastLogin, MimecastLoginResult } from '../source/mimecast'

describe('mimecast login', () => {
    test('valid', async () => {
        const result = await mimecastLogin('mmceuen@mainsailpartners.com')
        expect(result).toBe(MimecastLoginResult.Valid)
    })
})
