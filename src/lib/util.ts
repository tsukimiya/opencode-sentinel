export function generateId(): string {
  return `mon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function timestamp(): string {
  return new Date().toISOString()
}
