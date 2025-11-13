import * as mysql2 from "mysql2/promise";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  executeReadOnlyQuery,
  executeWriteQuery,
} from "../../../dist/src/db/index.js";

// Create test environment for schema-specific permissions
describe("Schema-specific Permissions", () => {
  let pool: any;

  beforeAll(async () => {
    // Mock environment variables for schema-specific permissions
    process.env.ALLOW_INSERT_OPERATION = "false";
    process.env.ALLOW_UPDATE_OPERATION = "false";
    process.env.ALLOW_DELETE_OPERATION = "false";
    process.env.ALLOW_DDL_OPERATION = "false";

    // Set schema-specific permissions
    process.env.SCHEMA_INSERT_PERMISSIONS =
      "test_schema_1:true,test_schema_2:false";
    process.env.SCHEMA_UPDATE_PERMISSIONS =
      "test_schema_1:false,test_schema_2:true";
    process.env.SCHEMA_DELETE_PERMISSIONS =
      "test_schema_1:true,test_schema_2:false";
    process.env.SCHEMA_DDL_PERMISSIONS =
      "test_schema_1:true,test_schema_2:false";

    // Create connection pool for testing
    const config: any = {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "root",
      connectionLimit: 5,
      multipleStatements: true,
    };

    // Only add password if it's set
    if (process.env.MYSQL_PASS) {
      config.password = process.env.MYSQL_PASS;
    }

    pool = mysql2.createPool(config);

    // Create test schemas
    const connection = await pool.getConnection();
    try {
      // Create test schemas
      await connection.query(`CREATE DATABASE IF NOT EXISTS test_schema_1`);
      await connection.query(`CREATE DATABASE IF NOT EXISTS test_schema_2`);

      // Create test tables in each schema
      await connection.query(`
        USE test_schema_1;
        CREATE TABLE IF NOT EXISTS test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        USE test_schema_2;
        CREATE TABLE IF NOT EXISTS test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } finally {
      connection.release();
    }
  });

  beforeEach(async () => {
    // Reset test data before each test
    const connection = await pool.getConnection();
    try {
      // Clear the tables in both schemas
      await connection.query(`
        USE test_schema_1;
        TRUNCATE TABLE test_table;
        INSERT INTO test_table (name) VALUES ('Schema 1 - Test 1'), ('Schema 1 - Test 2');
        
        USE test_schema_2;
        TRUNCATE TABLE test_table;
        INSERT INTO test_table (name) VALUES ('Schema 2 - Test 1'), ('Schema 2 - Test 2');
      `);
    } finally {
      connection.release();
    }
  });

  afterAll(async () => {
    // Clean up test schemas
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        DROP DATABASE IF EXISTS test_schema_1;
        DROP DATABASE IF EXISTS test_schema_2;
      `);
    } finally {
      connection.release();
    }

    // Close the pool
    await pool.end();

    // Clean up environment variables
    delete process.env.SCHEMA_INSERT_PERMISSIONS;
    delete process.env.SCHEMA_UPDATE_PERMISSIONS;
    delete process.env.SCHEMA_DELETE_PERMISSIONS;
    delete process.env.SCHEMA_DDL_PERMISSIONS;
  });

  // Test INSERT permission for schema_1 (allowed)
  it("should allow INSERT operations for test_schema_1", async () => {
    const result = await executeWriteQuery(
      'INSERT INTO test_schema_1.test_table (name) VALUES ("New Record")',
    );

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("Insert successful");

    // Verify the record was inserted
    const connection = await pool.getConnection();
    try {
      const [rows] = (await connection.query(
        "SELECT * FROM test_schema_1.test_table WHERE name = ?",
        ["New Record"],
      )) as [any[], any];

      expect(rows.length).toBe(1);
    } finally {
      connection.release();
    }
  });

  // Test INSERT permission for schema_2 (not allowed)
  it("should block INSERT operations for test_schema_2", async () => {
    const result = await executeReadOnlyQuery(
      'INSERT INTO test_schema_2.test_table (name) VALUES ("Blocked Insert")',
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "INSERT operations are not allowed for schema",
    );

    // Verify the record was not inserted
    const connection = await pool.getConnection();
    try {
      const [rows] = (await connection.query(
        "SELECT * FROM test_schema_2.test_table WHERE name = ?",
        ["Blocked Insert"],
      )) as [any[], any];

      expect(rows.length).toBe(0); // Record should not exist
    } finally {
      connection.release();
    }
  });

  // Test UPDATE permission for schema_1 (not allowed)
  it("should block UPDATE operations for test_schema_1", async () => {
    const result = await executeReadOnlyQuery(
      'UPDATE test_schema_1.test_table SET name = "Updated Name" WHERE name = "Schema 1 - Test 1"',
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "UPDATE operations are not allowed for schema",
    );

    // Verify the record was not updated
    const connection = await pool.getConnection();
    try {
      const [rows] = (await connection.query(
        "SELECT * FROM test_schema_1.test_table WHERE name = ?",
        ["Schema 1 - Test 1"],
      )) as [any[], any];

      expect(rows.length).toBe(1); // Original record should still exist
    } finally {
      connection.release();
    }
  });

  // Test UPDATE permission for schema_2 (allowed)
  it("should allow UPDATE operations for test_schema_2", async () => {
    const result = await executeWriteQuery(
      'UPDATE test_schema_2.test_table SET name = "Updated Name" WHERE name = "Schema 2 - Test 1"',
    );

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("Update successful");

    // Verify the record was updated
    const connection = await pool.getConnection();
    try {
      const [rows] = (await connection.query(
        "SELECT * FROM test_schema_2.test_table WHERE name = ?",
        ["Updated Name"],
      )) as [any[], any];

      expect(rows.length).toBe(1); // Updated record should exist
    } finally {
      connection.release();
    }
  });

  // Test DDL permission for schema_1 (allowed)
  it("should allow DDL operations for test_schema_1", async () => {
    const result = await executeWriteQuery(
      "ALTER TABLE test_schema_1.test_table ADD COLUMN test_column VARCHAR(50)",
    );

    expect(result.isError).toBe(false);

    // Verify the column was added
    const connection = await pool.getConnection();
    try {
      const [columns] = (await connection.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = 'test_schema_1' 
         AND TABLE_NAME = 'test_table'
         AND COLUMN_NAME = 'test_column'`,
      )) as [any[], any];

      expect(columns.length).toBe(1); // Column should exist
    } finally {
      connection.release();
    }
  });

  // Test DDL permission for schema_2 (not allowed)
  it("should block DDL operations for test_schema_2", async () => {
    const result = await executeReadOnlyQuery(
      "ALTER TABLE test_schema_2.test_table ADD COLUMN test_column VARCHAR(50)",
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "DDL operations are not allowed for schema",
    );

    // Verify the column was not added
    const connection = await pool.getConnection();
    try {
      const [columns] = (await connection.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = 'test_schema_2' 
         AND TABLE_NAME = 'test_table'
         AND COLUMN_NAME = 'test_column'`,
      )) as [any[], any];

      expect(columns.length).toBe(0); // Column should not exist
    } finally {
      connection.release();
    }
  });
});
