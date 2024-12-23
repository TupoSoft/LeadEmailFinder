// HTMLSynonymFinder.test.ts

import { HTMLSynonymFinder } from './synonym-finder';
import axios from 'axios';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mock 'axios' once at the top
jest.mock('axios');

describe('HTMLSynonymFinder', () => {
    let finder: HTMLSynonymFinder;
    const mockedAxios = axios as jest.Mocked<typeof axios>;

    beforeEach(() => {
        jest.clearAllMocks();
        finder = new HTMLSynonymFinder();
    });

    it('should return an empty array if homepage has no emails', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: '<html><body>No emails here</body></html>',
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {}
        });
        
        const results = await finder.findSynonymDomains('http://fakeurl.com');
        expect(results).toEqual([]);
    });

    it('should return domains from homepage if found', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            status: 200,
            data: '<html><body>Email me at hello@gmail.com</body></html>',
            statusText: 'OK',
            headers: {},
            config: {}
        });

        mockedAxios.get.mockResolvedValue({
            status: 200,
            data: '<html><body>No more emails</body></html>',
            statusText: 'OK',
            headers: {},
            config: {}
        });

        const results = await finder.findSynonymDomains('http://fakeurl.com');
        expect(results).toContain('gmail.com');
        expect(results.length).toBe(1);
    });

    it('should follow contact and privacy links and parse them too', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            status: 200,
            data: `
                <html>
                    <body>
                        <a href="/contact">Contact</a>
                        <a href="/privacy-policy">Privacy</a>
                        <p>Homepage email: user1@example.com</p>
                    </body>
                </html>`,
            statusText: 'OK',
            headers: {},
            config: {}
        });

        mockedAxios.get.mockResolvedValueOnce({
            status: 200,
            data: `
                <html>
                    <body>
                        <p>Contact page email: support@example.org</p>
                    </body>
                </html>`,
            statusText: 'OK',
            headers: {},
            config: {}
        });

        mockedAxios.get.mockResolvedValueOnce({
            status: 200,
            data: `
                <html>
                    <body>
                        <p>Privacy page email: privacy@example.net</p>
                    </body>
                </html>`,
            statusText: 'OK',
            headers: {},
            config: {}
        });

        const results = await finder.findSynonymDomains('http://fakeurl.com');
        expect(results).toEqual(
            expect.arrayContaining(['example.com', 'example.org', 'example.net'])
        );
        expect(results.length).toBe(3);
    });

    it('should throw an error if homepage cannot be fetched', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

        await expect(finder.findSynonymDomains('http://unreachable.com'))
            .rejects
            .toThrow('No website found or failed to fetch domain: http://unreachable.com');
    });
});
