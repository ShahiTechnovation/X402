import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateWallet, importWallet, decryptWallet } from '../walletService'
import * as CryptoJS from 'crypto-js'

describe('walletService', () => {
  const testPassword = 'securePassword123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateWallet', () => {
    it('generates a valid wallet with address', async () => {
      const wallet = await generateWallet(testPassword)

      expect(wallet).toBeDefined()
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(wallet.source).toBe('in-app')
      expect(wallet.isConnected).toBe(true)
      expect(wallet.seedPhrase).toBeDefined()
      expect(wallet.encryptedSeedPhrase).toBeDefined()
    })

    it('creates different wallets each time', async () => {
      const wallet1 = await generateWallet(testPassword)
      const wallet2 = await generateWallet(testPassword)

      expect(wallet1.address).not.toBe(wallet2.address)
      expect(wallet1.seedPhrase).not.toBe(wallet2.seedPhrase)
    })

    it('encrypts seed phrase with password', async () => {
      const wallet = await generateWallet(testPassword)

      expect(wallet.encryptedSeedPhrase).toBeDefined()
      expect(wallet.encryptedSeedPhrase).not.toBe(wallet.seedPhrase)

      const decrypted = CryptoJS.AES.decrypt(
        wallet.encryptedSeedPhrase!,
        testPassword
      ).toString(CryptoJS.enc.Utf8)
      expect(decrypted).toBe(wallet.seedPhrase)
    })
  })

  describe('importWallet', () => {
    it('imports a valid seed phrase', async () => {
      const wallet1 = await generateWallet(testPassword)
      const wallet2 = await importWallet(wallet1.seedPhrase!, testPassword)

      expect(wallet2.address).toBe(wallet1.address)
      expect(wallet2.source).toBe('in-app')
      expect(wallet2.isConnected).toBe(true)
    })

    it('throws error for invalid seed phrase', async () => {
      await expect(
        importWallet('invalid seed phrase', testPassword)
      ).rejects.toThrow('Invalid seed phrase')
    })
  })

  describe('decryptWallet', () => {
    it('decrypts wallet with correct password', async () => {
      const wallet = await generateWallet(testPassword)
      const decrypted = await decryptWallet(wallet.encryptedSeedPhrase!, testPassword)

      expect(decrypted.address).toBe(wallet.address)
    })

    it('throws error with incorrect password', async () => {
      const wallet = await generateWallet(testPassword)
      await expect(
        decryptWallet(wallet.encryptedSeedPhrase!, 'wrongPassword')
      ).rejects.toThrow()
    })
  })
})
