import { tool } from "@opencode-ai/plugin"

export default async (input: any) => ({
  tool: {
    sentinel_ping: tool({
      description: "Health check for the sentinel plugin. Returns pong if the plugin is loaded and operational.",
      args: {},
      async execute() {
        return "pong"
      },
    }),
  },
})
