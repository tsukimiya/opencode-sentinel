import { tool } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { createMonitorTool } from "./monitor.tool"
import { sentinel_list } from "./list.tool"
import { sentinel_stop } from "./stop.tool"
import { manager } from "./lib/manager"

interface ToolContext {
  sessionID: string
  abort: AbortSignal
}

export default async (input: any) => {
  const v2 = createOpencodeClient({ baseUrl: input.serverUrl.toString() })

  return {
    tool: {
      sentinel_monitor: createMonitorTool(v2),

      sentinel_stop,

      sentinel_list,

      sentinel_ping: tool({
        description: "Health check for the sentinel plugin. Returns pong if the plugin is loaded and operational.",
        args: {},
        async execute() {
          return "pong"
        },
      }),

      sentinel_spike: tool({
        description: "Spike test: schedules a delayed steer delivery via v2 SDK to verify the wake mechanism works. Returns 'scheduled' immediately, then after 3 seconds sends '[spike] hello' via session.prompt at steer priority.",
        args: {},
        async execute(_args: Record<string, never>, ctx: ToolContext) {
          const sessionID = ctx.sessionID
          setTimeout(async () => {
            try {
              const result = await v2.v2.session.prompt({
                sessionID,
                prompt: { text: "[spike] hello from sentinel — steer delivery test" },
                delivery: "steer",
              })
              if (result.error) {
                console.error("[sentinel_spike] steer delivery failed:", result.error)
              }
            } catch (err) {
              console.error("[sentinel_spike] steer delivery failed:", err)
            }
          }, 3000)
          return "scheduled — steer delivery will fire in 3 seconds"
        },
      }),
    },

    dispose: async () => {
      manager.dispose()
    },

    event: async (event: any) => {
      if (event.type === "session.deleted") {
        const sessionID = event.properties?.sessionID
        if (sessionID) {
          manager.dispose()
        }
      }
    },
  }
}
