import { Database } from "bun:sqlite"
import path from "node:path"

const target = process.argv[2] ?? path.join(process.cwd(), ".opencode", "atomic", "telemetry", "events.sqlite")
const limit = Number(process.argv[3] ?? "50")

const db = new Database(target, { create: false, readonly: true })
const rows = db
  .query(
    `
      SELECT id, time, type, project_id, session_id, workspace_id, turn_id, run_id,
             message_id, part_id, tool_call_id, tool_name, status, payload_json
      FROM events
      ORDER BY time DESC
      LIMIT ?
    `,
  )
  .all(limit)

for (const row of rows) {
  const record = row as Record<string, unknown> & { payload_json: string }
  console.log(
    JSON.stringify({
      ...record,
      payload_json: JSON.parse(record.payload_json),
    }),
  )
}

db.close()
