import {
  ALLOW_DELETE_OPERATION,
  ALLOW_DDL_OPERATION,
  ALLOW_INSERT_OPERATION,
  ALLOW_UPDATE_OPERATION,
  SCHEMA_DELETE_PERMISSIONS,
  SCHEMA_DDL_PERMISSIONS,
  SCHEMA_INSERT_PERMISSIONS,
  SCHEMA_UPDATE_PERMISSIONS,
} from "../config/index.js";

// Schema permission checking functions
function isInsertAllowedForSchema(schema: string | null): boolean {
  if (!schema) {
    return ALLOW_INSERT_OPERATION;
  }
  return schema in SCHEMA_INSERT_PERMISSIONS
    ? SCHEMA_INSERT_PERMISSIONS[schema]
    : ALLOW_INSERT_OPERATION;
}

function isUpdateAllowedForSchema(schema: string | null): boolean {
  if (!schema) {
    return ALLOW_UPDATE_OPERATION;
  }
  return schema in SCHEMA_UPDATE_PERMISSIONS
    ? SCHEMA_UPDATE_PERMISSIONS[schema]
    : ALLOW_UPDATE_OPERATION;
}

function isDeleteAllowedForSchema(schema: string | null): boolean {
  if (!schema) {
    return ALLOW_DELETE_OPERATION;
  }
  return schema in SCHEMA_DELETE_PERMISSIONS
    ? SCHEMA_DELETE_PERMISSIONS[schema]
    : ALLOW_DELETE_OPERATION;
}

function isDDLAllowedForSchema(schema: string | null): boolean {
  if (!schema) {
    return ALLOW_DDL_OPERATION;
  }
  return schema in SCHEMA_DDL_PERMISSIONS
    ? SCHEMA_DDL_PERMISSIONS[schema]
    : ALLOW_DDL_OPERATION;
}

export {
  isInsertAllowedForSchema,
  isUpdateAllowedForSchema,
  isDeleteAllowedForSchema,
  isDDLAllowedForSchema,
};
