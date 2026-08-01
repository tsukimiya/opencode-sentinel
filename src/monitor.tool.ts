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
      filter: z
        .string()
        .optional()
        .describe(
          "JavaScript regular expression. Only stdout lines matching this regex are notified; non-matching lines are silently dropped.",
        ),
      until: z
        .string()
        .optional()
        .describe(
          'JavaScript regular expression. When a line matches (after filter, if set), the line is notified and the monitor auto-stops. Useful for one-shot wait patterns like "wake me when CI finishes".',
        ),
    },
    async execute(args, ctx) {
      if (args.filter) {
        try {
          new RegExp(args.filter)
        } catch (e: any) {
          return `Invalid filter regex: ${e.message}`
        }
      }
      if (args.until) {
        try {
          new RegExp(args.until)
        } catch (e: any) {
          return `Invalid until regex: ${e.message}`
        }
      }

      const id = generateId()
      const proc = startWatcher({
        id,
        command: args.command,
        sessionID: ctx.sessionID,
        v2Client,
        manager,
        filter: args.filter,
        until: args.until,
      })
      manager.start({
        id,
        proc,
        description: args.description,
        command: args.command,
        startedAt: timestamp(),
        linesEmitted: 0,
        filter: args.filter,
        until: args.until,
      })
      return `Monitor started: ${id}\nCommand: ${args.command}\nUse sentinel_stop to stop it.`
    },
  })
}
