/** Synchronized Trash retains soft-deleted Captures/Threads for 30 days. */
export const TRASH_RETENTION_DAYS = 30;

export function expiresAtFrom(trashedAt: string): string {
  const date = new Date(trashedAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid trashedAt: ${trashedAt}`);
  }
  date.setUTCDate(date.getUTCDate() + TRASH_RETENTION_DAYS);
  return date.toISOString();
}

export function isExpired(expiresAt: string, now: string): boolean {
  return expiresAt <= now;
}
