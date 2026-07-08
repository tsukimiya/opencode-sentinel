import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test"
import { EventEmitter } from "node:events"
import { MonitorManager } from "../src/lib/manager"

const appendFileSyncCalls: Array<{ path: string; data: string }> = []

function createMockProc() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const proc = new EventEmitter()
  ;(proc as any).stdout = stdout
  ;(proc as any).stderr = stderr
  ;(proc as any).pid = 12345
  return { proc, stdout, stderr }
}

let currentMock = createMockProc()

mock.module("node:child_process", () => ({
  spawn: () => currentMock.proc,
}))

mock.module("node:fs", () => {
  const fsMock = {
    appendFileSync: (path: string, data: string) => {
      appendFileSyncCalls.push({ path, data })
    },
    existsSync: () => false,
    mkdirSync: () => {},
  }
  return { default: fsMock, ...fsMock }
})

// Dynamic import ensures mocks are applied before the module is evaluated.
// ES module hoisting would otherwise cause the real module to load first.
const watcherModule = await import("../src/lib/watcher")
const startWatcher = watcherModule.startWatcher

describe("startWatcher", () => {
  let manager: MonitorManager
  let promptCalls: Array<any>
  let v2Client: any
  let mockProc: EventEmitter
  let mockStdout: EventEmitter
  let mockStderr: EventEmitter

  beforeEach(() => {
    manager = new MonitorManager()
    promptCalls = []
    appendFileSyncCalls.length = 0
    v2Client = {
      session: {
        prompt: async (params: any) => {
          promptCalls.push(params)
          return {}
        },
      },
    }
    const fresh = createMockProc()
    currentMock = fresh
    mockProc = fresh.proc
    mockStdout = fresh.stdout
    mockStderr = fresh.stderr
  })

  afterEach(() => {
    mockProc.emit("exit", 0)
  })

  test("spawns process and returns ChildProcess", () => {
    const proc = startWatcher({
      id: "mon_test",
      command: "echo hello",
      sessionID: "ses_123",
      v2Client,
      manager,
    })
    expect(proc).toBe(mockProc)
  })

  test("batches multiple lines within 200ms into single prompt", async () => {
    manager.start({
      id: "mon_batch",
      proc: mockProc as any,
      description: "batch test",
      command: "test",
      startedAt: new Date().toISOString(),
      linesEmitted: 0,
    })

    startWatcher({
      id: "mon_batch",
      command: "test",
      sessionID: "ses_123",
      v2Client,
      manager,
    })

    mockStdout.emit("data", Buffer.from("line1\nline2\nline3\n"))
    await new Promise((r) => setTimeout(r, 250))

    expect(promptCalls.length).toBe(1)
    const text = promptCalls[0].parts[0].text
    expect(text).toContain("line1")
    expect(text).toContain("line2")
    expect(text).toContain("line3")
  })

  test("sends separate batches when lines arrive >200ms apart", async () => {
    manager.start({
      id: "mon_sep",
      proc: mockProc as any,
      description: "sep test",
      command: "test",
      startedAt: new Date().toISOString(),
      linesEmitted: 0,
    })

    startWatcher({
      id: "mon_sep",
      command: "test",
      sessionID: "ses_123",
      v2Client,
      manager,
    })

    mockStdout.emit("data", Buffer.from("line1\n"))
    await new Promise((r) => setTimeout(r, 250))

    mockStdout.emit("data", Buffer.from("line2\n"))
    await new Promise((r) => setTimeout(r, 250))

    expect(promptCalls.length).toBe(2)
  })

  test("writes stderr to /tmp/sentinel-{id}-stderr.log", () => {
    startWatcher({
      id: "mon_stderr",
      command: "test",
      sessionID: "ses_123",
      v2Client,
      manager,
    })

    mockStderr.emit("data", Buffer.from("error output\n"))

    expect(appendFileSyncCalls.length).toBe(1)
    expect(appendFileSyncCalls[0].path).toBe(
      "/tmp/sentinel-mon_stderr-stderr.log",
    )
    expect(appendFileSyncCalls[0].data).toContain("error output")
  })

  test("notifies on unexpected process exit (code !== 0)", async () => {
    startWatcher({
      id: "mon_exit",
      command: "test",
      sessionID: "ses_123",
      v2Client,
      manager,
    })

    mockProc.emit("exit", 1)
    await new Promise((r) => setTimeout(r, 50))

    const exitCall = promptCalls.find((p) =>
      p.parts[0].text.includes("exited unexpectedly"),
    )
    expect(exitCall).toBeDefined()
    expect(exitCall!.parts[0].text).toContain("code 1")
  })

  test("does NOT notify on normal exit (code 0)", async () => {
    startWatcher({
      id: "mon_normal",
      command: "test",
      sessionID: "ses_123",
      v2Client,
      manager,
    })

    promptCalls.length = 0

    mockProc.emit("exit", 0)
    await new Promise((r) => setTimeout(r, 50))

    const exitCall = promptCalls.find((p) =>
      p.parts[0].text.includes("exited unexpectedly"),
    )
    expect(exitCall).toBeUndefined()
  })

  test("flood limit: kills process when >100 lines in 1 second", () => {
    const killCalls: Array<[number, string]> = []
    const origKill = process.kill
    try {
      ;(process as any).kill = (pid: number, signal: string) => {
        killCalls.push([pid, signal])
      }

      manager.start({
        id: "mon_flood",
        proc: mockProc as any,
        description: "flood test",
        command: "test",
        startedAt: new Date().toISOString(),
        linesEmitted: 0,
      })

      startWatcher({
        id: "mon_flood",
        command: "test",
        sessionID: "ses_123",
        v2Client,
        manager,
      })

      const lines = Array.from({ length: 101 }, (_, i) => `line${i}`).join("\n")
      mockStdout.emit("data", Buffer.from(lines + "\n"))

      expect(killCalls.length).toBeGreaterThan(0)
      const floodCall = promptCalls.find((p) =>
        p.parts[0].text.includes("FLOOD DETECTED"),
      )
      expect(floodCall).toBeDefined()
    } finally {
      process.kill = origKill
    }
  })
})
