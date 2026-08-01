import { tool } from "@opencode-ai/plugin"
import { manager } from "./lib/manager"

export const sentinel_list = tool({
  description: "List all currently running monitors with their status (ID, description, command, started time, lines emitted).",
  args: {},
  async execute() {
    const monitors = manager.list()
    if (monitors.length === 0) {
      return "No monitors are currently running."
    }
    return monitors
      .map((m) => {
        let s = `[${m.id}] ${m.description}\n  command: ${m.command}\n  started: ${m.startedAt}\n  lines: ${m.linesEmitted}`
        if (m.filter) s += `\n  filter: ${m.filter}`
        if (m.until) s += `\n  until: ${m.until}`
        return s
      })
      .join("\n\n")
  },
})
