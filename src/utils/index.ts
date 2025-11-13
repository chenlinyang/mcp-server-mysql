import { SchemaPermissions } from "../types/index.js";
type LogType = "info" | "error";

// @INFO: Enable logging if ENABLE_LOGGING is true
const ENABLE_LOGGING =
  process.env.ENABLE_LOGGING === "true" || process.env.ENABLE_LOGGING === "1";

export function log(type: LogType = "info", ...args: any[]): void {
  if (!ENABLE_LOGGING) return;

  switch (type) {
    case "info":
      console.info(...args);
      break;
    case "error":
      console.error(...args);
      break;
    default:
      console.log(...args);
  }
}

// Function to parse schema-specific permissions from environment variables
export function parseSchemaPermissions(
  permissionsString?: string,
): SchemaPermissions {
  const permissions: SchemaPermissions = {};

  if (!permissionsString) {
    return permissions;
  }

  // Format: "schema1:true,schema2:false"
  const permissionPairs = permissionsString.split(",");

  for (const pair of permissionPairs) {
    const [schema, value] = pair.split(":");
    if (schema && value) {
      permissions[schema.trim()] = value.trim() === "true";
    }
  }

  return permissions;
}
