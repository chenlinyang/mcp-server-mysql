import * as mysql2 from "mysql2/promise";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as dotenv from "dotenv";
import {
  executeReadOnlyQuery,
  executeWriteQuery,
} from "../../dist/src/db/index.js";
import * as path from "path";
import { fileURLToPath } from "url";

// Set test directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock environment variables for write operations
process.env.ALLOW_INSERT_OPERATION = "true";
process.env.ALLOW_UPDATE_OPERATION = "true";
process.env.ALLOW_DELETE_OPERATION = "true";

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

describe("MySQL Integration", () => {
  let pool: any;

  beforeAll(async () => {
    // Create a connection pool for testing
    const config: any = {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "root",
      database: process.env.MYSQL_DB || "mcp_test",
      connectionLimit: 5,
      multipleStatements: true,
    };

    // Only add password if it's set
    if (process.env.MYSQL_PASS) {
      config.password = process.env.MYSQL_PASS;
    }

    pool = mysql2.createPool(config);

    // Create a test table if it doesn't exist
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create write operations test table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS write_ops_test (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          value INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } finally {
      connection.release();
    }
  });

  beforeEach(async () => {
    // Reset test data before each test
    const connection = await pool.getConnection();
    try {
      // Clear the tables
      await connection.query("TRUNCATE TABLE test_table");
      await connection.query("TRUNCATE TABLE write_ops_test");

      // Insert test data
      await connection.query(`
        INSERT INTO test_table (name) VALUES 
        ('Test 1'),
        ('Test 2'),
        ('Test 3')
      `);

      // Insert write ops test data
      await connection.query(`
        INSERT INTO write_ops_test (name, value) VALUES 
        ('Original 1', 10),
        ('Original 2', 20),
        ('Original 3', 30)
      `);
    } finally {
      connection.release();
    }
  });

  afterAll(async () => {
    // Clean up test data
    const connection = await pool.getConnection();
    try {
      await connection.query("DROP TABLE IF EXISTS test_table");
      await connection.query("DROP TABLE IF EXISTS write_ops_test");
    } finally {
      connection.release();
    }

    // Close the pool
    await pool.end();
  });

  it("should connect to the database", async () => {
    const connection = await pool.getConnection();
    expect(connection).toBeDefined();
    connection.release();
  });

  it("should execute a query and return results", async () => {
    const connection = await pool.getConnection();
    try {
      const [rows] = (await connection.query("SELECT * FROM test_table")) as [
        any[],
        any,
      ];
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(3);
    } finally {
      connection.release();
    }
  });

  it("should execute a parameterized query", async () => {
    const connection = await pool.getConnection();
    try {
      const [rows] = (await connection.query(
        "SELECT * FROM test_table WHERE name = ?",
        ["Test 2"],
      )) as [any[], any];

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe("Test 2");
    } finally {
      connection.release();
    }
  });

  it("should handle transactions correctly", async () => {
    const connection = await pool.getConnection();
    try {
      // Start transaction
      await connection.beginTransaction();

      // Insert a new record
      await connection.query("INSERT INTO test_table (name) VALUES (?)", [
        "Transaction Test",
      ]);

      // Verify the record exists
      const [rows] = (await connection.query(
        "SELECT * FROM test_table WHERE name = ?",
        ["Transaction Test"],
      )) as [any[], any];

      expect(rows.length).toBe(1);

      // Rollback the transaction
      await connection.rollback();

      // Verify the record no longer exists
      const [rowsAfterRollback] = (await connection.query(
        "SELECT * FROM test_table WHERE name = ?",
        ["Transaction Test"],
      )) as [any[], any];

      expect(rowsAfterRollback.length).toBe(0);
    } finally {
      connection.release();
    }
  });

  // Tests for the write operations
  describe("Write Operations", () => {
    it("should execute INSERT operations when allowed", async () => {
      // Ensure the flag is set to true for this test
      const originalValue = process.env.ALLOW_INSERT_OPERATION;
      process.env.ALLOW_INSERT_OPERATION = "true";

      try {
        // Use executeWriteQuery directly for write operations in tests
        const result = await executeWriteQuery(
          'INSERT INTO write_ops_test (name, value) VALUES ("New Record", 100)',
        );

        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain("Insert successful");

        // Verify the record was inserted
        const connection = await pool.getConnection();
        try {
          const [rows] = (await connection.query(
            "SELECT * FROM write_ops_test WHERE name = ?",
            ["New Record"],
          )) as [any[], any];

          expect(rows.length).toBe(1);
          expect(rows[0].value).toBe(100);
        } finally {
          connection.release();
        }
      } finally {
        // Restore original flag value
        process.env.ALLOW_INSERT_OPERATION = originalValue;
      }
    });

    it("should execute UPDATE operations when allowed", async () => {
      // Ensure the flag is set to true for this test
      const originalValue = process.env.ALLOW_UPDATE_OPERATION;
      process.env.ALLOW_UPDATE_OPERATION = "true";

      try {
        // Use executeWriteQuery directly for write operations in tests
        const result = await executeWriteQuery(
          'UPDATE write_ops_test SET value = 999 WHERE name = "Original 2"',
        );

        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain("Update successful");

        // Verify the record was updated
        const connection = await pool.getConnection();
        try {
          const [rows] = (await connection.query(
            "SELECT * FROM write_ops_test WHERE name = ?",
            ["Original 2"],
          )) as [any[], any];

          expect(rows.length).toBe(1);
          expect(rows[0].value).toBe(999);
        } finally {
          connection.release();
        }
      } finally {
        // Restore original flag value
        process.env.ALLOW_UPDATE_OPERATION = originalValue;
      }
    });

    it("should execute DELETE operations when allowed", async () => {
      // Ensure the flag is set to true for this test
      const originalValue = process.env.ALLOW_DELETE_OPERATION;
      process.env.ALLOW_DELETE_OPERATION = "true";

      try {
        // Use executeWriteQuery directly for write operations in tests
        const result = await executeWriteQuery(
          'DELETE FROM write_ops_test WHERE name = "Original 3"',
        );

        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain("Delete successful");

        // Verify the record was deleted
        const connection = await pool.getConnection();
        try {
          const [rows] = (await connection.query(
            "SELECT * FROM write_ops_test WHERE name = ?",
            ["Original 3"],
          )) as [any[], any];

          expect(rows.length).toBe(0); // Record should be deleted
        } finally {
          connection.release();
        }
      } finally {
        // Restore original flag value
        process.env.ALLOW_DELETE_OPERATION = originalValue;
      }
    });

    it("should block INSERT operations when not allowed", async () => {
      // Set the flag to false for this test
      const originalValue = process.env.ALLOW_INSERT_OPERATION;
      process.env.ALLOW_INSERT_OPERATION = "false";

      try {
        const result = await executeReadOnlyQuery(
          'INSERT INTO write_ops_test (name, value) VALUES ("Blocked Insert", 100)',
        );

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(
          "INSERT operations are not allowed",
        );

        // Verify the record was not inserted
        const connection = await pool.getConnection();
        try {
          const [rows] = (await connection.query(
            "SELECT * FROM write_ops_test WHERE name = ?",
            ["Blocked Insert"],
          )) as [any[], any];

          expect(rows.length).toBe(0); // Record should not exist
        } finally {
          connection.release();
        }
      } finally {
        // Restore original flag value
        process.env.ALLOW_INSERT_OPERATION = originalValue;
      }
    });
  });
});

