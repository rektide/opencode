export type AnimationClock = {
  now(): number
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> | number
  clearTimeout(handle: ReturnType<typeof setTimeout> | number): void
}

export type AnimationScheduler = ReturnType<typeof createAnimationScheduler>

const MAX_DELAY = 2_147_483_647
const MIN_DELAY = 1

export const systemAnimationClock: AnimationClock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
}

export function createAnimationScheduler(input: { clock: AnimationClock; fps: number; render(): void }) {
  const tasks = new Set<{
    step: (delta: number) => boolean
    last: number
  }>()
  let timer: ReturnType<AnimationClock["setTimeout"]> | undefined
  let fps = input.fps
  let due: number | undefined
  let paused = false
  let disposed = false

  const period = () => {
    const value = 1000 / fps
    return Number.isFinite(value) ? value : Number.MAX_VALUE
  }
  const next = (now: number) => {
    const value = now + period()
    return Number.isFinite(value) ? value : Number.MAX_VALUE
  }
  const clear = () => {
    if (timer === undefined) return
    input.clock.clearTimeout(timer)
    timer = undefined
  }
  const arm = () => {
    clear()
    if (paused || disposed || tasks.size === 0) return
    const now = input.clock.now()
    due ??= next(now)
    timer = input.clock.setTimeout(tick, Math.min(MAX_DELAY, Math.max(MIN_DELAY, due - now)))
  }
  const tick = () => {
    timer = undefined
    if (paused || disposed) return
    const now = input.clock.now()
    if (due !== undefined && due > now) {
      arm()
      return
    }
    const render = tasks.size > 0
    Array.from(tasks).forEach((task) => {
      if (!tasks.has(task)) return
      const delta = Math.max(0, now - task.last)
      task.last = now
      if (!task.step(delta)) {
        tasks.delete(task)
      }
    })
    if (render) input.render()
    if (tasks.size === 0) due = undefined
    if (due !== undefined) {
      const interval = period()
      const skipped = Math.max(1, Math.floor((now - due) / interval) + 1)
      const value = due + skipped * interval
      due = Number.isFinite(value) && value > now ? value : next(now)
    }
    arm()
  }

  return {
    add(step: (delta: number) => boolean) {
      if (disposed) return () => {}
      const now = input.clock.now()
      const task = { step, last: now }
      tasks.add(task)
      due ??= next(now)
      arm()
      return () => {
        if (!tasks.delete(task)) return
        if (tasks.size === 0) due = undefined
        arm()
      }
    },
    setFps(value: number) {
      if (disposed || value === fps) return
      fps = value
      due = tasks.size === 0 ? undefined : next(input.clock.now())
      arm()
    },
    suspend() {
      if (paused || disposed) return
      paused = true
      clear()
    },
    resume() {
      if (!paused || disposed) return
      paused = false
      const now = input.clock.now()
      tasks.forEach((task) => {
        task.last = now
      })
      due = tasks.size === 0 ? undefined : next(now)
      arm()
    },
    dispose() {
      if (disposed) return
      disposed = true
      clear()
      tasks.clear()
      due = undefined
    },
  }
}
