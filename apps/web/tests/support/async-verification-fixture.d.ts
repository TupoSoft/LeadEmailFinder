declare module '*scripts/bruno/async-verification-fixture.mjs' {
    export interface AsyncVerificationFixture {
        origin: string
        organizationId: string
        environment: Record<string, string>
        setBalance(amount: number): Promise<void>
    }
    export function withAsyncVerificationFixture<T>(
        checkoutRoot: string,
        execute: (fixture: AsyncVerificationFixture) => Promise<T>,
        options?: { useOrganizationAdmin?: boolean },
    ): Promise<T>
}
