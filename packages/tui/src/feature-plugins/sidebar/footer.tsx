import { Plugin } from "@opencode-ai/plugin/tui"
import { createMemo, Show } from "solid-js"
import { FilePath } from "../../ui/file-path"

function View(props: { context: Plugin.Context }) {
  const directory = createMemo(() => {
    if (!props.context.location) return undefined
    const value = props.context.ui.format.path(props.context.location.directory)
    const vcs = props.context.data.location.vcs.info(props.context.location)
    const label = vcs?.branch.current ?? vcs?.workingCopy?.label
    return label ? `${value}:${label}` : value
  })
  return (
    <Show when={directory()}>
      {(value) => <FilePath value={value()} maxWidth={38} fg={props.context.theme.text.subdued} />}
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.sidebar-footer",
  setup(context) {
    context.ui.slot("sidebar.footer", () => <View context={context} />)
  },
})
