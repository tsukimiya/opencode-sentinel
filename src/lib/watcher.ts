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
  })

  let buffer = ""
  let batchBuffer: string[] = []
  let batchTimer: ReturnType<typeof setTimeout> | null = null

  const lineTimestamps: number[] = []
  const MAX_LINES_PER_SEC = 100

  function flushBatch() {
    if (batchBuffer.length === 0) return
    const text = batchBuffer
      .map((line) => `[monitor:${params.id}] ${line}`)
      .join("\n")
    batchBuffer = []
    batchTimer = null
    // Fire and forget — don't block the stream
    params.v2Client.v2.session
      .prompt({
        sessionID: params.sessionID,
        prompt: { text },
        delivery: "steer",
      })
      .then((result: { error?: unknown }) => {
        if (result.error) {
          console.error(
            `[sentinel] batch steer failed for ${params.id}:`,
            result.error,
          )
        }
      })
      .catch((err: unknown) => {
        console.error(
          `[sentinel] batch steer failed for ${params.id}:`,
          err,
        )
      })
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
        params.v2Client.v2.session
          .prompt({
            sessionID: params.sessionID,
            prompt: {
              text: `[monitor:${params.id}] FLOOD DETECTED: ${lineTimestamps.length} lines/sec exceeds limit of ${MAX_LINES_PER_SEC}. Monitor auto-stopped.`,
            },
            delivery: "steer",
          })
          .then((result: { error?: unknown }) => {
            if (result.error) {
              console.error(
                `[sentinel] flood steer failed for ${params.id}:`,
                result.error,
              )
            }
          })
          .catch(() => {})
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
      try {
        const result = await params.v2Client.v2.session.prompt({
          sessionID: params.sessionID,
          prompt: {
            text: `[monitor:${params.id}] process exited unexpectedly with code ${code}`,
          },
          delivery: "steer",
        })
        if (result.error) {
          console.error(
            `[sentinel] steer delivery failed for monitor ${params.id} exit:`,
            result.error,
          )
        }
      } catch (err) {
        console.error(
          `[sentinel] steer delivery failed for monitor ${params.id} exit:`,
          err,
        )
      }
    }
  })

  return proc
}
