/**
 * Mock for @emurgo/cardano-serialization-lib-browser
 * Used in test environment to avoid WASM loading issues
 */

import { vi } from 'vitest'

export const Address = {
  from_bech32: vi.fn().mockReturnValue({}),
  from_bytes: vi.fn().mockReturnValue({
    to_bech32: vi.fn().mockReturnValue('addr_test1234567890abcdef'),
    payment_cred: vi.fn().mockReturnValue({
      to_keyhash: vi.fn().mockReturnValue({
        to_bytes: vi.fn().mockReturnValue(new Uint8Array(28))
      })
    })
  }),
  new: vi.fn().mockReturnValue({})
}

export const TransactionBuilder = {
  new: vi.fn().mockReturnValue({
    add_input: vi.fn(),
    add_output: vi.fn(),
    build: vi.fn().mockReturnValue({
      to_bytes: vi.fn().mockReturnValue(new Uint8Array(100))
    })
  })
}

export const BigNum = {
  from_str: vi.fn().mockReturnValue({}),
  zero: vi.fn().mockReturnValue({})
}

export const TransactionInput = {
  new: vi.fn().mockReturnValue({})
}

export const TransactionOutput = {
  new: vi.fn().mockReturnValue({})
}

export const Value = {
  new: vi.fn().mockReturnValue({}),
  coin: vi.fn().mockReturnValue({})
}

export const TransactionHash = {
  from_bytes: vi.fn().mockReturnValue({})
}

export const hash_transaction = vi.fn().mockReturnValue({
  to_bytes: vi.fn().mockReturnValue(new Uint8Array(32))
})

// Default export for dynamic imports
const CSL = {
  Address,
  TransactionBuilder,
  BigNum,
  TransactionInput,
  TransactionOutput,
  Value,
  TransactionHash,
  hash_transaction
}

export default CSL