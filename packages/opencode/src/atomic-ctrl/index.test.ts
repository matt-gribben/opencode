import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import os from "os"
import path from "path"
import { GlobalBus } from "@/bus/global"
import { Filesystem } from "@/util"
import {
  bootstrapSession,
  bootstrapSessionFromWorkspace,
  getWorkspaceStateSync,
  paths,
  readBootstrap,
  selectWorkspaceContext,
  selectWorkspaceWorkItem,
  selectWorkItem,
  toDashboardViewModel,
  toGoalsTreeViewModel,
  toPermissionRules,
  type FakeAtomicBootstrap,
} from "./index"

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

async function tempWorktree() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "atomic-ctrl-"))
  tempDirs.push(dir)
  await mkdir(path.join(dir, ".opencode", "atomic"), { recursive: true })
  return dir
}

const sample: FakeAtomicBootstrap = {
  sessionBootstrap: {
    id: "fake-bootstrap",
    title: "Atomic Session",
    source: "fixtures",
  },
  goals: [{ id: "goal-a", title: "Goal A", status: "active" }],
  projects: [{ id: "project-a", goalId: "goal-a", title: "Project A", status: "active" }],
  objectives: [{ id: "obj-a", projectId: "project-a", title: "Objective A", status: "active" }],
  workItems: [
    { id: "work-a", objectiveId: "obj-a", title: "Work A", status: "ready" },
    { id: "work-b", objectiveId: "obj-a", title: "Work B", status: "ready" },
  ],
  authorizedSkills: ["skill-alpha"],
  capabilityGrants: [{ id: "edit-all", title: "Edit files", permission: "edit", pattern: "*", action: "allow" }],
  humanApprovalsQueue: [{ id: "approval-a", title: "Approve deploy", status: "pending" }],
  failedWorkList: [{ id: "failed-a", title: "Failed indexing job", status: "failed" }],
  defaults: {
    goalId: "goal-a",
    projectId: "project-a",
    objectiveId: "obj-a",
    workItemId: "work-a",
  },
  branding: {
    enabled: true,
    title: "Atomic-CTRL",
  },
  dashboard: {
    meta: {
      workspaceLabel: "workspace test-bed",
    },
    stats: [{ id: "jobs", label: "Jobs", value: "2", sparkline: [1, 2, 3] }],
    eventStream: [{ id: "evt-a", timestamp: "12:00", actor: "planner", message: "queued work" }],
    attention: [{ id: "job-a", severity: "high", title: "Resolve job" }],
  },
}

describe("atomic-ctrl control plane", () => {
  test("reads bootstrap fixtures and creates per-session state", async () => {
    const worktree = await tempWorktree()
    await Filesystem.writeJson(paths(worktree).bootstrap, sample)

    const bootstrap = await readBootstrap(worktree)
    expect(bootstrap?.sessionBootstrap.id).toBe("fake-bootstrap")

    const state = await bootstrapSession(worktree, "session-1")
    expect(state?.currentGoalId).toBe("goal-a")
    expect(state?.currentProjectId).toBe("project-a")
    expect(state?.currentObjectiveId).toBe("obj-a")
    expect(state?.currentWorkItemId).toBe("work-a")
    expect(state?.humanApprovalsQueue).toHaveLength(1)
  })

  test("selecting a work item updates persisted session state", async () => {
    const worktree = await tempWorktree()
    await Filesystem.writeJson(paths(worktree).bootstrap, sample)

    await bootstrapSession(worktree, "session-2")
    const state = await selectWorkItem(worktree, "session-2", "work-b")
    expect(state?.currentWorkItemId).toBe("work-b")
    expect(state?.currentObjectiveId).toBe("obj-a")
  })

  test("workspace selection persists and seeds new sessions", async () => {
    const worktree = await tempWorktree()
    await Filesystem.writeJson(paths(worktree).bootstrap, sample)

    const workspace = getWorkspaceStateSync(worktree, "workspace-a")
    expect(workspace?.currentGoalId).toBe("goal-a")
    expect(workspace?.currentProjectId).toBe("project-a")
    expect(workspace?.currentWorkItemId).toBe("work-a")

    await selectWorkspaceWorkItem(worktree, "workspace-a", "work-b")
    const nextWorkspace = getWorkspaceStateSync(worktree, "workspace-a")
    expect(nextWorkspace?.currentWorkItemId).toBe("work-b")

    const session = await bootstrapSessionFromWorkspace(worktree, "workspace-a", "session-seeded")
    expect(session?.currentGoalId).toBe("goal-a")
    expect(session?.currentProjectId).toBe("project-a")
    expect(session?.currentWorkItemId).toBe("work-b")
  })

  test("workspace bootstrap overrides stale default session selection", async () => {
    const worktree = await tempWorktree()
    await Filesystem.writeJson(paths(worktree).bootstrap, sample)

    await bootstrapSession(worktree, "session-stale")
    await selectWorkspaceWorkItem(worktree, "workspace-seed", "work-b")

    const session = await bootstrapSessionFromWorkspace(worktree, "workspace-seed", "session-stale")
    expect(session?.currentGoalId).toBe("goal-a")
    expect(session?.currentProjectId).toBe("project-a")
    expect(session?.currentObjectiveId).toBe("obj-a")
    expect(session?.currentWorkItemId).toBe("work-b")
  })

  test("work item selection emits transition telemetry", async () => {
    const worktree = await tempWorktree()
    await Filesystem.writeJson(paths(worktree).bootstrap, sample)

    const seen: any[] = []
    const listener = (event: any) => {
      if (event.payload?.type === "atomic.telemetry.fake_work_item_transitioned") seen.push(event)
    }
    GlobalBus.on("event", listener)
    try {
      await bootstrapSession(worktree, "session-telemetry")
      await selectWorkItem(worktree, "session-telemetry", "work-b")
    } finally {
      GlobalBus.off("event", listener)
    }

    expect(seen).toHaveLength(1)
    expect(seen[0]?.payload?.properties?.previous?.workItemId).toBe("work-a")
    expect(seen[0]?.payload?.properties?.next?.workItemId).toBe("work-b")
    expect(seen[0]?.payload?.properties?.scope).toBe("session")
  })

  test("dashboard view model derives filter counts from work item state", () => {
    const workspace = {
      workspaceID: "workspace-b",
      bootstrappedAt: Date.now(),
      sessionBootstrap: sample.sessionBootstrap,
      goals: sample.goals,
      projects: sample.projects,
      objectives: sample.objectives,
      workItems: [
        { id: "run", objectiveId: "obj-a", title: "Run", status: "running", progress: 40 },
        { id: "queue", objectiveId: "obj-a", title: "Queue", status: "queued", progress: 0 },
        { id: "review", objectiveId: "obj-a", title: "Review", status: "review", progress: 100 },
      ],
      currentGoalId: "goal-a",
      currentProjectId: "project-a",
      currentObjectiveId: "obj-a",
      currentWorkItemId: "run",
      branding: sample.branding,
      dashboard: sample.dashboard,
    }

    const view = toDashboardViewModel(workspace)
    expect(view.counts.all).toBe(3)
    expect(view.counts.running).toBe(1)
    expect(view.counts.queued).toBe(1)
    expect(view.counts.review).toBe(1)
  })

  test("workspace context selection updates goal, project, and objective", async () => {
    const worktree = await tempWorktree()
    await Filesystem.writeJson(paths(worktree).bootstrap, sample)

    await selectWorkspaceContext(worktree, "workspace-c", { goalId: "goal-a", projectId: "project-a", objectiveId: "obj-a" })
    const workspace = getWorkspaceStateSync(worktree, "workspace-c")
    expect(workspace?.currentGoalId).toBe("goal-a")
    expect(workspace?.currentProjectId).toBe("project-a")
    expect(workspace?.currentObjectiveId).toBe("obj-a")
    expect(workspace?.currentWorkItemId).toBe("work-a")
  })

  test("goals tree view model builds the hierarchy", () => {
    const workspace = {
      workspaceID: "workspace-d",
      bootstrappedAt: Date.now(),
      sessionBootstrap: sample.sessionBootstrap,
      goals: sample.goals,
      projects: sample.projects,
      objectives: sample.objectives,
      workItems: sample.workItems,
      currentGoalId: "goal-a",
      currentProjectId: "project-a",
      currentObjectiveId: "obj-a",
      currentWorkItemId: "work-a",
      branding: sample.branding,
      dashboard: sample.dashboard,
    }

    const tree = toGoalsTreeViewModel(workspace)
    expect(tree.goals).toHaveLength(1)
    expect(tree.goals[0]?.children).toHaveLength(1)
    expect(tree.goals[0]?.children[0]?.children).toHaveLength(1)
    expect(tree.goals[0]?.children[0]?.children[0]?.id).toBe("obj-a")
  })

  test("authorized skills become real permission rules", () => {
    const rules = toPermissionRules({
      sessionID: "session-3",
      bootstrappedAt: Date.now(),
      sessionBootstrap: sample.sessionBootstrap,
      goals: sample.goals,
      projects: sample.projects,
      objectives: sample.objectives,
      workItems: sample.workItems,
      currentGoalId: "goal-a",
      currentProjectId: "project-a",
      currentObjectiveId: "obj-a",
      currentWorkItemId: "work-a",
      authorizedSkills: sample.authorizedSkills,
      capabilityGrants: sample.capabilityGrants,
      humanApprovalsQueue: sample.humanApprovalsQueue,
      failedWorkList: sample.failedWorkList,
      branding: sample.branding,
      dashboard: sample.dashboard,
    })

    expect(rules.some((rule) => rule.permission === "edit" && rule.action === "allow")).toBe(true)
    expect(rules.some((rule) => rule.permission === "skill" && rule.pattern === "*" && rule.action === "deny")).toBe(
      true,
    )
    expect(
      rules.some((rule) => rule.permission === "skill" && rule.pattern === "skill-alpha" && rule.action === "allow"),
    ).toBe(true)
  })
})
