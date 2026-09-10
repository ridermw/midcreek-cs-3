export function assetUrl(path: string, base = import.meta.env.BASE_URL): string {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) {
    throw new Error(`INVALID_BASE: ${base}`)
  }
  if (path !== '' && !/^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\/?$/.test(path)) {
    throw new Error(`INVALID_ASSET_URL: ${path}`)
  }
  return base + path
}
