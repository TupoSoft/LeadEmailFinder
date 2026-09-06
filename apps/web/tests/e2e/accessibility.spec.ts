import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const route of ['/', '/unknown-route']) {
    test(`${route} has no serious or critical automated accessibility violations`, async ({ page }) => {
        await page.goto(route)

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
            .analyze()
        const blockingViolations = results.violations.filter(
            violation => violation.impact === 'serious' || violation.impact === 'critical',
        )

        expect(blockingViolations).toEqual([])
    })
}
