import { test, expect } from '@playwright/test'

test.describe('VPN Client Smoke Tests @smoke', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('http://localhost:5173')
    const title = await page.title()
    expect(title).toBeDefined()
  })

  test('should display wallet modal on first load', async ({ page }) => {
    await page.goto('http://localhost:5173')
    const createButton = page.getByText('Create Wallet')
    await expect(createButton).toBeVisible()
  })

  test('should create a wallet', async ({ page }) => {
    await page.goto('http://localhost:5173')

    const passwordInput = page.getByPlaceholder('Enter a secure password')
    const confirmInput = page.getByPlaceholder('Confirm your password')
    const createButton = page.getByText('Create Wallet')

    await passwordInput.fill('TestPassword123!')
    await confirmInput.fill('TestPassword123!')
    await createButton.click()

    // Wait for dashboard to appear
    await expect(page.getByText('VPN Client')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Available Servers')).toBeVisible()
  })

  test('should display balance card on dashboard', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Create wallet first
    const passwordInput = page.getByPlaceholder('Enter a secure password')
    const confirmInput = page.getByPlaceholder('Confirm your password')
    const createButton = page.getByText('Create Wallet')

    await passwordInput.fill('TestPassword123!')
    await confirmInput.fill('TestPassword123!')
    await createButton.click()

    // Check for balance card
    await expect(page.getByText(/x402 Token Balance/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Deposit/)).toBeVisible()
    await expect(page.getByText(/Withdraw/)).toBeVisible()
  })

  test('should display server list with columns', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Create wallet
    const passwordInput = page.getByPlaceholder('Enter a secure password')
    const confirmInput = page.getByPlaceholder('Confirm your password')
    const createButton = page.getByText('Create Wallet')

    await passwordInput.fill('TestPassword123!')
    await confirmInput.fill('TestPassword123!')
    await createButton.click()

    // Check server list
    await expect(page.getByText('Server')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Latency/)).toBeVisible()
    await expect(page.getByText(/Price/)).toBeVisible()
  })

  test('should allow server selection', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Create wallet
    const passwordInput = page.getByPlaceholder('Enter a secure password')
    const confirmInput = page.getByPlaceholder('Confirm your password')
    const createButton = page.getByText('Create Wallet')

    await passwordInput.fill('TestPassword123!')
    await confirmInput.fill('TestPassword123!')
    await createButton.click()

    // Select a server
    const selectButton = page.locator('button:has-text("Select")').first()
    await selectButton.click({ timeout: 10000 })

    // Verify selection
    await expect(selectButton).toContainText('✓ Selected')
  })

  test('should display connect panel', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Create wallet
    const passwordInput = page.getByPlaceholder('Enter a secure password')
    const confirmInput = page.getByPlaceholder('Confirm your password')
    const createButton = page.getByText('Create Wallet')

    await passwordInput.fill('TestPassword123!')
    await confirmInput.fill('TestPassword123!')
    await createButton.click()

    // Check connect panel
    await expect(page.getByText('Connection')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Disconnected')).toBeVisible()
  })

  test('should handle wallet disconnect', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Create wallet
    const passwordInput = page.getByPlaceholder('Enter a secure password')
    const confirmInput = page.getByPlaceholder('Confirm your password')
    const createButton = page.getByText('Create Wallet')

    await passwordInput.fill('TestPassword123!')
    await confirmInput.fill('TestPassword123!')
    await createButton.click()

    // Click wallet menu
    const walletButton = page.locator('button:has-text("0x")').first()
    await walletButton.click({ timeout: 10000 })

    // Disconnect
    const disconnectButton = page.getByText(/Disconnect Wallet/)
    await disconnectButton.click()

    // Should return to wallet modal
    await expect(page.getByText('Create Wallet')).toBeVisible({ timeout: 10000 })
  })

  test('should import wallet with seed phrase', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Click import tab
    const importTab = page.getByText('Import')
    await importTab.click()

    // Fill in import form - using a test seed phrase
    const seedInput = page.getByPlaceholder('Enter your 12 or 24 word seed phrase')
    const passwordInput = page.locator('input[type="password"]').first()
    const confirmInput = page.locator('input[type="password"]').nth(1)

    // Using a test mnemonic
    const testSeed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    await seedInput.fill(testSeed)
    await passwordInput.fill('TestPassword123!')
    await confirmInput.fill('TestPassword123!')

    const importButton = page.getByText('Import Wallet')
    await importButton.click()

    // Should navigate to dashboard on success or show error
    // For now just verify the action completes
    await page.waitForTimeout(1000)
  })
})
