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

export function createAnimationScheduler(input: { clock: AnimationClock; render(): void }) {
  const tasks = new Set<{
    fps: number
    step: (delta: number) => boolean
    last: number
    due: number
  }>()
  let timer: ReturnType<AnimationClock["setTimeout"]> | undefined
  let paused = false
  let disposed = false

  const period = (fps: number) => {
    const value = 1000 / fps
    return Number.isFinite(value) ? value : Number.MAX_VALUE
  }
  const next = (now: number, fps: number) => {
    const value = now + period(fps)
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
    const due = Math.min(...[...tasks].map((task) => task.due))
    timer = input.clock.setTimeout(tick, Math.min(MAX_DELAY, Math.max(MIN_DELAY, due - now)))
  }
  const tick = () => {
    timer = undefined
    if (paused || disposed) return
    const now = input.clock.now()
    let render = false
    Array.from(tasks).forEach((task) => {
      if (task.due > now) return
      const delta = Math.max(0, now - task.last)
      task.last = now
      render = true
      if (!task.step(delta)) {
        tasks.delete(task)
        return
      }
      const interval = period(task.fps)
      const skipped = Math.max(1, Math.floor((now - task.due) / interval) + 1)
      const due = task.due + skipped * interval
      task.due = Number.isFinite(due) && due > now ? due : next(now, task.fps)
    })
    if (render) input.render()
    arm()
  }

  return {
    add(fps: number, step: (delta: number) => boolean) {
      if (disposed) return () => {}
      const now = input.clock.now()
      const task = { fps, step, last: now, due: next(now, fps) }
      tasks.add(task)
      arm()
      return () => {
        if (!tasks.delete(task)) return
        arm()
      }
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
        task.due = next(now, task.fps)
      })
      arm()
    },
    dispose() {
      if (disposed) return
      disposed = true
      clear()
      tasks.clear()
    },
  }
}
