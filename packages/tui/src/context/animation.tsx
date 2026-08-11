import { createContext, createEffect, onCleanup, type JSX, useContext } from "solid-js"
import type { CliRenderer } from "@opentui/core"
import { animation, useConfig } from "../config"
import type { AnimationScheduler } from "../ui/animation-scheduler"

const AnimationContext = createContext<AnimationScheduler>()

export function AnimationProvider(props: {
  scheduler: AnimationScheduler
  renderer: CliRenderer
  children: JSX.Element
}) {
  const config = useConfig()
  createEffect(() => {
    const fps = animation(config.data.animations, 60).fps
    props.renderer.targetFps = fps
    props.scheduler.setFps(fps)
  })
  onCleanup(props.scheduler.dispose)
  return <AnimationSchedulerProvider value={props.scheduler}>{props.children}</AnimationSchedulerProvider>
}

export function AnimationSchedulerProvider(props: { value: AnimationScheduler; children: JSX.Element }) {
  return <AnimationContext.Provider value={props.value}>{props.children}</AnimationContext.Provider>
}

export function useAnimation() {
  const value = useContext(AnimationContext)
  if (!value) throw new Error("AnimationProvider is missing")
  return value
}
