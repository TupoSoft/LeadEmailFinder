import freeEmailArray from './free-email-providers.json';

const FREE_EMAIL_PROVIDERS = new Set(freeEmailArray);

export function isFreeDomain(domain: string): boolean {
    return FREE_EMAIL_PROVIDERS.has(domain);
}