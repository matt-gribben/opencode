import { Flock } from "@opencode-ai/shared/util/flock"
import { Permission } from "@/permission"
import { emitGlobalEvent } from "@/telemetry/local-stream"
import { Filesystem } from "@/util"
import path from "path"
import { existsSync, readFileSync } from "fs"
import z from "zod"

const CapabilityGrant = z.object({
  id: z.string(),
  title: z.string(),
  permission: z.string(),
  pattern: z.string().default("*"),
  action: z.enum(["allow", "deny", "ask"]),
  note: z.string().optional(),
})

const Objective = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  title: z.string(),
  status: z.string(),
  summary: z.string().optional(),
})

const Project = z.object({
  id: z.string(),
  goalId: z.string().optional(),
  title: z.string(),
  status: z.string(),
  summary: z.string().optional(),
})

const Goal = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  summary: z.string().optional(),
})

const WorkItem = z.object({
  id: z.string(),
  objectiveId: z.string().optional(),
  title: z.string(),
  status: z.string(),
  summary: z.string().optional(),
  agent: z.string().optional(),
  priority: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  steps: z.number().int().nonnegative().optional(),
  ageLabel: z.string().optional(),
  etaLabel: z.string().optional(),
  attentionLabel: z.string().optional(),
})

const Approval = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  note: z.string().optional(),
})

const FailedWork = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  status: z.enum(["failed", "retried", "cleared"]).default("failed"),
  note: z.string().optional(),
})

const Branding = z.object({
  enabled: z.boolean().default(false),
  title: z.string().default("Atomic-CTRL"),
})

const SessionBootstrap = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  source: z.string().default("fixtures"),
})

const DashboardMeta = z.object({
  workspaceLabel: z.string().optional(),
  planLabel: z.string().optional(),
  teamLabel: z.string().optional(),
  mcpLabel: z.string().optional(),
  uptimeLabel: z.string().optional(),
  regionLabel: z.string().optional(),
  commitLabel: z.string().optional(),
  versionLabel: z.string().optional(),
})

const DashboardStat = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  delta: z.string().optional(),
  sparkline: z.array(z.number()).default([]),
})

const DashboardEvent = z.object({
  id: z.string(),
  timestamp: z.string(),
  actor: z.string(),
  message: z.string(),
})

const DashboardAttention = z.object({
  id: z.string(),
  severity: z.enum(["low", "med", "high", "urgent"]).default("med"),
  title: z.string(),
  ageLabel: z.string().optional(),
})

const Dashboard = z.object({
  meta: DashboardMeta.default({}),
  stats: z.array(DashboardStat).default([]),
  eventStream: z.array(DashboardEvent).default([]),
  attention: z.array(DashboardAttention).default([]),
})

export const FakeAtomicBootstrap = z.object({
  sessionBootstrap: SessionBootstrap,
  goals: z.array(Goal).default([]),
  projects: z.array(Project).default([]),
  objectives: z.array(Objective).default([]),
  workItems: z.array(WorkItem).default([]),
  authorizedSkills: z.array(z.string()).default([]),
  capabilityGrants: z.array(CapabilityGrant).default([]),
  humanApprovalsQueue: z.array(Approval).default([]),
  failedWorkList: z.array(FailedWork).default([]),
  defaults: z
    .object({
      goalId: z.string().optional(),
      projectId: z.string().optional(),
      objectiveId: z.string().optional(),
      workItemId: z.string().optional(),
    })
    .default({}),
  branding: Branding.optional(),
  dashboard: Dashboard.optional(),
})

export const FakeAtomicWorkspaceState = z.object({
  workspaceID: z.string(),
  bootstrappedAt: z.number(),
  sessionBootstrap: SessionBootstrap,
  goals: z.array(Goal),
  projects: z.array(Project),
  objectives: z.array(Objective),
  workItems: z.array(WorkItem),
  currentGoalId: z.string().optional(),
  currentProjectId: z.string().optional(),
  currentObjectiveId: z.string().optional(),
  currentWorkItemId: z.string().optional(),
  branding: Branding.optional(),
  dashboard: Dashboard.optional(),
})

export const FakeAtomicSessionState = z.object({
  sessionID: z.string(),
  bootstrappedAt: z.number(),
  sessionBootstrap: SessionBootstrap,
  goals: z.array(Goal),
  projects: z.array(Project),
  objectives: z.array(Objective),
  workItems: z.array(WorkItem),
  currentGoalId: z.string().optional(),
  currentProjectId: z.string().optional(),
  currentObjectiveId: z.string().optional(),
  currentWorkItemId: z.string().optional(),
  authorizedSkills: z.array(z.string()),
  capabilityGrants: z.array(CapabilityGrant),
  humanApprovalsQueue: z.array(Approval),
  failedWorkList: z.array(FailedWork),
  branding: Branding.optional(),
  dashboard: Dashboard.optional(),
})

const Store = z.object({
  workspaces: z.record(z.string(), FakeAtomicWorkspaceState).default({}),
  sessions: z.record(z.string(), FakeAtomicSessionState).default({}),
})

export type FakeAtomicBootstrap = z.infer<typeof FakeAtomicBootstrap>
export type FakeAtomicWorkspaceState = z.infer<typeof FakeAtomicWorkspaceState>
export type FakeAtomicSessionState = z.infer<typeof FakeAtomicSessionState>
export type FakeAtomicCapabilityGrant = z.infer<typeof CapabilityGrant>
export type FakeAtomicGoal = z.infer<typeof Goal>
export type FakeAtomicProject = z.infer<typeof Project>
export type FakeAtomicObjective = z.infer<typeof Objective>
export type FakeAtomicWorkItem = z.infer<typeof WorkItem>
export type FakeAtomicApproval = z.infer<typeof Approval>
export type FakeAtomicFailedWork = z.infer<typeof FailedWork>
export type FakeAtomicDashboardMeta = z.infer<typeof DashboardMeta>
export type FakeAtomicDashboardStat = z.infer<typeof DashboardStat>
export type FakeAtomicDashboardEvent = z.infer<typeof DashboardEvent>
export type FakeAtomicDashboardAttention = z.infer<typeof DashboardAttention>

export function paths(worktree: string) {
  const root = path.join(worktree, ".opencode", "atomic")
  return {
    root,
    bootstrap: path.join(root, "bootstrap.json"),
    state: path.join(root, "state.json"),
  }
}

function lock(file: string) {
  return `atomic-ctrl:${file}`
}

async function readStore(file: string) {
  const raw = await Filesystem.readJson(file).catch(() => ({ workspaces: {}, sessions: {} }))
  const parsed = Store.safeParse(raw)
  if (!parsed.success) return { workspaces: {}, sessions: {} } satisfies z.infer<typeof Store>
  return parsed.data
}

function normalizeWorkspaceID(workspaceID?: string | null) {
  return workspaceID ?? "__default__"
}

function resolveSelection(
  bootstrap: Pick<FakeAtomicBootstrap, "goals" | "projects" | "objectives" | "workItems" | "defaults">,
  override?: {
    goalId?: string
    projectId?: string
    objectiveId?: string
    workItemId?: string
  },
) {
  const objectiveId = override?.objectiveId ?? bootstrap.defaults.objectiveId ?? bootstrap.objectives[0]?.id
  const workItemId =
    override?.workItemId ??
    bootstrap.defaults.workItemId ??
    bootstrap.workItems.find((item) => item.objectiveId === objectiveId)?.id ??
    bootstrap.workItems[0]?.id
  const workItem = bootstrap.workItems.find((item) => item.id === workItemId)
  const objective = bootstrap.objectives.find((item) => item.id === (workItem?.objectiveId ?? objectiveId))
  const projectId = override?.projectId ?? objective?.projectId ?? bootstrap.defaults.projectId ?? bootstrap.projects[0]?.id
  const project = bootstrap.projects.find((item) => item.id === projectId)
  const goalId = override?.goalId ?? project?.goalId ?? bootstrap.defaults.goalId ?? bootstrap.goals[0]?.id
  return {
    currentGoalId: goalId,
    currentProjectId: projectId,
    currentObjectiveId: workItem?.objectiveId ?? objectiveId ?? bootstrap.workItems[0]?.objectiveId,
    currentWorkItemId: workItemId,
  }
}

function fromBootstrapWorkspace(workspaceID: string | undefined, bootstrap: FakeAtomicBootstrap): FakeAtomicWorkspaceState {
  const picked = resolveSelection(bootstrap)

  return {
    workspaceID: normalizeWorkspaceID(workspaceID),
    bootstrappedAt: Date.now(),
    sessionBootstrap: bootstrap.sessionBootstrap,
    goals: structuredClone(bootstrap.goals),
    projects: structuredClone(bootstrap.projects),
    objectives: structuredClone(bootstrap.objectives),
    workItems: structuredClone(bootstrap.workItems),
    currentGoalId: picked.currentGoalId,
    currentProjectId: picked.currentProjectId,
    currentObjectiveId: picked.currentObjectiveId,
    currentWorkItemId: picked.currentWorkItemId,
    branding: bootstrap.branding ? structuredClone(bootstrap.branding) : undefined,
    dashboard: bootstrap.dashboard ? structuredClone(bootstrap.dashboard) : undefined,
  }
}

function fromBootstrapSession(
  sessionID: string,
  bootstrap: FakeAtomicBootstrap,
  override?: { goalId?: string; projectId?: string; objectiveId?: string; workItemId?: string },
): FakeAtomicSessionState {
  const picked = resolveSelection(bootstrap, override)

  return {
    sessionID,
    bootstrappedAt: Date.now(),
    sessionBootstrap: bootstrap.sessionBootstrap,
    goals: structuredClone(bootstrap.goals),
    projects: structuredClone(bootstrap.projects),
    objectives: structuredClone(bootstrap.objectives),
    workItems: structuredClone(bootstrap.workItems),
    currentGoalId: picked.currentGoalId,
    currentProjectId: picked.currentProjectId,
    currentObjectiveId: picked.currentObjectiveId,
    currentWorkItemId: picked.currentWorkItemId,
    authorizedSkills: structuredClone(bootstrap.authorizedSkills),
    capabilityGrants: structuredClone(bootstrap.capabilityGrants),
    humanApprovalsQueue: structuredClone(bootstrap.humanApprovalsQueue),
    failedWorkList: structuredClone(bootstrap.failedWorkList),
    branding: bootstrap.branding ? structuredClone(bootstrap.branding) : undefined,
    dashboard: bootstrap.dashboard ? structuredClone(bootstrap.dashboard) : undefined,
  }
}

function readStoreSync(file: string) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"))
    const parsed = Store.safeParse(raw)
    if (!parsed.success) return { workspaces: {}, sessions: {} } satisfies z.infer<typeof Store>
    return parsed.data
  } catch {
    return { workspaces: {}, sessions: {} } satisfies z.infer<typeof Store>
  }
}

export function isEnabledSync(worktree: string) {
  return existsSync(paths(worktree).bootstrap)
}

export function readBootstrapSync(worktree: string) {
  const file = paths(worktree).bootstrap
  try {
    return FakeAtomicBootstrap.parse(JSON.parse(readFileSync(file, "utf8")))
  } catch {
    return
  }
}

export async function readBootstrap(worktree: string) {
  const file = paths(worktree).bootstrap
  const raw = await Filesystem.readJson(file).catch(() => undefined)
  if (!raw) return
  return FakeAtomicBootstrap.parse(raw)
}

async function mutateSession<T>(
  worktree: string,
  sessionID: string,
  mutate: (state: FakeAtomicSessionState) => T | Promise<T>,
): Promise<T | undefined> {
  const file = paths(worktree).state
  return Flock.withLock(lock(file), async () => {
    const bootstrap = await readBootstrap(worktree)
    if (!bootstrap) return

    const store = await readStore(file)
    const state = store.sessions[sessionID] ?? fromBootstrapSession(sessionID, bootstrap)
    store.sessions[sessionID] = state

    const result = await mutate(state)
    await Filesystem.writeJson(file, store)
    return result
  })
}

async function mutateWorkspace<T>(
  worktree: string,
  workspaceID: string | undefined,
  mutate: (state: FakeAtomicWorkspaceState) => T | Promise<T>,
): Promise<T | undefined> {
  const file = paths(worktree).state
  return Flock.withLock(lock(file), async () => {
    const bootstrap = await readBootstrap(worktree)
    if (!bootstrap) return

    const store = await readStore(file)
    const key = normalizeWorkspaceID(workspaceID)
    const state = store.workspaces[key] ?? fromBootstrapWorkspace(workspaceID, bootstrap)
    store.workspaces[key] = state

    const result = await mutate(state)
    await Filesystem.writeJson(file, store)
    return result
  })
}

export async function getWorkspaceState(worktree: string, workspaceID?: string | null) {
  const bootstrap = await readBootstrap(worktree)
  if (!bootstrap) return

  const key = normalizeWorkspaceID(workspaceID)
  const file = paths(worktree).state
  const store = await readStore(file)
  const existing = store.workspaces[key]
  if (existing) return existing

  return mutateWorkspace(worktree, workspaceID ?? undefined, async (state) => state)
}

export function getWorkspaceStateSync(worktree: string, workspaceID?: string | null) {
  const bootstrap = readBootstrapSync(worktree)
  if (!bootstrap) return

  const key = normalizeWorkspaceID(workspaceID)
  const file = paths(worktree).state
  const store = readStoreSync(file)
  return store.workspaces[key] ?? fromBootstrapWorkspace(workspaceID ?? undefined, bootstrap)
}

export async function selectWorkspaceWorkItem(worktree: string, workspaceID: string | undefined, workItemID: string) {
  let previous = {
    goalId: undefined as string | undefined,
    projectId: undefined as string | undefined,
    objectiveId: undefined as string | undefined,
    workItemId: undefined as string | undefined,
  }
  const result = await mutateWorkspace(worktree, workspaceID, async (state) => {
    previous = {
      goalId: state.currentGoalId,
      projectId: state.currentProjectId,
      objectiveId: state.currentObjectiveId,
      workItemId: state.currentWorkItemId,
    }
    const next = state.workItems.find((item) => item.id === workItemID)
    if (!next) throw new Error(`Unknown work item: ${workItemID}`)
    state.currentWorkItemId = next.id
    if (next.objectiveId) {
      state.currentObjectiveId = next.objectiveId
      const objective = state.objectives.find((item) => item.id === next.objectiveId)
      if (objective?.projectId) {
        state.currentProjectId = objective.projectId
        const project = state.projects.find((item) => item.id === objective.projectId)
        if (project?.goalId) state.currentGoalId = project.goalId
      }
    }
    return state
  })
  if (result) {
    emitGlobalEvent({
      directory: worktree,
      workspaceID,
      type: "atomic.telemetry.fake_work_item_transitioned",
      properties: {
        workspaceID,
        scope: "workspace",
        previous,
        next: {
          goalId: result.currentGoalId,
          projectId: result.currentProjectId,
          objectiveId: result.currentObjectiveId,
          workItemId: result.currentWorkItemId,
        },
      },
    })
  }
  return result
}

export async function selectWorkspaceContext(
  worktree: string,
  workspaceID: string | undefined,
  input: { goalId?: string; projectId?: string; objectiveId?: string },
) {
  let previous = {
    goalId: undefined as string | undefined,
    projectId: undefined as string | undefined,
    objectiveId: undefined as string | undefined,
    workItemId: undefined as string | undefined,
  }
  const result = await mutateWorkspace(worktree, workspaceID, async (state) => {
    previous = {
      goalId: state.currentGoalId,
      projectId: state.currentProjectId,
      objectiveId: state.currentObjectiveId,
      workItemId: state.currentWorkItemId,
    }
    if (input.goalId) {
      const goal = state.goals.find((item) => item.id === input.goalId)
      if (!goal) throw new Error(`Unknown goal: ${input.goalId}`)
      state.currentGoalId = goal.id
    }

    if (input.projectId) {
      const project = state.projects.find((item) => item.id === input.projectId)
      if (!project) throw new Error(`Unknown project: ${input.projectId}`)
      state.currentProjectId = project.id
      if (project.goalId) state.currentGoalId = project.goalId
    }

    if (input.objectiveId) {
      const objective = state.objectives.find((item) => item.id === input.objectiveId)
      if (!objective) throw new Error(`Unknown objective: ${input.objectiveId}`)
      state.currentObjectiveId = objective.id
      if (objective.projectId) {
        state.currentProjectId = objective.projectId
        const project = state.projects.find((item) => item.id === objective.projectId)
        if (project?.goalId) state.currentGoalId = project.goalId
      }
      const nextWork =
        state.workItems.find((item) => item.objectiveId === objective.id && item.id === state.currentWorkItemId) ??
        state.workItems.find((item) => item.objectiveId === objective.id)
      if (nextWork) state.currentWorkItemId = nextWork.id
    }

    return state
  })
  if (result) {
    emitGlobalEvent({
      directory: worktree,
      workspaceID,
      type: "atomic.telemetry.fake_work_item_transitioned",
      properties: {
        workspaceID,
        scope: "workspace",
        previous,
        next: {
          goalId: result.currentGoalId,
          projectId: result.currentProjectId,
          objectiveId: result.currentObjectiveId,
          workItemId: result.currentWorkItemId,
        },
      },
    })
  }
  return result
}

export async function bootstrapSessionFromWorkspace(worktree: string, workspaceID: string | undefined, sessionID: string) {
  const file = paths(worktree).state
  return Flock.withLock(lock(file), async () => {
    const bootstrap = await readBootstrap(worktree)
    if (!bootstrap) return

    const store = await readStore(file)
    const workspaceKey = normalizeWorkspaceID(workspaceID)
    const workspace = store.workspaces[workspaceKey] ?? fromBootstrapWorkspace(workspaceID, bootstrap)
    const session = store.sessions[sessionID] ?? fromBootstrapSession(sessionID, bootstrap)

    // Home-dashboard workspace state is the source of truth for newly created
    // sessions. Apply it even if the session already has default Atomic
    // state, so an earlier read cannot lock in stale defaults.
    session.currentGoalId = workspace.currentGoalId
    session.currentProjectId = workspace.currentProjectId
    session.currentObjectiveId = workspace.currentObjectiveId
    session.currentWorkItemId = workspace.currentWorkItemId

    store.workspaces[workspaceKey] = workspace
    store.sessions[sessionID] = session
    await Filesystem.writeJson(file, store)
    return session
  })
}

export async function bootstrapSession(worktree: string, sessionID: string) {
  return mutateSession(worktree, sessionID, async (state) => state)
}

export async function getSessionState(worktree: string, sessionID: string) {
  const bootstrap = await readBootstrap(worktree)
  if (!bootstrap) return

  const file = paths(worktree).state
  const store = await readStore(file)
  const existing = store.sessions[sessionID]
  if (existing) return existing

  return bootstrapSession(worktree, sessionID)
}

export function getSessionStateSync(worktree: string, sessionID: string) {
  const bootstrap = readBootstrapSync(worktree)
  if (!bootstrap) return

  const file = paths(worktree).state
  const store = readStoreSync(file)
  return store.sessions[sessionID] ?? fromBootstrapSession(sessionID, bootstrap)
}

export async function listAvailableWork(worktree: string, sessionID: string) {
  const state = await getSessionState(worktree, sessionID)
  if (!state) return []
  return state.workItems
}

export async function selectWorkItem(worktree: string, sessionID: string, workItemID: string) {
  let previous = {
    goalId: undefined as string | undefined,
    projectId: undefined as string | undefined,
    objectiveId: undefined as string | undefined,
    workItemId: undefined as string | undefined,
  }
  const result = await mutateSession(worktree, sessionID, async (state) => {
    previous = {
      goalId: state.currentGoalId,
      projectId: state.currentProjectId,
      objectiveId: state.currentObjectiveId,
      workItemId: state.currentWorkItemId,
    }
    const next = state.workItems.find((item) => item.id === workItemID)
    if (!next) throw new Error(`Unknown work item: ${workItemID}`)
    state.currentWorkItemId = next.id
    if (next.objectiveId) {
      state.currentObjectiveId = next.objectiveId
      const objective = state.objectives.find((item) => item.id === next.objectiveId)
      if (objective?.projectId) {
        state.currentProjectId = objective.projectId
        const project = state.projects.find((item) => item.id === objective.projectId)
        if (project?.goalId) state.currentGoalId = project.goalId
      }
    }
    return state
  })
  if (result) {
    emitGlobalEvent({
      directory: worktree,
      type: "atomic.telemetry.fake_work_item_transitioned",
      properties: {
        sessionID,
        scope: "session",
        previous,
        next: {
          goalId: result.currentGoalId,
          projectId: result.currentProjectId,
          objectiveId: result.currentObjectiveId,
          workItemId: result.currentWorkItemId,
        },
      },
    })
  }
  return result
}

export async function approveItem(worktree: string, sessionID: string, approvalID: string) {
  return mutateSession(worktree, sessionID, async (state) => {
    const item = state.humanApprovalsQueue.find((entry) => entry.id === approvalID)
    if (!item) throw new Error(`Unknown approval item: ${approvalID}`)
    item.status = "approved"
    return state
  })
}

export async function rejectItem(worktree: string, sessionID: string, approvalID: string, note?: string) {
  return mutateSession(worktree, sessionID, async (state) => {
    const item = state.humanApprovalsQueue.find((entry) => entry.id === approvalID)
    if (!item) throw new Error(`Unknown approval item: ${approvalID}`)
    item.status = "rejected"
    item.note = note
    return state
  })
}

export async function retryFailedWork(worktree: string, sessionID: string, failureID: string) {
  return mutateSession(worktree, sessionID, async (state) => {
    const item = state.failedWorkList.find((entry) => entry.id === failureID)
    if (!item) throw new Error(`Unknown failed work item: ${failureID}`)
    item.status = "retried"
    return state
  })
}

export async function clearFailedWork(worktree: string, sessionID: string, failureID: string) {
  return mutateSession(worktree, sessionID, async (state) => {
    const item = state.failedWorkList.find((entry) => entry.id === failureID)
    if (!item) throw new Error(`Unknown failed work item: ${failureID}`)
    item.status = "cleared"
    return state
  })
}

type AtomicSelectionState = {
  goals: FakeAtomicGoal[]
  projects: FakeAtomicProject[]
  objectives: FakeAtomicObjective[]
  workItems: FakeAtomicWorkItem[]
  currentGoalId?: string
  currentProjectId?: string
  currentObjectiveId?: string
  currentWorkItemId?: string
}

export function currentGoal(state: AtomicSelectionState) {
  return state.goals.find((item) => item.id === state.currentGoalId)
}

export function currentProject(state: AtomicSelectionState) {
  return state.projects.find((item) => item.id === state.currentProjectId)
}

export function currentObjective(state: AtomicSelectionState) {
  return state.objectives.find((item) => item.id === state.currentObjectiveId)
}

export function currentWorkItem(state: AtomicSelectionState) {
  return state.workItems.find((item) => item.id === state.currentWorkItemId)
}

export function activeApprovals(state: FakeAtomicSessionState) {
  return state.humanApprovalsQueue.filter((item) => item.status === "pending")
}

export function activeFailures(state: FakeAtomicSessionState) {
  return state.failedWorkList.filter((item) => item.status === "failed")
}

export function toPermissionRules(state: FakeAtomicSessionState): Permission.Ruleset {
  const grants = state.capabilityGrants.map((grant) => ({
    permission: grant.permission,
    pattern: grant.pattern,
    action: grant.action,
  }))

  if (state.authorizedSkills.length === 0) return grants

  return [
    ...grants,
    { permission: "skill", pattern: "*", action: "deny" },
    ...state.authorizedSkills.map((name) => ({
      permission: "skill",
      pattern: name,
      action: "allow" as const,
    })),
  ]
}

export function toSystemPrompt(state: FakeAtomicSessionState) {
  const goal = currentGoal(state)
  const project = currentProject(state)
  const objective = currentObjective(state)
  const workItem = currentWorkItem(state)
  const approvals = activeApprovals(state)
  const failures = activeFailures(state)

  return [
    "<atomic_ctrl>",
    `Session bootstrap: ${state.sessionBootstrap.title} (${state.sessionBootstrap.source})`,
    goal ? `Current goal: ${goal.title} [${goal.id}] status=${goal.status}` : "Current goal: none",
    project ? `Current project: ${project.title} [${project.id}] status=${project.status}` : "Current project: none",
    objective
      ? `Current objective: ${objective.title} [${objective.id}] status=${objective.status}`
      : "Current objective: none",
    workItem ? `Current work item: ${workItem.title} [${workItem.id}] status=${workItem.status}` : "Current work item: none",
    `Authorized skills: ${state.authorizedSkills.length ? state.authorizedSkills.join(", ") : "none"}`,
    "Capability grants:",
    ...(state.capabilityGrants.length
      ? state.capabilityGrants.map((grant) => {
          const suffix = grant.note ? ` (${grant.note})` : ""
          return `- ${grant.title}: ${grant.permission} ${grant.pattern} => ${grant.action}${suffix}`
        })
      : ["- none"]),
    `Human approvals queue: ${approvals.length} pending / ${state.humanApprovalsQueue.length} total`,
    `Failed work list: ${failures.length} active / ${state.failedWorkList.length} total`,
    "</atomic_ctrl>",
  ].join("\n")
}

export function toViewModel(state: FakeAtomicSessionState) {
  return {
    state,
    goal: currentGoal(state),
    project: currentProject(state),
    objective: currentObjective(state),
    workItem: currentWorkItem(state),
    approvals: activeApprovals(state),
    failures: activeFailures(state),
    permissions: toPermissionRules(state),
    systemPrompt: toSystemPrompt(state),
  }
}

function dashboardState(status: string) {
  if (status === "in_progress" || status === "active" || status === "running") return "running"
  if (status === "ready" || status === "queued" || status === "planned") return "queued"
  if (status === "review") return "review"
  if (status === "blocked") return "blocked"
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  return "queued"
}

function stateRank(status: string) {
  if (status === "failed") return 6
  if (status === "blocked") return 5
  if (status === "review") return 4
  if (status === "running") return 3
  if (status === "queued") return 2
  if (status === "completed") return 1
  return 0
}

function rollupStatus(values: string[]) {
  if (!values.length) return "queued"
  return values.reduce((best, next) => (stateRank(next) > stateRank(best) ? next : best), values[0]!)
}

function averageProgress(values: number[]) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function dashboardStats(
  state: FakeAtomicWorkspaceState,
  counts: {
    all: number
    running: number
    queued: number
    review: number
    blocked: number
    completed: number
    failed: number
  },
) {
  if (state.dashboard?.stats?.length) return state.dashboard.stats

  return [
    { id: "active_jobs", label: "Active Jobs", value: String(counts.running), delta: undefined, sparkline: [] },
    { id: "review_queue", label: "Review Queue", value: String(counts.review), delta: undefined, sparkline: [] },
    { id: "blocked", label: "Blocked", value: String(counts.blocked), delta: undefined, sparkline: [] },
    { id: "failed", label: "Failed", value: String(counts.failed), delta: undefined, sparkline: [] },
  ]
}

export function toDashboardViewModel(state: FakeAtomicWorkspaceState) {
  const goal = currentGoal(state)
  const project = currentProject(state)
  const objective = currentObjective(state)
  const workItem = currentWorkItem(state)
  const jobs = state.workItems.map((item) => ({
    ...item,
    dashboardState: dashboardState(item.status),
    progress: item.progress ?? 0,
    steps: item.steps ?? 0,
    agent: item.agent ?? "agent",
    priority: item.priority ?? "med",
    ageLabel: item.ageLabel ?? "—",
    etaLabel: item.etaLabel ?? "—",
  }))

  const count = (status: string) => jobs.filter((item) => item.dashboardState === status).length
  const counts = {
    all: jobs.length,
    running: count("running"),
    queued: count("queued"),
    review: count("review"),
    blocked: count("blocked"),
    completed: count("completed"),
    failed: count("failed"),
  }

  return {
    state,
    goal,
    project,
    objective,
    workItem,
    jobs,
    counts,
    meta: state.dashboard?.meta ?? {},
    stats: dashboardStats(state, counts),
    eventStream: state.dashboard?.eventStream ?? [],
    attention: state.dashboard?.attention ?? [],
  }
}

export type GoalsTreeNode =
  | {
      type: "goal"
      id: string
      title: string
      status: string
      progress: number
      projectCount: number
      selected: boolean
      children: Array<{
        type: "project"
        id: string
        goalId?: string
        title: string
        status: string
        progress: number
        objectiveCount: number
        selected: boolean
        children: Array<{
          type: "objective"
          id: string
          projectId?: string
          title: string
          status: string
          progress: number
          jobCount: number
          selected: boolean
        }>
      }>
    }

export function toGoalsTreeViewModel(state: FakeAtomicWorkspaceState) {
  const jobs = state.workItems.map((item) => ({
    ...item,
    dashboardState: dashboardState(item.status),
    progress: item.progress ?? 0,
  }))

  const objectiveNodes = state.objectives.map((objective) => {
    const objectiveJobs = jobs.filter((job) => job.objectiveId === objective.id)
    return {
      type: "objective" as const,
      id: objective.id,
      projectId: objective.projectId,
      title: objective.title,
      status: rollupStatus(objectiveJobs.map((job) => job.dashboardState).length ? objectiveJobs.map((job) => job.dashboardState) : [dashboardState(objective.status)]),
      progress: averageProgress(objectiveJobs.map((job) => job.progress)),
      jobCount: objectiveJobs.length,
      selected: state.currentObjectiveId === objective.id,
    }
  })

  const projectNodes = state.projects.map((project) => {
    const children = objectiveNodes.filter((node) => node.projectId === project.id)
    return {
      type: "project" as const,
      id: project.id,
      goalId: project.goalId,
      title: project.title,
      status: rollupStatus(children.map((item) => item.status).length ? children.map((item) => item.status) : [dashboardState(project.status)]),
      progress: averageProgress(children.map((item) => item.progress)),
      objectiveCount: children.length,
      selected: state.currentProjectId === project.id,
      children,
    }
  })

  const goalNodes = state.goals.map((goal) => {
    const children = projectNodes.filter((node) => node.goalId === goal.id)
    return {
      type: "goal" as const,
      id: goal.id,
      title: goal.title,
      status: rollupStatus(children.map((item) => item.status).length ? children.map((item) => item.status) : [dashboardState(goal.status)]),
      progress: averageProgress(children.map((item) => item.progress)),
      projectCount: children.length,
      selected: state.currentGoalId === goal.id,
      children,
    }
  })

  return {
    state,
    currentGoal: currentGoal(state),
    currentProject: currentProject(state),
    currentObjective: currentObjective(state),
    currentWorkItem: currentWorkItem(state),
    goals: goalNodes,
  }
}
