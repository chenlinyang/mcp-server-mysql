import { isMultiDbMode } from "./../config/index.js";
import { log } from "./../utils/index.js";
import SqlParser, { AST } from "node-sql-parser";

const { Parser } = SqlParser;
const parser = new Parser();

// Extract schema from SQL query
function extractSchemaFromQuery(sql: string, targetDb?: string): string | null {
  // Default schema from environment
  const defaultSchema = process.env.MYSQL_DB || null;

  // If we have a default schema and not in multi-DB mode, return it
  if (defaultSchema && !isMultiDbMode) {
    return defaultSchema;
  }

  // If targetDb is provided and we're not in multi-DB mode, prioritize it
  if (targetDb && !isMultiDbMode) {
    return targetDb;
  }

  // Try to extract schema from query

  // Case 1: USE database statement
  const useMatch = sql.match(/USE\s+`?([a-zA-Z0-9_]+)`?/i);
  if (useMatch && useMatch[1]) {
    return useMatch[1];
  }

  // Case 2: database.table notation
  const dbTableMatch = sql.match(/`?([a-zA-Z0-9_]+)`?\.`?[a-zA-Z0-9_]+`?/i);
  if (dbTableMatch && dbTableMatch[1]) {
    return dbTableMatch[1];
  }

  // Return default if we couldn't find a schema in the query
  return defaultSchema;
}

// Validate database access for SQL query when MYSQL_DB is set
function validateDatabaseAccess(sql: string, targetDb: string): { isValid: boolean; error?: string } {
  if (!targetDb || isMultiDbMode) {
    // No target database restrictions in multi-DB mode
    return { isValid: true };
  }

  const normalizedTargetDb = targetDb.toLowerCase().trim();

  // Case 1: Check for USE database statement
  const useMatch = sql.match(/USE\s+`?([a-zA-Z0-9_]+)`?/i);
  if (useMatch && useMatch[1]) {
    const useDb = useMatch[1].toLowerCase().trim();
    if (useDb !== normalizedTargetDb) {
      return {
        isValid: false,
        error: `USE statement not allowed: Cannot switch to database '${useMatch[1]}'. All operations must be limited to database '${targetDb}'.`
      };
    }
  }

  // Case 2: Check for database.table notation
  const dbTableRegex = /`?([a-zA-Z0-9_]+)`?\.`?[a-zA-Z0-9_]+`?/gi;
  const matches = sql.match(dbTableRegex);
  if (matches) {
    for (const match of matches) {
      const dbMatch = match.match(/^`?([a-zA-Z0-9_]+)`?/i);
      if (dbMatch && dbMatch[1]) {
        const referencedDb = dbMatch[1].toLowerCase().trim();
        if (referencedDb !== normalizedTargetDb) {
          return {
            isValid: false,
            error: `Cross-database access not allowed: Cannot access database '${dbMatch[1]}'. All operations must be limited to database '${targetDb}'.`
          };
        }
      }
    }
  }

  return { isValid: true };
}

// Sanitize SQL query to ensure it respects database boundaries
function sanitizeQuery(sql: string, targetDb: string): string {
  if (!targetDb || isMultiDbMode) {
    return sql; // No sanitization needed in multi-DB mode
  }

  let sanitized = sql;

  // Remove USE statements as they're not needed when we have a target database
  sanitized = sanitized.replace(/USE\s+`?[a-zA-Z0-9_]+`?\s*;?\s*/gi, '');

  // Convert database.table references to just table when they reference the target database
  const targetDbPattern = new RegExp(`\`${targetDb}\`\\.|${targetDb}\\.`, 'gi');
  sanitized = sanitized.replace(targetDbPattern, '');

  return sanitized.trim();
}

async function getQueryTypes(query: string): Promise<string[]> {
  try {
    log("info", "Parsing SQL query: ", query);
    // Parse into AST or array of ASTs - only specify the database type
    const astOrArray: AST | AST[] = parser.astify(query, { database: "mysql" });
    const statements = Array.isArray(astOrArray) ? astOrArray : [astOrArray];

    // Map each statement to its lowercased type (e.g., 'select', 'update', 'insert', 'delete', etc.)
    return statements.map((stmt) => stmt.type?.toLowerCase() ?? "unknown");
  } catch (err: any) {
    log("error", "sqlParser error, query: ", query);
    log("error", "Error parsing SQL query:", err);
    throw new Error(`Parsing failed: ${err.message}`);
  }
}

export { extractSchemaFromQuery, getQueryTypes, validateDatabaseAccess, sanitizeQuery };
