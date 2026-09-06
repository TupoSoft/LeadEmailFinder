import { expect, type Locator, type Page } from '@playwright/test'

export async function expectNextTabStop(page: Page, accessibleName: string): Promise<Locator> {
    await page.keyboard.press('Tab')

    const link = page.getByRole('link', { name: accessibleName, exact: true })
    await expect(link).toBeFocused()

    const focusStyle = await link.evaluate(element => {
        const style = getComputedStyle(element)

        return {
            outlineStyle: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
        }
    })

    expect(focusStyle.outlineStyle).not.toBe('none')
    expect(focusStyle.outlineWidth).toBeGreaterThan(0)

    return link
}
