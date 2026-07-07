import { describe, expect, test } from "bun:test"
import { generateId, timestamp } from "../src/lib/util"

describe("generateId", () => {
  test("returns a string starting with mon_", () => {
    const id = generateId()
    expect(id).toStartWith("mon_")
  })

  test("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  test("IDs are different on successive calls", () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })
})

describe("timestamp", () => {
  test("returns ISO 8601 string", () => {
    const ts = timestamp()
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test("returns current time (within 1 second)", () => {
    const before = Date.now()
    const ts = timestamp()
    const parsed = new Date(ts).getTime()
    const after = Date.now()
    expect(parsed).toBeGreaterThanOrEqual(before)
    expect(parsed).toBeLessThanOrEqual(after)
  })
})
