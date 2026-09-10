import { assetUrl } from '../shared/urls'

const link = document.querySelector<HTMLAnchorElement>('#showcase-link')
const status = document.querySelector<HTMLElement>('#build-status')
if (!link || !status) throw new Error('PLAY_DOM: missing required entry elements')
link.href = assetUrl('')
status.textContent = 'Entry build ready. Gameplay remains unavailable until its required assets are qualified.'
