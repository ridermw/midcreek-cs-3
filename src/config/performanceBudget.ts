export const PERFORMANCE_BUDGET = Object.freeze({
  calls: 250, triangles: 1_000_000, gameBytes: 15_000_000,
  meanFps: 59, p95Ms: 18, firstFrames: 300, warmupSeconds: 12, windowFrames: 300,
})

export const NAMED_TARGET = 'CS3-M4Pro-Chrome153-DPR1'
export const WALK_LOOP = Object.freeze([
  Object.freeze({ x: 8, z: 7 }), Object.freeze({ x: 8, z: 8 }),
  Object.freeze({ x: 2, z: 8 }), Object.freeze({ x: 2, z: 7 }),
])
