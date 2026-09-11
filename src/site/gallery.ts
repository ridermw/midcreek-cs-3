import { assetUrl } from '../shared/urls.ts'
import { AWAITING, parseGalleryIndex } from './content.ts'
import type { PublicArtwork } from './content.ts'

const PAGE_SIZE = 6
export function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`SITE_DOM: missing ${selector}`)
  return node
}
async function imageBlob(path: string, sha256: string, maxBytes: number, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(assetUrl(path), { signal, credentials: 'omit', redirect: 'error' })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error(`MEDIA_HTTP: ${response.status}`)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('MEDIA_SIZE: response exceeds approved size ceiling')
      chunks.push(value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const mime = path.endsWith('.webp') ? 'image/webp' : 'image/png'
  const blob = new Blob(chunks, { type: mime })
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((n) => n.toString(16).padStart(2, '0')).join('')
  if (hash !== sha256) throw new Error('MEDIA_HASH: changed approved bytes')
  signal.throwIfAborted()
  return blob
}
async function boundedText(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new Error('PUBLIC_INDEX_SIZE: response body required')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('PUBLIC_INDEX_SIZE: index exceeds ceiling')
      text += decoder.decode(value, { stream: true })
      signal.throwIfAborted()
    }
    return text + decoder.decode()
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}
async function decodedImage(path: string, hash: string, dimensions: readonly [number, number], signal: AbortSignal) {
  const blob = await imageBlob(path, hash, path.endsWith('.webp') ? 60_000 : 8_000_000, signal)
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.src = url
  const abort = () => {
    image.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    await image.decode()
    signal.throwIfAborted()
    if (image.naturalWidth !== dimensions[0] || image.naturalHeight !== dimensions[1]) throw new Error('MEDIA_DIMENSIONS: unexpected image')
    return { image, url }
  } catch (error) {
    image.removeAttribute('src'); URL.revokeObjectURL(url)
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export function initializeGallery(approved: boolean): void {
  const toggle = element<HTMLButtonElement>('#gallery-toggle')
  const panel = element('#gallery-panel')
  const status = element('#gallery-status')
  const list = element('#gallery-items')
  const retry = element<HTMLButtonElement>('#gallery-retry')
  const previous = element<HTMLButtonElement>('#gallery-previous')
  const next = element<HTMLButtonElement>('#gallery-next')
  const pageLabel = element('#gallery-page')
  const dialog = element<HTMLDialogElement>('#image-dialog')
  const dialogStatus = element('#dialog-status')
  const dialogImage = element<HTMLImageElement>('#original-image')
  const dialogRetry = element<HTMLButtonElement>('#dialog-retry')
  const imagePrevious = element<HTMLButtonElement>('#image-previous')
  const imageNext = element<HTMLButtonElement>('#image-next')
  let items: PublicArtwork[] = []
  let page = 0
  let opened = false
  let indexRequest: AbortController | undefined
  let selectionRequest: AbortController | undefined
  let selected = 0
  let selectionUrl: string | undefined
  let origin: HTMLElement | null = null
  let observer: IntersectionObserver | undefined
  let cardCleanups: (() => void)[] = []

  const cleanSelection = () => {
    selectionRequest?.abort()
    selectionRequest = undefined
    dialogImage.hidden = true
    dialogImage.setAttribute('src', '')
    if (selectionUrl) URL.revokeObjectURL(selectionUrl)
    selectionUrl = undefined
  }
  const closeSelection = () => {
    cleanSelection()
    if (dialog.open) dialog.close()
  }
  dialog.addEventListener('close', () => {
    cleanSelection()
    origin?.focus()
    origin = null
  })
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeSelection() })
  element('#dialog-close').addEventListener('click', closeSelection)

  const select = async (index: number) => {
    const art = items[index]
    if (!art) return
    cleanSelection()
    selected = index
    if (!dialog.open) {
      origin = document.activeElement instanceof HTMLElement ? document.activeElement : toggle
      dialog.showModal()
    }
    element('#dialog-title').textContent = art.title
    element('#dialog-caption').textContent = art.caption
    element('#dialog-credit').textContent = `${art.attribution} ${art.terms}`
    dialogImage.alt = `${art.displayRole}: ${art.title}`
    dialogStatus.textContent = 'Loading original...'
    dialogRetry.hidden = true
    imagePrevious.disabled = index === 0
    imageNext.disabled = index === items.length - 1
    const controller = new AbortController()
    selectionRequest = controller
    try {
      const result = await decodedImage(art.mediaUrl.original, art.sha256.source, [art.width, art.height], controller.signal)
      if (controller.signal.aborted || selectionRequest !== controller || !dialog.open) {
        URL.revokeObjectURL(result.url)
        return
      }
      selectionUrl = result.url
      dialogImage.src = result.url
      dialogImage.hidden = false
      dialogStatus.textContent = 'Original loaded.'
    } catch (error) {
      if (controller.signal.aborted) return
      console.error('GALLERY_ORIGINAL', error)
      dialogStatus.textContent = 'Original unavailable. Retry or choose another image.'
      dialogRetry.hidden = false
    }
  }
  dialogRetry.addEventListener('click', () => { void select(selected) })
  imagePrevious.addEventListener('click', () => { void select(selected - 1) })
  imageNext.addEventListener('click', () => { void select(selected + 1) })
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      void select(selected + (event.key === 'ArrowLeft' ? -1 : 1))
    }
  })

  const clearCards = () => {
    observer?.disconnect()
    for (const cleanup of cardCleanups) cleanup()
    cardCleanups = []
    list.replaceChildren()
  }
  const renderPage = (focus = false) => {
    clearCards()
    const loaders = new Map<Element, () => void>()
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer?.unobserve(entry.target)
        loaders.get(entry.target)?.()
      }
    }, { rootMargin: '0px', threshold: 0 })
    for (const [offset, art] of items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).entries()) {
      const card = document.createElement('li')
      card.className = 'gallery-card'
      const button = document.createElement('button')
      button.type = 'button'; button.className = 'gallery-select'
      button.setAttribute('aria-label', `View ${art.title}`)
      const title = document.createElement('span'); title.textContent = art.title
      const preview = document.createElement('span'); preview.className = 'thumbnail'
      const caption = document.createElement('p'); caption.textContent = art.caption
      const credit = document.createElement('p'); credit.className = 'credit'; credit.textContent = `${art.attribution} ${art.terms}`
      const message = document.createElement('p'); message.setAttribute('role', 'status'); message.textContent = 'Preview loads when visible.'
      const retryThumb = document.createElement('button')
      retryThumb.type = 'button'; retryThumb.textContent = 'Retry thumbnail'; retryThumb.hidden = true
      let controller: AbortController | undefined
      let blobUrl: string | undefined
      const cleanup = () => {
        controller?.abort()
        preview.replaceChildren()
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        blobUrl = undefined
      }
      cardCleanups.push(cleanup)
      const load = async () => {
        cleanup()
        controller = new AbortController()
        const current = controller
        retryThumb.hidden = true
        message.textContent = 'Loading thumbnail...'
        try {
          const result = await decodedImage(art.mediaUrl.thumbnail, art.sha256.thumbnail, [384, 256], current.signal)
          if (current.signal.aborted || !card.isConnected) { URL.revokeObjectURL(result.url); return }
          blobUrl = result.url
          result.image.alt = ''
          result.image.width = 384; result.image.height = 256
          preview.replaceChildren(result.image)
          message.textContent = ''
        } catch (error) {
          if (current.signal.aborted) return
          console.error('GALLERY_THUMBNAIL', error)
          message.textContent = 'Thumbnail unavailable.'
          retryThumb.hidden = false
        }
      }
      retryThumb.addEventListener('click', () => { void load() })
      button.addEventListener('click', () => { void select(page * PAGE_SIZE + offset) })
      button.append(preview, title)
      card.append(button, message, retryThumb, caption, credit)
      list.append(card)
      loaders.set(card, () => { void load() })
      observer.observe(card)
    }
    previous.disabled = page === 0
    next.disabled = (page + 1) * PAGE_SIZE >= items.length
    pageLabel.textContent = `Page ${page + 1} of ${Math.ceil(items.length / PAGE_SIZE)}`
    if (focus) list.querySelector<HTMLButtonElement>('.gallery-select')?.focus()
  }
  const loadIndex = async () => {
    indexRequest?.abort()
    clearCards()
    items = []
    previous.disabled = true; next.disabled = true; pageLabel.textContent = ''
    retry.hidden = true
    if (!approved) { status.textContent = AWAITING; return }
    const controller = new AbortController()
    indexRequest = controller
    status.textContent = 'Loading approved reference index...'
    try {
      const response = await fetch(assetUrl('gallery/index.json'), { signal: controller.signal, credentials: 'omit', redirect: 'error' })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`GALLERY_HTTP: ${response.status}`)
      }
      const text = await boundedText(response, 100_000, controller.signal)
      const index = parseGalleryIndex(JSON.parse(text))
      if (controller.signal.aborted || !opened) return
      if (index.status === 'awaiting-approval') { status.textContent = AWAITING; return }
      items = index.items
      page = 0
      status.textContent = `${items.length} concept references approved for staging only. No live publication authorized.`
      renderPage()
    } catch (error) {
      if (controller.signal.aborted) return
      console.error('GALLERY_INDEX', error)
      status.textContent = 'Gallery unavailable. Retry loading the approved index.'
      retry.hidden = false
    }
  }
  previous.addEventListener('click', () => { page--; renderPage(true) })
  next.addEventListener('click', () => { page++; renderPage(true) })
  retry.addEventListener('click', () => { void loadIndex() })
  toggle.addEventListener('click', () => {
    opened = !opened
    toggle.setAttribute('aria-expanded', String(opened))
    toggle.textContent = opened ? 'Close reference gallery' : 'Open reference gallery'
    panel.hidden = !opened
    if (opened) {
      void loadIndex()
      panel.scrollIntoView({ block: 'start' })
    } else {
      indexRequest?.abort(); closeSelection(); clearCards(); items = []
      toggle.focus()
    }
  })
  window.addEventListener('pagehide', () => {
    indexRequest?.abort()
    closeSelection()
    clearCards()
    items = []
    opened = false
    toggle.setAttribute('aria-expanded', 'false')
    toggle.textContent = 'Open reference gallery'
    panel.hidden = true
    status.textContent = ''
  })
}
