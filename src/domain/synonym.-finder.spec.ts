import { HTMLSynonymFinder } from './synonym-finder';
import type { HttpClient } from '../http-client'; // Adjust the path as necessary
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('HTMLSynonymFinder', () => {
    let finder: HTMLSynonymFinder;
    let httpClientMock: jest.Mocked<HttpClient>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create a mock for HttpClient
        httpClientMock = {
            get: jest.fn(),
            post: jest.fn(),
        } as jest.Mocked<HttpClient>;;

        // Instantiate HTMLSynonymFinder with the mocked HttpClient
        finder = new HTMLSynonymFinder(httpClientMock);
    });

    it('should return an empty array if homepage has no emails', async () => {
        // Mock the homepage response with no emails
        httpClientMock.get.mockResolvedValueOnce('<html><body>No emails here</body></html>');

        const results = await finder.findSynonymDomains('http://fakeurl.com');
        expect(results).toEqual([]);
    });

    it('should return domains from homepage if found', async () => {
        // Mock the homepage response to contain one email
        httpClientMock.get.mockResolvedValueOnce('<html><body>Email me at hello@gmail.com</body></html>');

        // Mock subsequent calls (e.g., contact/privacy links) to have no additional emails
        httpClientMock.get.mockResolvedValueOnce('<html><body>No more emails</body></html>');

        const results = await finder.findSynonymDomains('http://fakeurl.com');
        expect(results).toContain('gmail.com');
        expect(results.length).toBe(1);
    });

    it('should follow contact and privacy links and parse them too', async () => {
        // 1) Mock the homepage with references to contact/privacy links + an email
        httpClientMock.get.mockResolvedValueOnce(`
            <html>
                <body>
                    <a href="/contact">Contact</a>
                    <a href="/privacy-policy">Privacy</a>
                    <p>Homepage email: user1@example.com</p>
                </body>
            </html>
        `);

        // 2) Mock the Contact page
        httpClientMock.get.mockResolvedValueOnce(`
            <html>
                <body>
                    <p>Contact page email: support@example.org</p>
                </body>
            </html>
        `);

        // 3) Mock the Privacy page
        httpClientMock.get.mockResolvedValueOnce(`
            <html>
                <body>
                    <p>Privacy page email: privacy@example.net</p>
                </body>
            </html>
        `);

        const results = await finder.findSynonymDomains('http://fakeurl.com');
        expect(results).toEqual(
            expect.arrayContaining(['example.com', 'example.org', 'example.net'])
        );
        expect(results.length).toBe(3);
    });

    it('should throw an error if homepage cannot be fetched', async () => {
        // Mock a network error
        httpClientMock.get.mockRejectedValueOnce(new Error('Network Error'));

        await expect(finder.findSynonymDomains('http://unreachable.com'))
            .rejects
            .toThrow('No website found or failed to fetch domain: http://unreachable.com');
    });
});
