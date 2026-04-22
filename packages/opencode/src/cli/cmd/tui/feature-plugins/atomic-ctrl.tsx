import type { TuiDialogSelectOption, TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { RGBA } from "@opentui/core"
import {
  activeApprovals,
  activeFailures,
  approveItem,
  clearFailedWork,
  getSessionState,
  getSessionStateSync,
  isEnabledSync,
  listAvailableWork,
  rejectItem,
  retryFailedWork,
  selectWorkItem,
  toViewModel,
} from "@/atomic-ctrl"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"

const id = "internal:atomic-ctrl"
const ATOMIC_TEAL = RGBA.fromHex("#19f0de")
const ATOMIC_TEAL_SOFT = RGBA.fromHex("#0fc7bb")
let atomicRevision = 0
const atomicListeners = new Set<() => void>()

function worktree(api: TuiPluginApi) {
  return api.state.path.worktree || process.cwd()
}

function routeSessionID(params: unknown) {
  if (!params || typeof params !== "object") return
  const value = (params as Record<string, unknown>).sessionID
  return typeof value === "string" ? value : undefined
}

function currentSessionID(api: TuiPluginApi) {
  const current = api.route.current
  if (current.name === "session") return routeSessionID(current.params)
  if (current.name === "atomic-ctrl") return routeSessionID(current.params)
  return
}

function atomicEnabled(api: TuiPluginApi) {
  return isEnabledSync(worktree(api))
}

function bump() {
  atomicRevision += 1
  for (const listener of atomicListeners) listener()
}

function useAtomic(api: TuiPluginApi, sessionID: () => string | undefined) {
  const [revision, setRevision] = createSignal(atomicRevision)

  onMount(() => {
    const listener = () => setRevision(atomicRevision)
    atomicListeners.add(listener)
    onCleanup(() => atomicListeners.delete(listener))
  })

  const data = createMemo(() => {
    revision()
    const id = sessionID()
    if (!id) return
    const state = getSessionStateSync(worktree(api), id)
    if (!state) return
    return toViewModel(state)
  })

  return {
    data,
    loading: () => false,
    error: () => undefined as string | undefined,
    refetch() {},
  }
}

function AtomicBrand(props: { api: TuiPluginApi; compact?: boolean }) {
  const theme = () => props.api.theme.current

  return (
    <box
      flexDirection="column"
      paddingLeft={props.compact ? 1 : 2}
      paddingRight={props.compact ? 1 : 2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={theme().background}
    >
      <text fg={ATOMIC_TEAL}>
        <b>ATOMIC CTRL</b>
      </text>
      <Show when={!props.compact}>
        <text fg={ATOMIC_TEAL_SOFT}>control plane</text>
      </Show>
    </box>
  )
}

async function openWorkDialog(api: TuiPluginApi, sessionID: string) {
  const items = await listAvailableWork(worktree(api), sessionID)
  if (items.length === 0) {
    api.ui.toast({ variant: "info", message: "No Atomic work items available" })
    return
  }
  const options: TuiDialogSelectOption<string>[] = items.map((item) => ({
    title: item.title,
    value: item.id,
    description: item.summary ?? `${item.status}${item.objectiveId ? ` · ${item.objectiveId}` : ""}`,
  }))
  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect
      title="Select work item"
      options={options}
      onSelect={(option) => {
        api.ui.dialog.clear()
        api.ui.toast({ variant: "info", message: "Updating Atomic work item..." })
        void selectWorkItem(worktree(api), sessionID, option.value)
          .then(() => {
            bump()
            api.ui.toast({ variant: "success", message: "Updated Atomic work item" })
          })
          .catch((error) => {
            api.ui.toast({ variant: "error", message: error instanceof Error ? error.message : String(error) })
          })
      }}
    />
  ))
}

function approvalActionDialog(api: TuiPluginApi, sessionID: string, approvalID: string, title: string) {
  const options: TuiDialogSelectOption<string>[] = [
    { title: "Approve", value: "approve", description: "Mark this approval as approved" },
    { title: "Reject", value: "reject", description: "Mark this approval as rejected" },
  ]
  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect
      title={title}
      options={options}
      onSelect={(option) => {
        api.ui.dialog.clear()
        api.ui.toast({
          variant: "info",
          message: option.value === "approve" ? "Approving item..." : "Rejecting item...",
        })
        const task =
          option.value === "approve"
            ? approveItem(worktree(api), sessionID, approvalID)
            : rejectItem(worktree(api), sessionID, approvalID, "Rejected in Atomic UI")
        void task
          .then(() => {
            bump()
            api.ui.toast({
              variant: "success",
              message: option.value === "approve" ? "Approval marked approved" : "Approval marked rejected",
            })
          })
          .catch((error) => {
            api.ui.toast({ variant: "error", message: error instanceof Error ? error.message : String(error) })
          })
      }}
    />
  ))
}

async function openApprovalsDialog(api: TuiPluginApi, sessionID: string) {
  const state = await getSessionState(worktree(api), sessionID)
  const view = state ? toViewModel(state) : undefined
  const approvals = view?.approvals ?? []
  if (approvals.length === 0) {
    api.ui.toast({ variant: "info", message: "No pending human approvals" })
    return
  }
  const options: TuiDialogSelectOption<string>[] = approvals.map((item) => ({
    title: item.title,
    value: item.id,
    description: item.summary ?? "Pending human approval",
  }))
  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect
      title="Human approvals queue"
      options={options}
      onSelect={(option) => {
        const item = approvals.find((approval) => approval.id === option.value)
        if (!item) return
        approvalActionDialog(api, sessionID, item.id, item.title)
      }}
    />
  ))
}

function failedWorkActionDialog(api: TuiPluginApi, sessionID: string, failureID: string, title: string) {
  const options: TuiDialogSelectOption<string>[] = [
    { title: "Retry", value: "retry", description: "Mark this failed work item as retried" },
    { title: "Clear", value: "clear", description: "Mark this failed work item as cleared" },
  ]
  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect
      title={title}
      options={options}
      onSelect={(option) => {
        api.ui.dialog.clear()
        api.ui.toast({
          variant: "info",
          message: option.value === "retry" ? "Retrying failed work..." : "Clearing failed work...",
        })
        const task =
          option.value === "retry"
            ? retryFailedWork(worktree(api), sessionID, failureID)
            : clearFailedWork(worktree(api), sessionID, failureID)
        void task
          .then(() => {
            bump()
            api.ui.toast({
              variant: "success",
              message: option.value === "retry" ? "Failed work marked retried" : "Failed work cleared",
            })
          })
          .catch((error) => {
            api.ui.toast({ variant: "error", message: error instanceof Error ? error.message : String(error) })
          })
      }}
    />
  ))
}

async function openFailedWorkDialog(api: TuiPluginApi, sessionID: string) {
  const state = await getSessionState(worktree(api), sessionID)
  const view = state ? toViewModel(state) : undefined
  const failures = view?.failures ?? []
  if (failures.length === 0) {
    api.ui.toast({ variant: "info", message: "No active failed work items" })
    return
  }
  const options: TuiDialogSelectOption<string>[] = failures.map((item) => ({
    title: item.title,
    value: item.id,
    description: item.summary ?? "Active failed work item",
  }))
  api.ui.dialog.replace(() => (
    <api.ui.DialogSelect
      title="Failed work"
      options={options}
      onSelect={(option) => {
        const item = failures.find((failure) => failure.id === option.value)
        if (!item) return
        failedWorkActionDialog(api, sessionID, item.id, item.title)
      }}
    />
  ))
}

function SidebarView(props: { api: TuiPluginApi; sessionID: string }) {
  const resolvedSessionID = createMemo(() => props.sessionID || currentSessionID(props.api))
  const state = useAtomic(props.api, resolvedSessionID)
  const view = createMemo(() => state.data())
  const theme = () => props.api.theme.current
  const cwd = createMemo(() => worktree(props.api))

  return (
    <Show
      when={view()}
      fallback={
        <box
          flexDirection="column"
          gap={1}
          backgroundColor={theme().backgroundElement}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          <AtomicBrand api={props.api} compact />
          <text fg={theme().textMuted}>
            {state.error() ? `Atomic error: ${state.error()}` : state.loading() ? "Loading Atomic state..." : "Atomic state unavailable"}
          </text>
          <text fg={theme().textMuted}>session: {resolvedSessionID() ?? "<none>"}</text>
          <text fg={theme().textMuted}>worktree: {cwd()}</text>
          <text fg={theme().textMuted}>enabled: {atomicEnabled(props.api) ? "yes" : "no"}</text>
        </box>
      }
    >
      <box
        flexDirection="column"
        gap={1}
        backgroundColor={theme().backgroundElement}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <AtomicBrand api={props.api} compact />
        <text fg={theme().textMuted}>{view()!.state.sessionBootstrap.title}</text>
        <text fg={theme().textMuted}>Objective: {view()?.objective?.title ?? "None"}</text>
        <text fg={theme().textMuted}>Work: {view()?.workItem?.title ?? "None"}</text>
        <text fg={theme().textMuted}>Skills: {view()!.state.authorizedSkills.length}</text>
        <text fg={theme().textMuted}>Grants: {view()!.state.capabilityGrants.length}</text>
        <text fg={theme().textMuted}>Approvals: {view()!.approvals.length}</text>
        <text fg={theme().textMuted}>Failed: {view()!.failures.length}</text>
      </box>
    </Show>
  )
}

function PromptStatus(props: { api: TuiPluginApi; sessionID: string }) {
  const resolvedSessionID = createMemo(() => props.sessionID || currentSessionID(props.api))
  const state = useAtomic(props.api, resolvedSessionID)
  const view = createMemo(() => state.data())
  const theme = () => props.api.theme.current

  return (
    <Show
      when={view()}
      fallback={
        <text fg={theme().textMuted}>
          {state.error()
            ? `Atomic error (${resolvedSessionID() ?? "no-session"})`
            : state.loading()
              ? `Atomic loading (${resolvedSessionID() ?? "no-session"})`
              : `Atomic idle (${resolvedSessionID() ?? "no-session"})`}
        </text>
      }
    >
      <text fg={theme().textMuted}>
        {view()?.workItem?.title ?? "No work"}
        {" · "}
        A:{view()!.approvals.length}
        {" · "}
        F:{view()!.failures.length}
      </text>
    </Show>
  )
}

function AtomicRoute(props: { api: TuiPluginApi; sessionID: string }) {
  const resolvedSessionID = createMemo(() => props.sessionID || currentSessionID(props.api))
  const state = useAtomic(props.api, resolvedSessionID)
  const view = createMemo(() => state.data())
  const theme = () => props.api.theme.current
  const cwd = createMemo(() => worktree(props.api))

  return (
    <box flexDirection="column" width="100%" height="100%" paddingLeft={2} paddingRight={2} paddingTop={1} gap={1}>
      <AtomicBrand api={props.api} />
      <Show when={!view()}>
        <text fg={theme().textMuted}>
          {state.error()
            ? `Atomic error: ${state.error()}`
            : state.loading()
              ? "Atomic control plane is loading for this session."
              : "Atomic control plane has no state for this session."}
        </text>
        <text fg={theme().textMuted}>session: {resolvedSessionID() ?? "<none>"}</text>
        <text fg={theme().textMuted}>worktree: {cwd()}</text>
        <text fg={theme().textMuted}>enabled: {atomicEnabled(props.api) ? "yes" : "no"}</text>
      </Show>
      <Show when={view()}>
        <>
          <text fg={theme().textMuted}>{view()!.state.sessionBootstrap.title}</text>
          <text fg={theme().textMuted}>Current objective: {view()?.objective?.title ?? "None"}</text>
          <text fg={theme().textMuted}>Current work item: {view()?.workItem?.title ?? "None"}</text>
          <text fg={theme().textMuted}>Authorized skills: {view()!.state.authorizedSkills.join(", ") || "none"}</text>
          <text fg={theme().textMuted}>Capability grants:</text>
          <box flexDirection="column" gap={1} backgroundColor={theme().backgroundElement} padding={1}>
            <For each={view()!.state.capabilityGrants}>
              {(grant) => (
                <text fg={theme().textMuted}>
                  - {grant.title}: {grant.permission} {grant.pattern} =&gt; {grant.action}
                </text>
              )}
            </For>
          </box>
          <text fg={theme().text}>Pending approvals</text>
          <Show when={view()!.approvals.length === 0}>
            <text fg={theme().textMuted}>- none</text>
          </Show>
          <box flexDirection="column" gap={1} backgroundColor={theme().backgroundElement} padding={1}>
            <For each={view()!.approvals}>
              {(item) => (
                <text fg={theme().textMuted}>
                  - {item.title}
                </text>
              )}
            </For>
          </box>
          <text fg={theme().text}>Active failed work</text>
          <Show when={view()!.failures.length === 0}>
            <text fg={theme().textMuted}>- none</text>
          </Show>
          <box flexDirection="column" gap={1} backgroundColor={theme().backgroundElement} padding={1}>
            <For each={view()!.failures}>
              {(item) => (
                <text fg={theme().textMuted}>
                  - {item.title}
                </text>
              )}
            </For>
          </box>
          <box gap={1} paddingTop={1}>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={theme().backgroundElement}
              onMouseUp={() => void openWorkDialog(props.api, resolvedSessionID() ?? "")}
            >
              <text fg={theme().text}>Select Work</text>
            </box>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={theme().backgroundElement}
              onMouseUp={() => void openApprovalsDialog(props.api, resolvedSessionID() ?? "")}
            >
              <text fg={theme().text}>Review Approvals</text>
            </box>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={theme().backgroundElement}
              onMouseUp={() => void openFailedWorkDialog(props.api, resolvedSessionID() ?? "")}
            >
              <text fg={theme().text}>Review Failed Work</text>
            </box>
          </box>
        </>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.route.register([
    {
      name: "atomic-ctrl",
      render(input) {
        const sessionID = routeSessionID(input.params) ?? currentSessionID(api) ?? ""
        return <AtomicRoute api={api} sessionID={sessionID} />
      },
    },
  ])

  api.command.register(() => {
    const sessionID = currentSessionID(api)
    const enabled = atomicEnabled(api)
    return [
      {
        title: "Atomic-CTRL",
        value: "atomic_ctrl.open",
        category: "Atomic",
        hidden: !enabled,
        onSelect() {
          api.route.navigate("home")
        },
      },
      {
        title: "Atomic: Select Work Item",
        value: "atomic_ctrl.work.select",
        category: "Atomic",
        hidden: !enabled,
        onSelect() {
          if (!sessionID) return
          void openWorkDialog(api, sessionID)
        },
      },
      {
        title: "Atomic: Review Approvals Queue",
        value: "atomic_ctrl.approvals.review",
        category: "Atomic",
        hidden: !enabled,
        onSelect() {
          if (!sessionID) return
          void openApprovalsDialog(api, sessionID)
        },
      },
      {
        title: "Atomic: Review Failed Work",
        value: "atomic_ctrl.failed.review",
        category: "Atomic",
        hidden: !enabled,
        onSelect() {
          if (!sessionID) return
          void openFailedWorkDialog(api, sessionID)
        },
      },
    ]
  })

  api.slots.register({
    order: 5,
    slots: {
      home_logo() {
        return atomicEnabled(api) ? <AtomicBrand api={api} /> : null
      },
      sidebar_content(_ctx, props) {
        return atomicEnabled(api) ? <SidebarView api={api} sessionID={props.session_id} /> : null
      },
      session_prompt_right(_ctx, props) {
        return atomicEnabled(api) ? <PromptStatus api={api} sessionID={props.session_id} /> : null
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
