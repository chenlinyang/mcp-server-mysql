import * as mysql2 from "mysql2/promise";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  executeReadOnlyQuery,
  executeWriteQuery,
} from "../../../dist/src/db/index.js";

// Create test environment for multi-DB mode
describe("Multi-DB Mode", () => {
  let pool: any;

  beforeAll(async () => {
    // Mock environment variables for multi-DB mode
    // Clear the database name to enable multi-DB mode
    const originalDbName = process.env.MYSQL_DB;
    process.env.MYSQL_DB = "";

    // Set write permissions to false for safety in multi-DB mode
    process.env.ALLOW_INSERT_OPERATION = "false";
    process.env.ALLOW_UPDATE_OPERATION = "false";
    process.env.ALLOW_DELETE_OPERATION = "false";
    process.env.ALLOW_DDL_OPERATION = "false";

    // Configure schema-specific permissions
    process.env.SCHEMA_INSERT_PERMISSIONS =
      "multi_db_test_1:true,multi_db_test_2:false";

    // Create connection pool for testing
    const config: any = {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASS || "",
      connectionLimit: 5,
      multipleStatements: true,
    };

    // Only add password if it's set
    if (process.env.MYSQL_PASS) {
      config.password = process.env.MYSQL_PASS;
    }

    pool = mysql2.createPool(config);

    // Create test databases
    const connection = await pool.getConnection();
    try {
      // Create test databases
      await connection.query(`CREATE DATABASE IF NOT EXISTS multi_db_test_1`);
      await connection.query(`CREATE DATABASE IF NOT EXISTS multi_db_test_2`);

      // Create test tables in each database
      await connection.query(`
        USE multi_db_test_1;
        CREATE TABLE IF NOT EXISTS test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        USE multi_db_test_2;
        CREATE TABLE IF NOT EXISTS test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } finally {
      connection.release();
    }

    return () => {
      // Restore original DB name
      if (originalDbName) {
        process.env.MYSQL_DB = originalDbName;
      } else {
        delete process.env.MYSQL_DB;
      }
    };
  });

  beforeEach(async () => {
    // Reset test data before each test
    const connection = await pool.getConnection();
    try {
      // Clear the tables in both databases
      await connection.query(`
        USE multi_db_test_1;
        TRUNCATE TABLE test_table;
        INSERT INTO test_table (name) VALUES ('DB 1 - Record 1'), ('DB 1 - Record 2');
        
        USE multi_db_test_2;
        TRUNCATE TABLE test_table;
        INSERT INTO test_table (name) VALUES ('DB 2 - Record 1'), ('DB 2 - Record 2');
      `);
    } finally {
      connection.release();
    }
  });

  afterAll(async () => {
    // Clean up test databases
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        DROP DATABASE IF EXISTS multi_db_test_1;
        DROP DATABASE IF EXISTS multi_db_test_2;
      `);
    } finally {
      connection.release();
    }

    // Close the pool
    await pool.end();

    // Clean up environment variables
    delete process.env.SCHEMA_INSERT_PERMISSIONS;
  });

  // Test querying from multiple databases in multi-DB mode
  it("should be able to query data from multiple databases", async () => {
    // Query from first database
    const result1 = await executeReadOnlyQuery(
      "SELECT * FROM multi_db_test_1.test_table",
    );

    expect(result1.isError).toBe(false);
    const data1 = JSON.parse(result1.content[0].text);
    expect(data1.length).toBe(2);
    expect(data1[0].name).toBe("DB 1 - Record 1");

    // Query from second database
    const result2 = await executeReadOnlyQuery(
      "SELECT * FROM multi_db_test_2.test_table",
    );

    expect(result2.isError).toBe(false);
    const data2 = JSON.parse(result2.content[0].text);
    expect(data2.length).toBe(2);
    expect(data2[0].name).toBe("DB 2 - Record 1");
  });

  // Test USE statement in multi-DB mode
  it("should handle USE statements properly", async () => {
    // Use the first database and then query without schema prefix
    const result = await executeReadOnlyQuery(`
      USE multi_db_test_1;
      SELECT * FROM test_table;
    `);

    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.length).toBe(2);
    expect(data[0].name).toBe("DB 1 - Record 1");
  });

  // Test schema-specific permissions in multi-DB mode
  it("should respect schema-specific permissions in multi-DB mode", async () => {
    // Insert into allowed database (multi_db_test_1)
    const result1 = await executeWriteQuery(
      'INSERT INTO multi_db_test_1.test_table (name) VALUES ("New DB1 Record")',
    );

    expect(result1.isError).toBe(false);
    expect(result1.content[0].text).toContain("Insert successful");

    // Try insert into forbidden database (multi_db_test_2)
    const result2 = await executeReadOnlyQuery(
      'INSERT INTO multi_db_test_2.test_table (name) VALUES ("New DB2 Record")',
    );

    expect(result2.isError).toBe(true);
    expect(result2.content[0].text).toContain(
      "INSERT operations are not allowed for schema",
    );

    // Verify the records
    const connection = await pool.getConnection();
    try {
      // Verify first insert succeeded
      const [rows1] = (await connection.query(
        "SELECT * FROM multi_db_test_1.test_table WHERE name = ?",
        ["New DB1 Record"],
      )) as [any[], any];
      expect(rows1.length).toBe(1);

      // Verify second insert was blocked
      const [rows2] = (await connection.query(
        "SELECT * FROM multi_db_test_2.test_table WHERE name = ?",
        ["New DB2 Record"],
      )) as [any[], any];
      expect(rows2.length).toBe(0);
    } finally {
      connection.release();
    }
  });

  // Test SHOW DATABASES command in multi-DB mode
  it("should be able to list all databases", async () => {
    const result = await executeReadOnlyQuery("SHOW DATABASES");

    expect(result.isError).toBe(false);
    const databases = JSON.parse(result.content[0].text);

    // Check if our test databases are in the list
    const dbNames = databases.map((db: any) => db.Database);
    expect(dbNames).toContain("multi_db_test_1");
    expect(dbNames).toContain("multi_db_test_2");
  });
});
