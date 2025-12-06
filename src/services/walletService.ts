import { ethers } from 'ethers'
import * as CryptoJS from 'crypto-js'
import { Wallet } from '../types/wallet'

const WALLET_STORAGE_KEY = 'vpn_wallet'

export async function generateWallet(password: string): Promise<Wallet> {
  const mnemonic = ethers.Mnemonic.entropyToMnemonic(ethers.randomBytes(16))
  const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0")

  const encryptedSeedPhrase = CryptoJS.AES.encrypt(mnemonic, password).toString()

  return {
    address: hdNode.address,
    source: 'in-app',
    isConnected: true,
    seedPhrase: mnemonic,
    encryptedSeedPhrase,
  }
}

export async function importWallet(seedPhrase: string, password: string): Promise<Wallet> {
  try {
    const mnemonic = ethers.Mnemonic.fromPhrase(seedPhrase)
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0")

    const encryptedSeedPhrase = CryptoJS.AES.encrypt(seedPhrase, password).toString()

    return {
      address: hdNode.address,
      source: 'in-app',
      isConnected: true,
      seedPhrase,
      encryptedSeedPhrase,
    }
  } catch (error) {
    throw new Error('Invalid seed phrase')
  }
}

export async function saveWalletSecurely(wallet: Wallet): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({
      address: wallet.address,
      source: wallet.source,
      encryptedSeedPhrase: wallet.encryptedSeedPhrase,
    }))
  }
}

export async function loadWalletSecurely(): Promise<Wallet | null> {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(WALLET_STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        return {
          address: data.address,
          source: data.source,
          isConnected: true,
          encryptedSeedPhrase: data.encryptedSeedPhrase,
        }
      } catch (error) {
        console.error('Failed to parse stored wallet:', error)
      }
    }
  }
  return null
}

export async function decryptWallet(
  encryptedSeedPhrase: string,
  password: string
): Promise<ethers.HDNodeWallet> {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedSeedPhrase, password).toString(
      CryptoJS.enc.Utf8
    )
    const mnemonic = ethers.Mnemonic.fromPhrase(decrypted)
    return ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0")
  } catch (error) {
    throw new Error('Failed to decrypt wallet. Invalid password?')
  }
}

export async function getWalletBalance(
  address: string,
  rpcUrl: string
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const balance = await provider.getBalance(address)
  return ethers.formatEther(balance)
}

export async function getERC20Balance(
  address: string,
  tokenAddress: string,
  rpcUrl: string
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const erc20ABI = ['function balanceOf(address) view returns (uint256)']
  const contract = new ethers.Contract(tokenAddress, erc20ABI, provider)
  const balance = await contract.balanceOf(address)
  return ethers.formatUnits(balance, 18)
}
