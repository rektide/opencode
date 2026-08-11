import type { RenderContext } from "@opentui/core"
import type { AnimationScheduler } from "./animation-scheduler"

const schedulers = new WeakMap<RenderContext, AnimationScheduler>()

export function registerAnimationScheduler(context: RenderContext, scheduler: AnimationScheduler) {
  schedulers.set(context, scheduler)
  return () => {
    if (schedulers.get(context) === scheduler) schedulers.delete(context)
  }
}

export function animationScheduler(context: RenderContext) {
  const scheduler = schedulers.get(context)
  if (!scheduler) throw new Error("Animation scheduler is not registered")
  return scheduler
}
