import { test, expect } from '../support/privileged-login'
import { signOutFixture } from '../support/hosted-mfa-login'

for (const identity of ['owner', 'platformOperator'] as const) {
    test(`${identity} completes a real MFA browser login`, async ({ loginAs }) => {
        const page = await loginAs(identity)
        await expect(page).toHaveTitle('Your workspace | Lead Email Finder')
        await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
        await signOutFixture(page)
    })
}
