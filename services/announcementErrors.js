// Log only known categories, never SQL, parameters, connection strings or stacks.
export function logAnnouncementError(operation, error) {
  const categories = new Set(['SequelizeAccessDeniedError', 'SequelizeConnectionError', 'SequelizeConnectionRefusedError', 'SequelizeHostNotFoundError', 'SequelizeHostNotReachableError', 'SequelizeConnectionTimedOutError', 'SequelizeDatabaseError', 'SequelizeForeignKeyConstraintError', 'SequelizeUniqueConstraintError', 'SequelizeTimeoutError']);
  console.error(`[announcements:${operation}] ${categories.has(error?.name) ? error.name : 'UnexpectedError'}`);
}
