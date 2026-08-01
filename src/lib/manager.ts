import type { ChildProcess } from "node:child_process"

export interface MonitorEntry {
  id: string
  proc: ChildProcess
  description: string
  command: string
  startedAt: string
  linesEmitted: number
  filter?: string
  until?: string
}

export interface MonitorEntryPublic {
  id: string
  description: string
  command: string
  startedAt: string
  linesEmitted: number
  filter?: string
  until?: string
}

export class MonitorManager {
  private entries = new Map<string, MonitorEntry>()

  start(entry: MonitorEntry): string {
    this.entries.set(entry.id, entry)
    return entry.id
  }

  stop(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) {
      throw new Error(`Monitor not found: ${id}`)
    }
    if (entry.proc.pid) {
      try {
        process.kill(-entry.proc.pid, "SIGTERM")
      } catch {
        // Process may already be dead
      }
    }
    this.entries.delete(id)
  }

  get(id: string): MonitorEntry | undefined {
    return this.entries.get(id)
  }

  list(): MonitorEntryPublic[] {
    return Array.from(this.entries.values()).map((entry) => ({
      id: entry.id,
      description: entry.description,
      command: entry.command,
      startedAt: entry.startedAt,
      linesEmitted: entry.linesEmitted,
      filter: entry.filter,
      until: entry.until,
    }))
  }

  incrementLines(id: string): void {
    const entry = this.entries.get(id)
    if (entry) {
      entry.linesEmitted++
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      if (entry.proc.pid) {
        try {
          process.kill(-entry.proc.pid, "SIGTERM")
        } catch {
          // Process may already be dead
        }
      }
    }
    this.entries.clear()
  }
}

export const manager = new MonitorManager()
