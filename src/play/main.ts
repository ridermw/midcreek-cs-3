import { assetUrl } from '../shared/urls'
import { startGame } from '../app/game'
import type { GameHandle } from '../app/game'
import './style.css'

const link = document.querySelector<HTMLAnchorElement>('#showcase-link')
const container = document.querySelector<HTMLElement>('#game')
if (!link || !container) throw new Error('PLAY_DOM: missing required entry elements')
link.href = assetUrl('')

declare global { interface Window { midcreek: GameHandle } }
const game = await startGame(container, {
  baseUrl: assetUrl('assets/library/'),
  diagnostics: new URLSearchParams(window.location.search).has('qualification'),
})
window.midcreek = game
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload()
})
