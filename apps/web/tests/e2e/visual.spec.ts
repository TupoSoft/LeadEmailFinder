import { expect, test, type Page } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

async function expectProductFont(page: Page) {
    const font = await page.evaluate(async () => {
        await document.fonts.ready

        return {
            family: getComputedStyle(document.body).fontFamily,
            loaded: document.fonts.check('400 16px "Inter Variable"'),
        }
    })

    expect(font.family).toContain('Inter Variable')
    expect(font.loaded).toBe(true)
}

test('public entry matches its approved visual baseline', async ({ page }) => {
    await page.goto('/')
    await expectProductFont(page)

    await expect(page).toHaveScreenshot('public-entry.png', { fullPage: true })
})

test('not-found route matches its approved visual baseline', async ({ page }) => {
    await page.goto('/unknown-route')
    await expectProductFont(page)

    await expect(page).toHaveScreenshot('not-found.png', { fullPage: true })
})
