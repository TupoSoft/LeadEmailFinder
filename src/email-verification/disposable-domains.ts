import disposableEmailArray from './disposable-email-providers.json';

const DISPOSABLE_EMAIL_PROVIDERS = new Set(disposableEmailArray);

export function isDisposableDomain(domain: string): boolean {
    return DISPOSABLE_EMAIL_PROVIDERS.has(domain);
}
