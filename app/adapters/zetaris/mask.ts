/** Mask password, user-agent, awsSecretAccessKey and Bearer values before any log or error. */
export function maskSecrets(sql: string): string {
  return sql
    .replace(/(password|user-agent|awsSecretAccessKey)(\s+)"[^"]*"/gi, '$1$2"[REDACTED]"')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/g, "Bearer [REDACTED]");
}
