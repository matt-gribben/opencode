import { Prompt, type PromptRef } from "@tui/component/prompt"
import { selectedForeground, useTheme } from "@tui/context/theme"
import { useProject } from "@tui/context/project"
import { useToast, Toast } from "@tui/ui/toast"
import { TuiPluginRuntime } from "@tui/plugin"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { createMemo, createSignal, For, Show } from "solid-js"
import * as Keybind from "@/util/keybind"
import * as AtomicCtrl from "@/atomic-ctrl"
import { Logo } from "../../component/logo"

type HomeTab = "overview" | "jobs" | "goals"
type JobFilter = "all" | "running" | "queued" | "review" | "blocked" | "completed" | "failed"
type GoalTreeNode = ReturnType<typeof AtomicCtrl.toGoalsTreeViewModel>["goals"][number]

const tabOverview = Keybind.parse("alt+1").at(0)
const tabJobs = Keybind.parse("alt+2").at(0)
const tabGoals = Keybind.parse("alt+3").at(0)

const ATOMIC_TEAL = RGBA.fromHex("#19f0de")
const ATOMIC_TEAL_SOFT = RGBA.fromHex("#0fc7bb")
function Panel(props: {
  title?: string
  right?: string
  children: unknown
  accent?: boolean
  minHeight?: number
}) {
  const { theme } = useTheme()
  const border = () => (props.accent ? ATOMIC_TEAL : theme.borderActive)

  return (
    <box
      flexDirection="column"
      border
      borderColor={border()}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
      minHeight={props.minHeight}
    >
      <Show when={props.title || props.right}>
        <box flexDirection="row" paddingBottom={1}>
          <text fg={theme.textMuted}>{props.title}</text>
          <box flexGrow={1} />
          <Show when={props.right}>
            <text fg={theme.textMuted}>{props.right}</text>
          </Show>
        </box>
      </Show>
      {props.children}
    </box>
  )
}

function Sparkline(props: { values: number[] }) {
  const values = createMemo(() => props.values.slice(-12))

  return (
    <text fg={ATOMIC_TEAL}>
      {(values().length ? values() : [0])
        .map((value) => {
          if (value < 20) return "▁"
          if (value < 40) return "▂"
          if (value < 60) return "▃"
          if (value < 80) return "▅"
          return "▇"
        })
        .join("")}
    </text>
  )
}

function ProgressBar(props: { progress: number }) {
  const { theme } = useTheme()
  const clamped = createMemo(() => Math.max(0, Math.min(100, Math.round(props.progress))))
  const filled = createMemo(() => Math.max(0, Math.min(12, Math.round((clamped() / 100) * 12))))

  return (
    <box flexDirection="row" gap={0}>
      <text fg={ATOMIC_TEAL}>{"█".repeat(filled())}</text>
      <text fg={theme.borderSubtle}>{"█".repeat(12 - filled())}</text>
      <text fg={theme.textMuted}> {clamped()}%</text>
    </box>
  )
}

function StatusBadge(props: { status: string }) {
  const { theme } = useTheme()
  const color = createMemo(() => {
    if (props.status === "failed" || props.status === "blocked") return theme.error
    if (props.status === "review") return theme.warning
    if (props.status === "completed") return theme.success
    return ATOMIC_TEAL
  })

  return (
    <box paddingLeft={1} paddingRight={1} border borderColor={color()}>
      <text fg={color()}>{props.status}</text>
    </box>
  )
}

function StatCard(props: { label: string; value: string; delta?: string; sparkline?: number[] }) {
  const { theme } = useTheme()

  return (
    <Panel title={props.label} accent minHeight={7}>
      <box flexDirection="column" gap={1}>
        <text fg={theme.text}>
          <b>{props.value}</b>
        </text>
        <box flexDirection="row" gap={1}>
          <Sparkline values={props.sparkline ?? []} />
          <Show when={props.delta}>
            <text fg={theme.success}>{props.delta}</text>
          </Show>
        </box>
      </box>
    </Panel>
  )
}

function EmptyState(props: { title: string; detail: string }) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1}>
      <text fg={theme.text}>{props.title}</text>
      <text fg={theme.textMuted}>{props.detail}</text>
    </box>
  )
}

function GoalTreeRow(props: {
  node: GoalTreeNode | GoalTreeNode["children"][number] | GoalTreeNode["children"][number]["children"][number]
  level: number
  expanded?: boolean
  onToggle?: () => void
  onSelect: () => void
  current?: boolean
}) {
  const { theme } = useTheme()
  const titleColor = createMemo(() => {
    if (props.node.type === "goal") return ATOMIC_TEAL
    if (props.node.type === "project") return ATOMIC_TEAL_SOFT
    return theme.text
  })
  const countLabel = createMemo(() => {
    if (props.node.type === "goal") return `${props.node.projectCount} projects`
    if (props.node.type === "project") return `${props.node.objectiveCount} objectives`
    return `${props.node.jobCount} jobs`
  })
  const marker = createMemo(() => {
    if (props.node.type === "objective") return "·"
    return props.expanded ? "▾" : "▸"
  })

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={props.level * 2}
      paddingRight={1}
      backgroundColor={props.current ? theme.backgroundElement : undefined}
      onMouseUp={props.onSelect}
    >
      <text fg={theme.textMuted} onMouseUp={props.onToggle}>
        {marker()}
      </text>
      <text fg={titleColor()}>
        {props.node.type === "goal" ? "GOAL" : props.node.type === "project" ? "PRJ" : "OBJ"}-{props.node.id}
      </text>
      <text fg={theme.text}>{props.node.title}</text>
      <box flexGrow={1} />
      <StatusBadge status={props.node.status} />
      <box width={18}>
        <ProgressBar progress={props.node.progress} />
      </box>
      <text fg={theme.textMuted}>{countLabel()}</text>
    </box>
  )
}

export function HomeControlPanel(props: {
  bind: (r: PromptRef | undefined) => void
  placeholders: {
    normal: string[]
    shell: string[]
  }
}) {
  const project = useProject()
  const toast = useToast()
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const [tab, setTab] = createSignal<HomeTab>("overview")
  const [filter, setFilter] = createSignal<JobFilter>("all")
  const [revision, setRevision] = createSignal(0)
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  const workspaceID = createMemo(() => project.workspace.current())
  const worktree = createMemo(() => project.instance.path().worktree || project.instance.directory() || process.cwd())
  const enabled = createMemo(() => AtomicCtrl.isEnabledSync(worktree()))
  const view = createMemo(() => {
    revision()
    const state = AtomicCtrl.getWorkspaceStateSync(worktree(), workspaceID())
    if (!state) return
    return AtomicCtrl.toDashboardViewModel(state)
  })
  const tree = createMemo(() => {
    revision()
    const state = AtomicCtrl.getWorkspaceStateSync(worktree(), workspaceID())
    if (!state) return
    return AtomicCtrl.toGoalsTreeViewModel(state)
  })

  const wide = createMemo(() => dimensions().width >= 140)
  const currentWorkspace = createMemo(() => (workspaceID() ? project.workspace.get(workspaceID()!) : undefined))
  const brandTitle = createMemo(() => view()?.state.branding?.title ?? "Atomic-CTRL")
  const headerLine = createMemo(() => {
    const meta = view()?.meta
    const items = [
      meta?.workspaceLabel ?? currentWorkspace()?.name ?? "workspace default",
      meta?.planLabel ?? "plan local",
      meta?.teamLabel ?? "team atomic",
      meta?.mcpLabel ?? "mcp local",
    ].filter(Boolean)
    return items.join(" | ")
  })
  const headerMeta = createMemo(() => {
    const meta = view()?.meta
    const items = [meta?.uptimeLabel, meta?.regionLabel, meta?.commitLabel].filter(Boolean)
    return items.join(" • ")
  })
  const jobs = createMemo(() => {
    const items = view()?.jobs ?? []
    if (filter() === "all") return items
    return items.filter((item) => item.dashboardState === filter())
  })
  const isExpanded = (id: string, fallback = false) => expanded()[id] ?? fallback
  const toggleExpanded = (id: string, fallback = false) =>
    setExpanded((value) => ({
      ...value,
      [id]: !(value[id] ?? fallback),
    }))

  const jobFilters = createMemo(
    () =>
      [
        { id: "all", label: "all", count: view()?.counts.all ?? 0 },
        { id: "running", label: "running", count: view()?.counts.running ?? 0 },
        { id: "queued", label: "queued", count: view()?.counts.queued ?? 0 },
        { id: "review", label: "review", count: view()?.counts.review ?? 0 },
        { id: "blocked", label: "blocked", count: view()?.counts.blocked ?? 0 },
        { id: "completed", label: "completed", count: view()?.counts.completed ?? 0 },
        { id: "failed", label: "failed", count: view()?.counts.failed ?? 0 },
      ] satisfies { id: JobFilter; label: string; count: number }[],
  )

  useKeyboard((evt) => {
    const key = Keybind.fromParsedKey(evt)
    if (Keybind.match(tabOverview, key)) {
      evt.preventDefault()
      evt.stopPropagation()
      setTab("overview")
      return
    }
    if (Keybind.match(tabJobs, key)) {
      evt.preventDefault()
      evt.stopPropagation()
      setTab("jobs")
      return
    }
    if (Keybind.match(tabGoals, key)) {
      evt.preventDefault()
      evt.stopPropagation()
      setTab("goals")
    }
  })

  const selectJob = async (workItemID: string) => {
    await AtomicCtrl.selectWorkspaceWorkItem(worktree(), workspaceID(), workItemID)
    setRevision((value) => value + 1)
    toast.show({
      variant: "success",
      message: "Updated Atomic work item for the next session",
    })
  }

  const selectTreeNode = async (input: { goalId?: string; projectId?: string; objectiveId?: string }) => {
    await AtomicCtrl.selectWorkspaceContext(worktree(), workspaceID(), input)
    setRevision((value) => value + 1)
    toast.show({
      variant: "success",
      message: "Updated Atomic goal context for the next session",
    })
  }

  const openTreeSelection = async () => {
    const current = tree()
    if (!current?.currentObjective && !current?.currentProject && !current?.currentGoal) {
      toast.show({ variant: "info", message: "No Atomic goal node is currently selected" })
      return
    }
    toast.show({
      variant: "success",
      message: current.currentObjective
        ? `Opened ${current.currentObjective.title}`
        : current.currentProject
          ? `Opened ${current.currentProject.title}`
          : `Opened ${current.currentGoal!.title}`,
    })
  }

  return (
    <>
      <box flexDirection="column" width="100%" height="100%" paddingLeft={1} paddingRight={1}>
        <box flexShrink={0} flexDirection="row" gap={1} paddingTop={1} paddingBottom={1}>
          <For each={[{ id: "overview", label: "Overview" }, { id: "jobs", label: "Jobs" }, { id: "goals", label: "Goals" }] as const}>
            {(item) => {
              const active = createMemo(() => tab() === item.id)
              return (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={active() ? ATOMIC_TEAL : theme.backgroundPanel}
                  onMouseUp={() => setTab(item.id)}
                >
                  <text fg={active() ? selectedForeground(theme, ATOMIC_TEAL) : theme.textMuted}>
                    {item.label}
                  </text>
                </box>
              )
            }}
          </For>
          <box flexGrow={1} />
          <text fg={theme.textMuted}>alt+1 overview</text>
          <text fg={theme.textMuted}>alt+2 jobs</text>
          <text fg={theme.textMuted}>alt+3 goals</text>
        </box>

        <box flexGrow={1} minHeight={0} flexDirection="column">
          <Show when={tab() === "overview"}>
            <box flexDirection="column" gap={1} minHeight={0}>
              <Panel accent right={headerMeta()}>
                <box flexDirection={wide() ? "row" : "column"} gap={2}>
                  <box flexDirection="column" gap={1} width={wide() ? 30 : undefined}>
                    <Show
                      when={enabled()}
                      fallback={
                        <TuiPluginRuntime.Slot name="home_logo" mode="replace">
                          <Logo />
                        </TuiPluginRuntime.Slot>
                      }
                    >
                      <text fg={ATOMIC_TEAL}>
                        <b>{brandTitle()}</b>
                      </text>
                    </Show>
                    <text fg={theme.text}>
                      atomic coordination &amp; memory layer
                      <Show when={view()?.meta.versionLabel}>
                        <> · {view()!.meta.versionLabel}</>
                      </Show>
                    </text>
                    <text fg={theme.textMuted}>
                      {view()?.objective?.title ?? "No Atomic objective selected"}
                    </text>
                    <text fg={theme.textMuted}>{headerLine()}</text>
                  </box>
                  <box flexDirection={wide() ? "row" : "column"} flexGrow={1} gap={1}>
                    <For each={view()?.stats ?? []}>
                      {(stat) => (
                        <box flexGrow={1}>
                          <StatCard
                            label={stat.label}
                            value={stat.value}
                            delta={stat.delta}
                            sparkline={stat.sparkline}
                          />
                        </box>
                      )}
                    </For>
                    <Show when={(view()?.stats?.length ?? 0) === 0}>
                      <box flexGrow={1}>
                        <StatCard label="Active Jobs" value="0" />
                      </box>
                    </Show>
                  </box>
                </box>
              </Panel>

              <box flexDirection={wide() ? "row" : "column"} gap={1} minHeight={0} flexGrow={1}>
                <box flexGrow={1} minHeight={0}>
                  <Panel title="EVENT STREAM · LIVE" right={view()?.eventStream.length ? "tail -f" : undefined}>
                    <Show
                      when={(view()?.eventStream.length ?? 0) > 0}
                      fallback={
                        <EmptyState
                          title="No Atomic events yet"
                          detail="Add dashboard events to bootstrap.json to populate the overview stream."
                        />
                      }
                    >
                      <box flexDirection="column" gap={1}>
                        <For each={view()?.eventStream ?? []}>
                          {(item) => (
                            <box flexDirection="row" gap={1}>
                              <text fg={theme.textMuted}>{item.timestamp}</text>
                              <text fg={ATOMIC_TEAL_SOFT}>{item.actor}</text>
                              <text fg={theme.text}>{item.message}</text>
                            </box>
                          )}
                        </For>
                      </box>
                    </Show>
                  </Panel>
                </box>
                <box width={wide() ? 52 : undefined} flexShrink={0}>
                  <Panel title="NEEDS ATTENTION" right={`${view()?.attention.length ?? 0}`}>
                    <Show
                      when={(view()?.attention.length ?? 0) > 0}
                      fallback={
                        <EmptyState
                          title="No attention items"
                          detail="The fake Atomic dashboard has no urgent items right now."
                        />
                      }
                    >
                      <box flexDirection="column" gap={1}>
                        <For each={view()?.attention ?? []}>
                          {(item) => (
                            <box flexDirection="row" gap={1}>
                              <text fg={theme.textMuted}>{item.id}</text>
                              <text
                                fg={
                                  item.severity === "urgent"
                                    ? theme.error
                                    : item.severity === "high"
                                      ? theme.warning
                                      : theme.textMuted
                                }
                              >
                                {item.severity.toUpperCase()}
                              </text>
                              <text fg={theme.text}>{item.title}</text>
                              <box flexGrow={1} />
                              <Show when={item.ageLabel}>
                                <text fg={theme.textMuted}>{item.ageLabel}</text>
                              </Show>
                            </box>
                          )}
                        </For>
                      </box>
                    </Show>
                  </Panel>
                </box>
              </box>
            </box>
          </Show>

          <Show when={tab() === "jobs"}>
            <box flexDirection="column" gap={1} minHeight={0}>
              <Panel title={`JOBS · ${view()?.counts.all ?? 0}`} right={`current ${view()?.workItem?.title ?? "none"}`}>
                <box flexDirection="row" gap={1} paddingBottom={1} flexWrap="wrap">
                  <For each={jobFilters()}>
                    {(item) => {
                      const active = createMemo(() => filter() === item.id)
                      return (
                        <box
                          paddingLeft={1}
                          paddingRight={1}
                          backgroundColor={active() ? ATOMIC_TEAL : theme.backgroundPanel}
                          onMouseUp={() => setFilter(item.id)}
                        >
                          <text fg={active() ? selectedForeground(theme, ATOMIC_TEAL) : theme.textMuted}>
                            {item.label} ({item.count})
                          </text>
                        </box>
                      )
                    }}
                  </For>
                </box>

                <box flexDirection="column" gap={1}>
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.textMuted}>ID</text>
                    <box width={10}>
                      <text fg={theme.textMuted}>STATE</text>
                    </box>
                    <box width={10}>
                      <text fg={theme.textMuted}>AGENT</text>
                    </box>
                    <box width={8}>
                      <text fg={theme.textMuted}>PRI</text>
                    </box>
                    <box flexGrow={1}>
                      <text fg={theme.textMuted}>TITLE</text>
                    </box>
                    <box width={20}>
                      <text fg={theme.textMuted}>PROGRESS</text>
                    </box>
                    <Show when={dimensions().width >= 120}>
                      <box width={8}>
                        <text fg={theme.textMuted}>STEPS</text>
                      </box>
                    </Show>
                    <Show when={dimensions().width >= 132}>
                      <box width={8}>
                        <text fg={theme.textMuted}>AGE</text>
                      </box>
                    </Show>
                    <Show when={dimensions().width >= 144}>
                      <box width={10}>
                        <text fg={theme.textMuted}>ETA</text>
                      </box>
                    </Show>
                  </box>

                  <Show
                    when={jobs().length > 0}
                    fallback={
                      <EmptyState
                        title="No jobs in this filter"
                        detail="Choose a different tab filter or add more fake work items to bootstrap.json."
                      />
                    }
                  >
                    <For each={jobs()}>
                      {(item) => {
                        const selected = createMemo(() => item.id === view()?.workItem?.id)
                        return (
                          <box
                            flexDirection="row"
                            gap={1}
                            paddingLeft={1}
                            paddingRight={1}
                            backgroundColor={selected() ? theme.backgroundElement : undefined}
                            onMouseUp={() => void selectJob(item.id)}
                          >
                            <text fg={selected() ? ATOMIC_TEAL : theme.textMuted}>{item.id}</text>
                            <box width={10}>
                              <text
                                fg={
                                  item.dashboardState === "failed"
                                    ? theme.error
                                    : item.dashboardState === "blocked"
                                      ? theme.warning
                                      : item.dashboardState === "completed"
                                        ? theme.success
                                        : theme.text
                                }
                              >
                                {item.dashboardState}
                              </text>
                            </box>
                            <box width={10}>
                              <text fg={theme.textMuted}>{item.agent}</text>
                            </box>
                            <box width={8}>
                              <text fg={theme.textMuted}>{item.priority}</text>
                            </box>
                            <box flexGrow={1}>
                              <text fg={theme.text}>{item.title}</text>
                            </box>
                            <box width={20}>
                              <ProgressBar progress={item.progress} />
                            </box>
                            <Show when={dimensions().width >= 120}>
                              <box width={8}>
                                <text fg={theme.textMuted}>{item.steps}</text>
                              </box>
                            </Show>
                            <Show when={dimensions().width >= 132}>
                              <box width={8}>
                                <text fg={theme.textMuted}>{item.ageLabel}</text>
                              </box>
                            </Show>
                            <Show when={dimensions().width >= 144}>
                              <box width={10}>
                                <text fg={theme.textMuted}>{item.etaLabel}</text>
                              </box>
                            </Show>
                          </box>
                        )
                      }}
                    </For>
                  </Show>
                </box>
              </Panel>
            </box>
          </Show>

          <Show when={tab() === "goals"}>
            <box flexDirection="column" gap={1} minHeight={0}>
              <Panel
                title={`GOALS · PROJECTS · OBJECTIVES`}
                right={`${tree()?.goals.length ?? 0} goals`}
              >
                <box flexDirection="row" gap={2} paddingBottom={1}>
                  <text fg={theme.textMuted} onMouseUp={() => setExpanded({})}>
                    h/l collapse/expand
                  </text>
                  <text fg={theme.textMuted} onMouseUp={() => void openTreeSelection()}>
                    ↵ open
                  </text>
                  <text fg={theme.textMuted}>n new objective</text>
                  <text fg={theme.textMuted}>d dispatch job</text>
                </box>

                <Show
                  when={(tree()?.goals.length ?? 0) > 0}
                  fallback={
                    <EmptyState
                      title="No Atomic goals yet"
                      detail="Add goals, projects, and objectives to bootstrap.json to populate the tree."
                    />
                  }
                >
                  <box flexDirection="column" gap={1}>
                    <For each={tree()?.goals ?? []}>
                      {(goal) => {
                        const goalOpen = createMemo(() => isExpanded(`goal:${goal.id}`, goal.selected))
                        return (
                          <>
                            <GoalTreeRow
                              node={goal}
                              level={0}
                              expanded={goalOpen()}
                              current={goal.selected}
                              onToggle={() => toggleExpanded(`goal:${goal.id}`, goal.selected)}
                              onSelect={() => void selectTreeNode({ goalId: goal.id })}
                            />
                            <Show when={goalOpen()}>
                              <For each={goal.children}>
                                {(projectNode) => {
                                  const projectOpen = createMemo(
                                    () => isExpanded(`project:${projectNode.id}`, projectNode.selected),
                                  )
                                  return (
                                    <>
                                      <GoalTreeRow
                                        node={projectNode}
                                        level={1}
                                        expanded={projectOpen()}
                                        current={projectNode.selected}
                                        onToggle={() =>
                                          toggleExpanded(`project:${projectNode.id}`, projectNode.selected)
                                        }
                                        onSelect={() =>
                                          void selectTreeNode({
                                            goalId: goal.id,
                                            projectId: projectNode.id,
                                          })
                                        }
                                      />
                                      <Show when={projectOpen()}>
                                        <For each={projectNode.children}>
                                          {(objectiveNode) => (
                                            <GoalTreeRow
                                              node={objectiveNode}
                                              level={2}
                                              current={objectiveNode.selected}
                                              onSelect={() =>
                                                void selectTreeNode({
                                                  goalId: goal.id,
                                                  projectId: projectNode.id,
                                                  objectiveId: objectiveNode.id,
                                                })
                                              }
                                            />
                                          )}
                                        </For>
                                      </Show>
                                    </>
                                  )
                                }}
                              </For>
                            </Show>
                          </>
                        )
                      }}
                    </For>
                  </box>
                </Show>
              </Panel>
            </box>
          </Show>
        </box>

        <box flexShrink={0} paddingTop={1}>
          <TuiPluginRuntime.Slot name="home_bottom" />
        </box>

        <box flexShrink={0} border={["top"]} borderColor={theme.borderActive} paddingTop={1} paddingBottom={1}>
          <TuiPluginRuntime.Slot name="home_prompt" mode="replace" workspace_id={workspaceID()} ref={props.bind}>
            <Prompt
              ref={props.bind}
              workspaceID={workspaceID()}
              right={<TuiPluginRuntime.Slot name="home_prompt_right" workspace_id={workspaceID()} />}
              placeholders={props.placeholders}
            />
          </TuiPluginRuntime.Slot>
        </box>

        <box flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
        </box>
      </box>
      <Toast />
    </>
  )
}
