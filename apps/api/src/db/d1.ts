export function runBatch(
  database: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result[]> {
  return database.batch(statements)
}
