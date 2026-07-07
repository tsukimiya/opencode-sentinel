import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { manager } from "./lib/manager"
import { startWatcher } from "./lib/watcher"
import { generateId, timestamp } from "./lib/util"
import description from "./monitor.txt" with { type: "text" }

export function createMonitorTool(v2Client: any) {
  return tool({
    description,
    args: {
      command: z
        .string()
        .describe(
          "Shell command to execute and watch (e.g., 'tail -f /var/log/app.log | grep --line-buffered ERROR')",
        ),
      description: z
        .string()
        .describe("Human-readable label shown in monitor notifications"),
    },
    async execute(args, ctx) {
      const id = generateId()
      const proc = startWatcher({
        id,
        command: args.command,
        sessionID: ctx.sessionID,
        v2Client,
        manager,
      })
      manager.start({
        id,
        proc,
        description: args.description,
        command: args.command,
        startedAt: timestamp(),
        linesEmitted: 0,
      })
      return `Monitor started: ${id}\nCommand: ${args.command}\nUse sentinel_stop to stop it.`
    },
  })
}
