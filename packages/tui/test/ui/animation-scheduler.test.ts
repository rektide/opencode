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

test("advances tasks at fractional cadences and coalesces rendering", () => {
  const clock = new ManualClock()
  const deltas: number[][] = [[], []]
  let renders = 0
  const scheduler = createAnimationScheduler({ clock, render: () => renders++ })

  scheduler.add(2.5, (delta) => (deltas[0]!.push(delta), true))
  scheduler.add(2.5, (delta) => (deltas[1]!.push(delta), true))
  clock.advance(399)
  expect(deltas).toEqual([[], []])
  clock.advance(1)
  expect(deltas).toEqual([[400], [400]])
  expect(renders).toBe(1)
  scheduler.dispose()
})

test("advances elapsed wall time without replaying missed samples", () => {
  const time = stalledClock()
  const deltas: number[] = []
  let renders = 0
  const scheduler = createAnimationScheduler({ clock: time.clock, render: () => renders++ })

  scheduler.add(10, (delta) => (deltas.push(delta), true))
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
  const scheduler = createAnimationScheduler({ clock, render: () => renders++ })

  scheduler.add(10, () => (steps++, false))
  const cancel = scheduler.add(10, () => (steps++, true))
  cancel()
  clock.advance(100)
  expect(steps).toBe(1)
  expect(renders).toBe(1)
  clock.advance(1000)
  expect(steps).toBe(1)
  scheduler.dispose()
})

test("freezes task time while suspended", () => {
  const clock = new ManualClock()
  const deltas: number[] = []
  const scheduler = createAnimationScheduler({ clock, render() {} })

  scheduler.add(10, (delta) => (deltas.push(delta), true))
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
  const scheduler = createAnimationScheduler({ clock, render() {} })

  scheduler.add(Number.MAX_VALUE, () => (fast++, false))
  scheduler.add(Number.MIN_VALUE, () => (slow++, false))
  clock.advance(1)
  expect(fast).toBe(1)
  expect(slow).toBe(0)
  scheduler.dispose()
})
