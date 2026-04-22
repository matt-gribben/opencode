import { BusEvent } from "@/bus/bus-event"
import { GlobalBus, type GlobalEvent } from "@/bus/global"
import { Flag } from "@/flag/flag"
import { InstanceState } from "@/effect"
import { Log } from "@/util"
import { Context, Effect, Layer } from "effect"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Database } from "bun:sqlite"
import z from "zod"

const log = Log.create({ service: "telemetry.local-stream" })

export const Event = {
  ContextInjectionApplied: BusEvent.define(
    "atomic.telemetry.context_injection_applied",
    z.object({
      sessionID: z.string(),
      workspaceID: z.string().optional(),
      turnID: z.string(),
      runID: z.string(),
      messageID: z.string(),
      agent: z.string(),
      systemCount: z.number(),
      instructionCount: z.number(),
      hasAtomic: z.boolean(),
      hasSkills: z.boolean(),
    }),
  ),
  ModelRequestStarted: BusEvent.define(
    "atomic.telemetry.model_request_started",
    z.object({
      sessionID: z.string(),
      workspaceID: z.string().optional(),
      turnID: z.string(),
      runID: z.string(),
      messageID: z.string(),
      providerID: z.string(),
      modelID: z.string(),
      agent: z.string(),
      toolCount: z.number(),
    }),
  ),
  ModelRequestFinished: BusEvent.define(
    "atomic.telemetry.model_request_finished",
    z.object({
      sessionID: z.string(),
      workspaceID: z.string().optional(),
      turnID: z.string(),
      runID: z.string(),
      messageID: z.string(),
      providerID: z.string(),
      modelID: z.string(),
      status: z.enum(["completed", "error", "aborted"]),
      finishReason: z.string().optional(),
      blocked: z.boolean(),
      needsCompaction: z.boolean(),
      hasError: z.boolean(),
    }),
  ),
  PermissionResolved: BusEvent.define(
    "atomic.telemetry.permission_resolved",
    z.object({
      sessionID: z.string(),
      requestID: z.string(),
      permission: z.string(),
      patterns: z.array(z.string()),
      decision: z.enum(["allow", "deny", "once", "always", "reject"]),
      source: z.enum(["ruleset", "reply"]),
      messageID: z.string().optional(),
      toolCallID: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
  FakeCapabilityRefreshed: BusEvent.define(
    "atomic.telemetry.fake_capability_refreshed",
    z.object({
      sessionID: z.string(),
      workspaceID: z.string().optional(),
      turnID: z.string(),
      runID: z.string(),
      messageID: z.string(),
      grantCount: z.number(),
      authorizedSkillsCount: z.number(),
      permissionCount: z.number(),
    }),
  ),
}

type GlobalPayload = {
  type: string
  properties: Record<string, unknown>
}

export type NormalizedLocalEvent = {
  id: string
  time: number
  type: string
  project_id?: string
  session_id?: string
  workspace_id?: string
  turn_id?: string
  run_id?: string
  message_id?: string
  part_id?: string
  tool_call_id?: string
  tool_name?: string
  status?: string
  payload_json: string
}

type RecorderContext = {
  directory: string
  worktree: string
  projectID: string
}

function telemetryPath(worktree: string) {
  return path.join(worktree, ".opencode", "atomic", "telemetry", "events.sqlite")
}

function shouldTrack(event: GlobalEvent, ctx: RecorderContext) {
  if (event.project && event.project === ctx.projectID) return true
  if (event.directory && (event.directory === ctx.directory || event.directory === ctx.worktree)) return true
  return false
}

function asPayload(event: GlobalEvent): GlobalPayload | undefined {
  if (!event.payload || typeof event.payload !== "object") return
  const payload = event.payload as Record<string, unknown>
  if (typeof payload.type !== "string") return
  return {
    type: payload.type,
    properties:
      payload.properties && typeof payload.properties === "object"
        ? (payload.properties as Record<string, unknown>)
        : {},
  }
}

function row(
  event: GlobalEvent,
  payload: GlobalPayload,
  input: Omit<NormalizedLocalEvent, "id" | "time" | "project_id" | "workspace_id" | "payload_json">,
): NormalizedLocalEvent {
  return {
    id: randomUUID(),
    time: Date.now(),
    project_id: event.project,
    workspace_id: event.workspace,
    payload_json: JSON.stringify({
      source_event_type: payload.type,
      properties: payload.properties,
    }),
    ...input,
  }
}

export function normalizeGlobalEvent(event: GlobalEvent): NormalizedLocalEvent[] {
  const payload = asPayload(event)
  if (!payload) return []
  const properties = payload.properties

  switch (payload.type) {
    case "message.updated": {
      const info = properties.info as Record<string, unknown> | undefined
      if (!info || info.role !== "user" || typeof properties.sessionID !== "string") return []
      return [
        row(event, payload, {
          type: "user_turn_submitted",
          session_id: properties.sessionID,
          turn_id: info.id as string | undefined,
          message_id: info.id as string | undefined,
          status: "submitted",
        }),
      ]
    }

    case "message.part.updated": {
      const part = properties.part as Record<string, unknown> | undefined
      const state = part?.state as Record<string, unknown> | undefined
      if (!part || part.type !== "tool" || typeof properties.sessionID !== "string" || typeof part.id !== "string") return []
      if (state?.status === "pending") {
        return [
          row(event, payload, {
            type: "tool_call_requested",
            session_id: properties.sessionID,
            message_id: part.messageID as string | undefined,
            part_id: part.id,
            tool_call_id: part.callID as string | undefined,
            tool_name: part.tool as string | undefined,
            status: "pending",
          }),
        ]
      }
      if (state?.status === "completed") {
        return [
          row(event, payload, {
            type: "tool_call_completed",
            session_id: properties.sessionID,
            message_id: part.messageID as string | undefined,
            part_id: part.id,
            tool_call_id: part.callID as string | undefined,
            tool_name: part.tool as string | undefined,
            status: "completed",
          }),
        ]
      }
      if (state?.status === "error") {
        return [
          row(event, payload, {
            type: "tool_call_failed",
            session_id: properties.sessionID,
            message_id: part.messageID as string | undefined,
            part_id: part.id,
            tool_call_id: part.callID as string | undefined,
            tool_name: part.tool as string | undefined,
            status: "error",
          }),
        ]
      }
      return []
    }

    case Event.ContextInjectionApplied.type:
      return [
        row(event, payload, {
          type: "context_injection_applied",
          session_id: properties.sessionID as string | undefined,
          turn_id: properties.turnID as string | undefined,
          run_id: properties.runID as string | undefined,
          message_id: properties.messageID as string | undefined,
          status: "applied",
        }),
      ]

    case Event.ModelRequestStarted.type:
      return [
        row(event, payload, {
          type: "model_request_started",
          session_id: properties.sessionID as string | undefined,
          turn_id: properties.turnID as string | undefined,
          run_id: properties.runID as string | undefined,
          message_id: properties.messageID as string | undefined,
          status: "started",
        }),
      ]

    case Event.ModelRequestFinished.type:
      return [
        row(event, payload, {
          type: "model_request_finished",
          session_id: properties.sessionID as string | undefined,
          turn_id: properties.turnID as string | undefined,
          run_id: properties.runID as string | undefined,
          message_id: properties.messageID as string | undefined,
          status: properties.status as string | undefined,
        }),
      ]

    case Event.PermissionResolved.type: {
      if (typeof properties.toolCallID !== "string") return []
      const decision = properties.decision as string | undefined
      const type = decision === "reject" || decision === "deny" ? "tool_call_denied" : "tool_call_approved"
      const status = type === "tool_call_denied" ? "denied" : "approved"
      return [
        row(event, payload, {
          type,
          session_id: properties.sessionID as string | undefined,
          message_id: properties.messageID as string | undefined,
          tool_call_id: properties.toolCallID,
          tool_name: properties.permission as string | undefined,
          status,
        }),
      ]
    }

    case Event.FakeCapabilityRefreshed.type:
      return [
        row(event, payload, {
          type: "fake_capability_refreshed",
          session_id: properties.sessionID as string | undefined,
          turn_id: properties.turnID as string | undefined,
          run_id: properties.runID as string | undefined,
          message_id: properties.messageID as string | undefined,
          status: "refreshed",
        }),
      ]

    case "atomic.telemetry.fake_work_item_transitioned":
      return [
        row(event, payload, {
          type: "fake_work_item_transitioned",
          session_id: properties.sessionID as string | undefined,
          turn_id: properties.turnID as string | undefined,
          run_id: properties.runID as string | undefined,
          message_id: properties.messageID as string | undefined,
          status: properties.scope as string | undefined,
        }),
      ]

    default:
      return []
  }
}

function initDb(filepath: string) {
  mkdirSync(path.dirname(filepath), { recursive: true })
  const db = new Database(filepath, { create: true })
  db.exec("PRAGMA journal_mode = WAL;")
  db.exec("PRAGMA synchronous = NORMAL;")
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      time INTEGER NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT,
      session_id TEXT,
      workspace_id TEXT,
      turn_id TEXT,
      run_id TEXT,
      message_id TEXT,
      part_id TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      status TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_time ON events(time DESC);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_session ON events(session_id, time DESC);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON events(type, time DESC);
  `)
  return db
}

function insertRows(db: Database, rows: NormalizedLocalEvent[]) {
  if (rows.length === 0) return
  const insert = db.prepare(`
    INSERT INTO events (
      id, time, type, project_id, session_id, workspace_id, turn_id, run_id,
      message_id, part_id, tool_call_id, tool_name, status, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const transaction = db.transaction((input: NormalizedLocalEvent[]) => {
    for (const item of input) {
      insert.run(
        item.id,
        item.time,
        item.type,
        item.project_id ?? null,
        item.session_id ?? null,
        item.workspace_id ?? null,
        item.turn_id ?? null,
        item.run_id ?? null,
        item.message_id ?? null,
        item.part_id ?? null,
        item.tool_call_id ?? null,
        item.tool_name ?? null,
        item.status ?? null,
        item.payload_json,
      )
    }
  })
  transaction(rows)
}

export function emitGlobalEvent(input: {
  directory: string
  projectID?: string
  workspaceID?: string
  type: string
  properties: Record<string, unknown>
}) {
  GlobalBus.emit("event", {
    directory: input.directory,
    project: input.projectID,
    workspace: input.workspaceID,
    payload: {
      type: input.type,
      properties: input.properties,
    },
  })
}

export interface Interface {
  readonly enabled: boolean
  readonly path?: string
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TelemetryLocalStream") {}

export const layer: Layer.Layer<Service, never, never> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const ctx = yield* InstanceState.context
    if (!Flag.OPENCODE_ATOMIC_LOCAL_TELEMETRY) {
      return Service.of({ enabled: false })
    }

    const filepath = telemetryPath(ctx.worktree)
    const db = initDb(filepath)
    log.info("local telemetry enabled", { path: filepath, projectID: ctx.project.id })

    const recorderCtx: RecorderContext = {
      directory: ctx.directory,
      worktree: ctx.worktree,
      projectID: ctx.project.id,
    }

    const listener = (event: GlobalEvent) => {
      if (!shouldTrack(event, recorderCtx)) return
      const rows = normalizeGlobalEvent(event)
      if (rows.length === 0) return
      try {
        insertRows(db, rows)
      } catch (error) {
        log.error("failed to write local telemetry", {
          path: filepath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    GlobalBus.on("event", listener)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        GlobalBus.off("event", listener)
        db.close()
      }),
    )

    return Service.of({ enabled: true, path: filepath })
  }),
) as Layer.Layer<Service, never, never>

export const defaultLayer = layer
