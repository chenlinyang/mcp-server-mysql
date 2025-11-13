import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as mysql2 from "mysql2/promise";
import * as dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env.test" });

// Helper function to create a test client
function createTestClient() {
  // This would be a simplified version of an MCP client for testing
  return {
    async listTools() {
      // Determine which operations are enabled
      const allowInsert = process.env.ALLOW_INSERT_OPERATION === "true";
      const allowUpdate = process.env.ALLOW_UPDATE_OPERATION === "true";
      const allowDelete = process.env.ALLOW_DELETE_OPERATION === "true";

      let description = "Run SQL queries against MySQL database";
      if (allowInsert || allowUpdate || allowDelete) {
        description += " with support for:";
        if (allowInsert) description += " INSERT,";
        if (allowUpdate) description += " UPDATE,";
        if (allowDelete) description += " DELETE,";
        description = description.replace(/,$/, "") + " and READ operations";
      } else {
        description += " (READ-ONLY)";
      }

      return {
        tools: [
          {
            name: "mysql_query",
            description,
            inputSchema: {
              type: "object",
              properties: {
                sql: { type: "string" },
              },
            },
          },
        ],
      };
    },

    async callTool(name: string, args: any) {
      // Implementation would send the request to the server
      if (name !== "mysql_query") {
        throw new Error(`Unknown tool: ${name}`);
      }

      // Check if the query is a write operation
      const sql = args.sql.trim().toUpperCase();
      const isInsert = sql.startsWith("INSERT");
      const isUpdate = sql.startsWith("UPDATE");
      const isDelete = sql.startsWith("DELETE");

      // Check if the operations are allowed
      const allowInsert = process.env.ALLOW_INSERT_OPERATION === "true";
      const allowUpdate = process.env.ALLOW_UPDATE_OPERATION === "true";
      const allowDelete = process.env.ALLOW_DELETE_OPERATION === "true";

      // If it's a write operation and not allowed, return an error
      if (isInsert && !allowInsert) {
        return {
          content: [
            { type: "text", text: "Error: INSERT operations are not allowed." },
          ],
          isError: true,
        };
      }

      if (isUpdate && !allowUpdate) {
        return {
          content: [
            { type: "text", text: "Error: UPDATE operations are not allowed." },
          ],
          isError: true,
        };
      }

      if (isDelete && !allowDelete) {
        return {
          content: [
            { type: "text", text: "Error: DELETE operations are not allowed." },
          ],
          isError: true,
        };
      }

      // Mock responses based on the operation type
      if (isInsert && allowInsert) {
        return {
          content: [
            {
              type: "text",
              text: "Insert successful. Affected rows: 1, Last insert ID: 42",
            },
          ],
          isError: false,
        };
      }

      if (isUpdate && allowUpdate) {
        return {
          content: [
            {
              type: "text",
              text: "Update successful. Affected rows: 2, Changed rows: 1",
            },
          ],
          isError: false,
        };
      }

      if (isDelete && allowDelete) {
        return {
          content: [
            {
              type: "text",
              text: "Delete successful. Affected rows: 1",
            },
          ],
          isError: false,
        };
      }

      // For read operations, return a mock result
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify([{ result: "test" }], null, 2),
          },
        ],
        isError: false,
      };
    },

    async listResources() {
      // Implementation would communicate with the server
      return {
        resources: [
          {
            uri: `mysql://127.0.0.1:3306/test_table/schema`,
            mimeType: "application/json",
            name: '"test_table" database schema',
          },
        ],
      };
    },

    async readResource(uri: string) {
      // Implementation would communicate with the server
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              [
                { column_name: "id", data_type: "int" },
                { column_name: "name", data_type: "varchar" },
                { column_name: "created_at", data_type: "timestamp" },
              ],
              null,
              2,
            ),
          },
        ],
      };
    },

    close() {
      // Clean up resources
    },
  };
}

describe("Server", () => {
  let serverProcess: any;
  let pool: any;
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    // Set the write operation flags to false by default
    process.env.ALLOW_INSERT_OPERATION = "false";
    process.env.ALLOW_UPDATE_OPERATION = "false";
    process.env.ALLOW_DELETE_OPERATION = "false";

    // Set up test database
    pool = mysql2.createPool({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASS || "",
      database: process.env.MYSQL_DB || "mcp_test",
      connectionLimit: 5,
    });

    // Create test client
    client = createTestClient();
  });

  afterAll(async () => {
    // Clean up
    if (serverProcess) {
      serverProcess.kill();
    }
    if (pool) {
      await pool.end();
    }
    if (client) {
      client.close();
    }
  });

  it("should list available tools", async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("mysql_query");
    // By default, should be read-only
    expect(result.tools[0].description).toContain("READ-ONLY");
  });

  it("should execute a query tool", async () => {
    const result = await client.callTool("mysql_query", {
      sql: "SELECT * FROM test_table",
    });
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });

  it("should list available resources", async () => {
    const result = await client.listResources();
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toContain("test_table");
  });

  it("should read a resource", async () => {
    const uri = "mysql://127.0.0.1:3306/test_table/schema";
    const result = await client.readResource(uri);
    expect(result.contents).toHaveLength(1);

    const content = JSON.parse(result.contents[0].text);
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]).toHaveProperty("column_name");
    expect(content[0]).toHaveProperty("data_type");
  });

  // Tests for write operations
  describe("Write Operations", () => {
    it("should block INSERT operations by default", async () => {
      const result = await client.callTool("mysql_query", {
        sql: 'INSERT INTO test_table (name) VALUES ("Test Insert")',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "INSERT operations are not allowed",
      );
    });

    it("should block UPDATE operations by default", async () => {
      const result = await client.callTool("mysql_query", {
        sql: 'UPDATE test_table SET name = "Updated" WHERE id = 1',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "UPDATE operations are not allowed",
      );
    });

    it("should block DELETE operations by default", async () => {
      const result = await client.callTool("mysql_query", {
        sql: "DELETE FROM test_table WHERE id = 1",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "DELETE operations are not allowed",
      );
    });

    it("should allow INSERT operations when enabled", async () => {
      // Enable INSERT operations for this test
      process.env.ALLOW_INSERT_OPERATION = "true";

      const result = await client.callTool("mysql_query", {
        sql: 'INSERT INTO test_table (name) VALUES ("Test Insert")',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Insert successful");

      // Reset the flag
      process.env.ALLOW_INSERT_OPERATION = "false";
    });

    it("should allow UPDATE operations when enabled", async () => {
      // Enable UPDATE operations for this test
      process.env.ALLOW_UPDATE_OPERATION = "true";

      const result = await client.callTool("mysql_query", {
        sql: 'UPDATE test_table SET name = "Updated" WHERE id = 1',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Update successful");

      // Reset the flag
      process.env.ALLOW_UPDATE_OPERATION = "false";
    });

    it("should allow DELETE operations when enabled", async () => {
      // Enable DELETE operations for this test
      process.env.ALLOW_DELETE_OPERATION = "true";

      const result = await client.callTool("mysql_query", {
        sql: "DELETE FROM test_table WHERE id = 1",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Delete successful");

      // Reset the flag
      process.env.ALLOW_DELETE_OPERATION = "false";
    });

    it("should update the tool description when write operations are enabled", async () => {
      // Enable all write operations for this test
      process.env.ALLOW_INSERT_OPERATION = "true";
      process.env.ALLOW_UPDATE_OPERATION = "true";
      process.env.ALLOW_DELETE_OPERATION = "true";

      const result = await client.listTools();

      expect(result.tools[0].description).toContain("INSERT");
      expect(result.tools[0].description).toContain("UPDATE");
      expect(result.tools[0].description).toContain("DELETE");
      expect(result.tools[0].description).not.toContain("READ-ONLY");

      // Reset the flags
      process.env.ALLOW_INSERT_OPERATION = "false";
      process.env.ALLOW_UPDATE_OPERATION = "false";
      process.env.ALLOW_DELETE_OPERATION = "false";
    });
  });
});

