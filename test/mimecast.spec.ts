import {mimecast_login, MimecastLoginResult} from "../source/mimecast";

describe('mimecast login', () => {
    test('valid', async () => {
        const result = await mimecast_login('mmceuen@mainsailpartners.com')
        expect(result).toBe(MimecastLoginResult.Valid);
    })
});
