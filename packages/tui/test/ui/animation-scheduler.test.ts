import { expect, test } from "bun:test"
import { ManualClock } from "@opentui/core/testing"
import { createAnimationScheduler, type AnimationClock } from "../../src/ui/animation-scheduler"

function stalledClock() {
  let now = 0
  let callback: (() => void) | undefined
  const clock: AnimationClock = {
    now: () => now,
    setTimeout: (next) => ((callback = next), 1),
    clearTimeout: () => (callback = undefined),
  }
  return {
    clock,
    advance(delta: number) {
      now += delta
      const next = callback
      callback = undefined
      next?.()
    },
  }
}

test("advances staggered tasks on one fractional cadence boundary", () => {
  const clock = new ManualClock()
  const deltas: number[][] = [[], []]
  let renders = 0
  const scheduler = createAnimationScheduler({ clock, fps: 2.5, render: () => renders++ })

  scheduler.add((delta) => (deltas[0]!.push(delta), true))
  clock.advance(200)
  scheduler.add((delta) => (deltas[1]!.push(delta), true))
  clock.advance(199)
  expect(deltas).toEqual([[], []])
  clock.advance(1)
  expect(deltas).toEqual([[400], [200]])
  expect(renders).toBe(1)
  scheduler.dispose()
})

test("advances elapsed wall time without replaying missed samples", () => {
  const time = stalledClock()
  const deltas: number[] = []
  let renders = 0
  const scheduler = createAnimationScheduler({ clock: time.clock, fps: 10, render: () => renders++ })

  scheduler.add((delta) => (deltas.push(delta), true))
  time.advance(350)
  expect(deltas).toEqual([350])
  expect(renders).toBe(1)
  time.advance(50)
  expect(deltas).toEqual([350, 50])
  scheduler.dispose()
})

test("removes completed and cancelled tasks", () => {
  const clock = new ManualClock()
  let steps = 0
  let renders = 0
  const scheduler = createAnimationScheduler({ clock, fps: 10, render: () => renders++ })

  scheduler.add(() => (steps++, false))
  const cancel = scheduler.add(() => (steps++, true))
  cancel()
  clock.advance(100)
  expect(steps).toBe(1)
  expect(renders).toBe(1)
  clock.advance(1000)
  expect(steps).toBe(1)
  scheduler.dispose()
})

test("skips a task cancelled by an earlier task in the same frame", () => {
  const clock = new ManualClock()
  let steps = 0
  const scheduler = createAnimationScheduler({ clock, fps: 10, render() {} })
  let cancel = () => {}

  scheduler.add(() => (cancel(), false))
  cancel = scheduler.add(() => (steps++, true))
  clock.advance(100)
  expect(steps).toBe(0)
  scheduler.dispose()
})

test("updates the shared cadence without discarding elapsed task time", () => {
  const clock = new ManualClock()
  const deltas: number[] = []
  const scheduler = createAnimationScheduler({ clock, fps: 10, render() {} })

  scheduler.add((delta) => (deltas.push(delta), true))
  clock.advance(50)
  scheduler.setFps(20)
  clock.advance(49)
  expect(deltas).toEqual([])
  clock.advance(1)
  expect(deltas).toEqual([100])
  scheduler.dispose()
})

test("freezes task time while suspended", () => {
  const clock = new ManualClock()
  const deltas: number[] = []
  const scheduler = createAnimationScheduler({ clock, fps: 10, render() {} })

  scheduler.add((delta) => (deltas.push(delta), true))
  scheduler.suspend()
  clock.advance(1000)
  scheduler.resume()
  clock.advance(100)
  expect(deltas).toEqual([100])
  scheduler.dispose()
})

test("accepts extreme positive rates without timer overflow", () => {
  const clock = new ManualClock()
  let fast = 0
  let slow = 0
  const scheduler = createAnimationScheduler({ clock, fps: Number.MAX_VALUE, render() {} })

  scheduler.add(() => (fast++, false))
  clock.advance(1)
  expect(fast).toBe(1)
  scheduler.setFps(Number.MIN_VALUE)
  scheduler.add(() => (slow++, false))
  clock.advance(2_147_483_647)
  expect(slow).toBe(0)
  scheduler.dispose()
})
