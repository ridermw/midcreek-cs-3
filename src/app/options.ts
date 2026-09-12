import { ContractError } from '../assets/contracts'

export function normalizeGameSeed(seed: number | undefined): number {
  const value = seed ?? 417
  if (!Number.isSafeInteger(value)) {
    throw new ContractError('SEED', String(value), 'expected a finite safe integer')
  }
  return value
}
