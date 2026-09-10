import { assetUrl } from '../shared/urls'

const link = document.querySelector<HTMLAnchorElement>('#play-link')
const status = document.querySelector<HTMLElement>('#build-status')
if (!link || !status) throw new Error('SITE_DOM: missing required entry elements')
link.href = assetUrl('play/')
status.textContent = 'Entry build ready. Galleries and performance qualification are not yet available.'
