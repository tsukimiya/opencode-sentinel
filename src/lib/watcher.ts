import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import type { MonitorManager } from "./manager"

export function startWatcher(params: {
  id: string
  command: string
  sessionID: string
  v2Client: any // @opencode-ai/sdk/v2 client
  manager: MonitorManager
}): ChildProcess {
  const proc = spawn(params.command, {
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  let buffer = ""
  proc.stdout!.on("data", async (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split("\n")
    buffer = lines.pop() || "" // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue

      params.manager.incrementLines(params.id)

      try {
        await params.v2Client.session.prompt({
          sessionID: params.sessionID,
          prompt: { text: `[monitor:${params.id}] ${line}` },
          delivery: "steer",
        })
      } catch (err) {
        console.error(
          `[sentinel] steer delivery failed for monitor ${params.id}:`,
          err,
        )
      }
    }
  })

  proc.stderr!.on("data", (chunk: Buffer) => {
    const logPath = `/tmp/sentinel-${params.id}-stderr.log`
    fs.appendFileSync(logPath, chunk.toString())
  })

  proc.on("exit", async (code) => {
    if (code !== 0 && code !== null) {
      try {
        await params.v2Client.session.prompt({
          sessionID: params.sessionID,
          prompt: {
            text: `[monitor:${params.id}] process exited unexpectedly with code ${code}`,
          },
          delivery: "steer",
        })
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
