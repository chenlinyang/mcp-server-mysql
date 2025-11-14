# MySQL数据库优化 Design

## API contracts
**Internal Function**: `validateDatabaseAccess(sql: string, targetDb: string): boolean`
**Input**: SQL查询语句，目标数据库名称
**Output**: 布尔值，表示是否允许访问
**Errors**: 当尝试访问非目标数据库时抛出安全错误

**Internal Function**: `sanitizeQuery(sql: string, targetDb: string): string`
**Input**: 原始SQL查询，目标数据库名称
**Output**: 清理后的SQL查询
**Errors**: 语法错误或安全违规时抛出异常

## Key decisions
- **Tech choice**: 基于现有mysql2连接池和node-sql-parser - 避免引入新的依赖，保持架构一致性
- **Data flow**: 在查询执行前增加数据库访问验证层，确保所有查询都符合MYSQL_DB的限制
- **Security strategy**: 拒绝跨数据库访问而不是静默重定向，提供透明的安全控制

## Integration points
- **src/db/index.ts**: 在executeReadOnlyQuery和executeWriteQuery函数中添加数据库验证逻辑
- **src/db/utils.ts**: 扩展extractSchemaFromQuery函数，增加目标数据库验证
- **src/config/index.ts**: 保持现有的配置逻辑，确保向后兼容性
- **权限系统**: 与现有的schema级别权限控制集成，不破坏现有安全机制

## Implementation strategy
1. 在查询执行前验证数据库访问权限
2. 阻止USE语句和跨数据库引用
3. 确保所有表引用都在指定的MYSQL_DB范围内
4. 保持错误信息的清晰和有用性