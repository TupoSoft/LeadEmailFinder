import { expect, test } from '@playwright/test'
import { expectNextTabStop } from './keyboard'

test.describe('not-found experience', () => {
    test('announces the missing page and recovers home through the complete keyboard order', async ({ page }) => {
        await page.goto('/this-page-does-not-exist')

        await expect(page).toHaveTitle('Page not found | Lead Email Finder')
        await expect(page.getByRole('heading', { level: 1, name: 'This signal ends here.' })).toBeVisible()

        for (const accessibleName of [
            'Skip to main content',
            'Lead Email Finder home',
            'How it works',
            'Signals',
            'Principles',
            'Back to home',
        ]) {
            await expectNextTabStop(page, accessibleName)
        }

        await page.keyboard.press('Enter')

        await expect(page).toHaveURL('/')
        await expect(page.getByRole('heading', { level: 1, name: 'Verify the signal before you send.' })).toBeVisible()
    })

    test('does not overflow at 320 or 390 CSS pixels', async ({ page }) => {
        for (const viewport of [
            { width: 320, height: 720 },
            { width: 390, height: 844 },
        ]) {
            await page.setViewportSize(viewport)
            await page.goto('/missing')

            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            )
            expect(overflow).toBeLessThanOrEqual(0)
        }
    })

    test('removes recovery-link motion when reduced motion is requested', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/missing')

        const motion = await page.getByRole('link', { name: 'Back to home' }).evaluate(element => ({
            scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
            transitionDuration: Number.parseFloat(getComputedStyle(element).transitionDuration),
        }))

        expect(motion.scrollBehavior).toBe('auto')
        expect(motion.transitionDuration).toBeLessThanOrEqual(0.001)
    })
})
