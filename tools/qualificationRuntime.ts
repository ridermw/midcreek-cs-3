import { registerHooks } from 'node:module'
import { extname } from 'node:path'

const sourceRoot = new URL('../src/', import.meta.url).href

// The browser source uses bundler-style relative imports. Resolve only that source graph for Node CLI consumers.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && /^\.{1,2}\//.test(specifier) && !extname(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})
