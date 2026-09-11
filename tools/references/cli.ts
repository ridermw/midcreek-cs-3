import { parseArgs } from 'node:util'
import { ReferenceError, requireReference } from './contracts.ts'

export function cliArguments(required: string[]): Record<string, string> {
  const options = Object.fromEntries(required.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ options, strict: true, allowPositionals: false })
  const result: Record<string, string> = {}
  for (const name of required) {
    const value = values[name]
    requireReference(typeof value === 'string' && value.length > 0, 'CLI_ARGUMENT', `--${name}`, 'explicit nonempty argument required')
    requireReference(process.argv.slice(2).filter((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`)).length === 1,
      'CLI_ARGUMENT', `--${name}`, 'duplicate argument rejected')
    result[name] = value
  }
  return result
}

export function reportCliError(error: unknown): void {
  console.error(error instanceof ReferenceError ? error.message
    : `REFERENCE_IO: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
