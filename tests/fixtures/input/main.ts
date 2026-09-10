import { createSession } from '../../../src/app/session'
import { bindGameInput } from '../../../src/input/browser'
import { cameraHeading, createCamera, orbitCamera, zoomCamera } from '../../../src/camera/controller'

const session = createSession({ identity: 'production-input-contract-fixture', heading: () => cameraHeading(camera) })
const camera = createCamera(1280, 600)
const surface = document.querySelector<HTMLElement>('#surface')
const output = document.querySelector<HTMLElement>('#snapshot')
if (!surface || !output) throw new Error('Missing input fixture surface')
const binding = bindGameInput(surface, session, {
  orbit: (step) => orbitCamera(camera, step),
  zoom: (delta) => zoomCamera(camera, delta),
  resetView: () => {
    while (cameraHeading(camera) !== 0) orbitCamera(camera, 1)
    camera.zoom = 1
    camera.updateProjectionMatrix()
  },
})
for (const type of ['pause', 'restart', 'dispatch'] as const) {
  document.getElementById(type)!.addEventListener('click', () => session.enqueue({ type }))
}
const fixture = {
  ready: (value: boolean) => session.setReady(value),
  tick(count: number) {
    for (let i = 0; i < count; i++) session.advanceTick()
    output.textContent = JSON.stringify(session.snapshot())
  },
  pump: (now: number) => session.pump(now).length,
  snapshot: () => session.snapshot(),
  replay: () => session.replayLog(),
  heading(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 3) throw new Error('Invalid fixture heading')
    while (cameraHeading(camera) !== value) orbitCamera(camera, 1)
  },
  cameraHeading: () => cameraHeading(camera),
  dispose() { binding.dispose(); session.dispose() },
}
declare global { interface Window { inputFixture: typeof fixture } }
window.inputFixture = fixture
