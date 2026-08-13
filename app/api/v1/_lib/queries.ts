/**
 * Compatibility exports for the original REST routes. The implementation lives in the shared
 * service layer so REST, MCP, and future entry points all execute the same event-scoped queries.
 */
export * from '@/lib/services/public-api';
