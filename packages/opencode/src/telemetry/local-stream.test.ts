import { describe, expect, test } from "bun:test"
import * as LocalTelemetry from "./local-stream"
import { normalizeGlobalEvent, type NormalizedLocalEvent } from "./local-stream"

function normalize(type: string, properties: Record<string, unknown>): NormalizedLocalEvent[] {
  return normalizeGlobalEvent({
    directory: "/tmp/project",
    project: "project-1",
    workspace: "workspace-1",
    payload: { type, properties },
  })
}

describe("local telemetry normalizer", () => {
  test("maps user message updates into user turn events", () => {
    const rows = normalize("message.updated", {
      sessionID: "session-1",
      info: { id: "message-1", role: "user" },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.type).toBe("user_turn_submitted")
    expect(rows[0]?.turn_id).toBe("message-1")
  })

  test("maps tool part state transitions", () => {
    const requested = normalize("message.part.updated", {
      sessionID: "session-1",
      part: { id: "part-1", messageID: "run-1", type: "tool", tool: "bash", callID: "call-1", state: { status: "pending" } },
    })
    const completed = normalize("message.part.updated", {
      sessionID: "session-1",
      part: {
        id: "part-1",
        messageID: "run-1",
        type: "tool",
        tool: "bash",
        callID: "call-1",
        state: { status: "completed" },
      },
    })
    const failed = normalize("message.part.updated", {
      sessionID: "session-1",
      part: { id: "part-1", messageID: "run-1", type: "tool", tool: "bash", callID: "call-1", state: { status: "error" } },
    })

    expect(requested[0]?.type).toBe("tool_call_requested")
    expect(completed[0]?.type).toBe("tool_call_completed")
    expect(failed[0]?.type).toBe("tool_call_failed")
  })

  test("maps explicit telemetry boundaries", () => {
    const context = normalize(LocalTelemetry.Event.ContextInjectionApplied.type, {
      sessionID: "session-1",
      workspaceID: "workspace-1",
      turnID: "turn-1",
      runID: "run-1",
      messageID: "run-1",
      agent: "build",
      systemCount: 4,
      instructionCount: 1,
      hasAtomic: true,
      hasSkills: true,
    })
    const model = normalize(LocalTelemetry.Event.ModelRequestStarted.type, {
      sessionID: "session-1",
      workspaceID: "workspace-1",
      turnID: "turn-1",
      runID: "run-1",
      messageID: "run-1",
      providerID: "openai",
      modelID: "gpt-5",
      agent: "build",
      toolCount: 3,
    })
    const capability = normalize(LocalTelemetry.Event.FakeCapabilityRefreshed.type, {
      sessionID: "session-1",
      workspaceID: "workspace-1",
      turnID: "turn-1",
      runID: "run-1",
      messageID: "run-1",
      grantCount: 2,
      authorizedSkillsCount: 1,
      permissionCount: 4,
    })

    expect(context[0]?.type).toBe("context_injection_applied")
    expect(model[0]?.type).toBe("model_request_started")
    expect(capability[0]?.type).toBe("fake_capability_refreshed")
  })

  test("maps permission resolutions for tool approvals", () => {
    const approved = normalize(LocalTelemetry.Event.PermissionResolved.type, {
      sessionID: "session-1",
      requestID: "perm-1",
      permission: "bash",
      patterns: ["*"],
      decision: "once",
      source: "reply",
      messageID: "run-1",
      toolCallID: "call-1",
      metadata: {},
    })
    const denied = normalize(LocalTelemetry.Event.PermissionResolved.type, {
      sessionID: "session-1",
      requestID: "perm-2",
      permission: "webfetch",
      patterns: ["*"],
      decision: "deny",
      source: "ruleset",
      messageID: "run-1",
      toolCallID: "call-2",
      metadata: {},
    })

    expect(approved[0]?.type).toBe("tool_call_approved")
    expect(denied[0]?.type).toBe("tool_call_denied")
  })

  test("maps work item transitions", () => {
    const rows = normalize("atomic.telemetry.fake_work_item_transitioned", {
      workspaceID: "workspace-1",
      scope: "workspace",
      previous: { workItemId: "work-a" },
      next: { workItemId: "work-b" },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.type).toBe("fake_work_item_transitioned")
    expect(rows[0]?.status).toBe("workspace")
  })
})
