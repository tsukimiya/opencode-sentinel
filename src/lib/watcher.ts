import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import type { MonitorManager } from "./manager"

export function startWatcher(params: {
  id: string
  command: string
  sessionID: string
  v2Client: OpencodeClient
  manager: MonitorManager
}): ChildProcess {
  const proc = spawn(params.command, {
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SENTINEL_SESSION_ID: params.sessionID },
  })

  let buffer = ""
  let batchBuffer: string[] = []
  let batchTimer: ReturnType<typeof setTimeout> | null = null

  const lineTimestamps: number[] = []
  const MAX_LINES_PER_SEC = 100

  // Send a notification as a regular session message (parts route).
  // The v2 prompt/delivery API only feeds an already-running agent loop —
  // on an idle session the input is admitted but never promoted, so the
  // message route is the only delivery that works in every session state.
  function notify(text: string, label: string): Promise<void> {
    return params.v2Client.session
      .prompt({
        sessionID: params.sessionID,
        parts: [{ type: "text", text }],
      })
      .then((result: { error?: unknown }) => {
        if (result.error) {
          console.error(
            `[sentinel] ${label} notify failed for ${params.id}:`,
            result.error,
          )
        }
      })
      .catch((err: unknown) => {
        console.error(
          `[sentinel] ${label} notify failed for ${params.id}:`,
          err,
        )
      })
  }

  function flushBatch() {
    if (batchBuffer.length === 0) return
    const text = batchBuffer
      .map((line) => `[monitor:${params.id}] ${line}`)
      .join("\n")
    batchBuffer = []
    batchTimer = null
    // Fire and forget — don't block the stream
    notify(text, "batch")
  }

  proc.stdout!.on("data", async (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split("\n")
    buffer = lines.pop() || "" // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue

      params.manager.incrementLines(params.id)

      const now = Date.now()
      lineTimestamps.push(now)
      while (
        lineTimestamps.length > 0 &&
        lineTimestamps[0] < now - 1000
      ) {
        lineTimestamps.shift()
      }

      if (lineTimestamps.length > MAX_LINES_PER_SEC) {
        if (proc.pid) {
          try {
            process.kill(-proc.pid, "SIGTERM")
          } catch {}
        }
        notify(
          `[monitor:${params.id}] FLOOD DETECTED: ${lineTimestamps.length} lines/sec exceeds limit of ${MAX_LINES_PER_SEC}. Monitor auto-stopped.`,
          "flood",
        )
        params.manager.stop(params.id)
        return
      }

      batchBuffer.push(line)
      if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, 200)
      }
    }
  })

  proc.stderr!.on("data", (chunk: Buffer) => {
    const logPath = `/tmp/sentinel-${params.id}-stderr.log`
    fs.appendFileSync(logPath, chunk.toString())
  })

  proc.on("exit", async (code) => {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
    if (batchBuffer.length > 0) {
      flushBatch()
    }

    if (code !== 0 && code !== null) {
      await notify(
        `[monitor:${params.id}] process exited unexpectedly with code ${code}`,
        "exit",
      )
    }
  })

  return proc
}
