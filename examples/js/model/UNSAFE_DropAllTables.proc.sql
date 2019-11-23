CREATE PROCEDURE UNSAFE_DropAllTables(@confirm VARCHAR(50))
AS
BEGIN
  IF (@confirm <> 'YES') RETURN;

  DECLARE @name VARCHAR(128)
  DECLARE @table VARCHAR(128)
  DECLARE @constraint VARCHAR(254)
  DECLARE @SQL VARCHAR(254)

  SELECT TOP 1 @table=TABLE_NAME, @constraint=CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE constraint_catalog=DB_NAME() AND CONSTRAINT_TYPE = 'FOREIGN KEY' ORDER BY TABLE_NAME

  WHILE @table IS NOT NULL AND @constraint IS NOT NULL
  BEGIN
      SELECT @SQL = 'ALTER TABLE [dbo].[' + RTRIM(@table) +'] DROP CONSTRAINT [' + RTRIM(@constraint)+']'
      EXEC (@SQL)
      PRINT 'Dropped FK Constraint: ' + @constraint + ' on ' + @table
      SELECT TOP 1 @table=TABLE_NAME, @constraint=CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE constraint_catalog=DB_NAME() AND CONSTRAINT_TYPE = 'FOREIGN KEY' ORDER BY TABLE_NAME
  END

  SELECT @name = (SELECT TOP 1 [name] FROM sysobjects WHERE [type] = 'U' AND category = 0 ORDER BY [name])
  WHILE @name IS NOT NULL
  BEGIN
      SELECT @SQL = 'DROP TABLE [dbo].[' + RTRIM(@name) +']'
      EXEC (@SQL)
      PRINT 'Dropped Table: ' + @name
      SELECT @name = (SELECT TOP 1 [name] FROM sysobjects WHERE [type] = 'U' AND category = 0 AND [name] > @name ORDER BY [name])
  END
END 
