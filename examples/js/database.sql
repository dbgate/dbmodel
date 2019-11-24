IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Album'))
BEGIN
PRINT 'Creating table Album'
CREATE TABLE [Album] (
  [AlbumId] int IDENTITY NOT NULL,
  [Title] nvarchar(160)  NOT NULL,
  [ArtistId] int  NOT NULL,
  CONSTRAINT PK_Album PRIMARY KEY ([AlbumId])
);

END
ELSE
BEGIN
PRINT 'Table Album already exists'
END
GO
IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Album' AND COLUMN_NAME='AlbumId'))
BEGIN
PRINT 'Creating column Album.AlbumId'
ALTER TABLE [Album] ADD [AlbumId] int IDENTITY NOT NULL
END
GO
IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Album' AND COLUMN_NAME='Title'))
BEGIN
PRINT 'Creating column Album.Title'
ALTER TABLE [Album] ADD [Title] nvarchar(160)  NOT NULL
END
GO
IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Album' AND COLUMN_NAME='ArtistId'))
BEGIN
PRINT 'Creating column Album.ArtistId'
ALTER TABLE [Album] ADD [ArtistId] int  NOT NULL
END
GO
IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Artist'))
BEGIN
PRINT 'Creating table Artist'
CREATE TABLE [Artist] (
  [ArtistId] int IDENTITY NOT NULL,
  [Name] nvarchar(120)  NULL,
  CONSTRAINT PK_Artist PRIMARY KEY ([ArtistId])
);

END
ELSE
BEGIN
PRINT 'Table Artist already exists'
END
GO
IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Artist' AND COLUMN_NAME='ArtistId'))
BEGIN
PRINT 'Creating column Artist.ArtistId'
ALTER TABLE [Artist] ADD [ArtistId] int IDENTITY NOT NULL
END
GO
IF (NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Artist' AND COLUMN_NAME='Name'))
BEGIN
PRINT 'Creating column Artist.Name'
ALTER TABLE [Artist] ADD [Name] nvarchar(120)  NULL
END
GO
IF (NOT EXISTS(
            SELECT *
            FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS C
            INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS FK 
              ON C.CONSTRAINT_NAME = FK.CONSTRAINT_NAME AND c.CONSTRAINT_SCHEMA = FK.CONSTRAINT_SCHEMA
            LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS PK 
              ON C.UNIQUE_CONSTRAINT_NAME = PK.CONSTRAINT_NAME AND c.UNIQUE_CONSTRAINT_SCHEMA = PK.CONSTRAINT_SCHEMA
            LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE CU 
              ON C.CONSTRAINT_NAME = CU.CONSTRAINT_NAME AND C.CONSTRAINT_SCHEMA = CU.CONSTRAINT_SCHEMA
            WHERE c.CONSTRAINT_SCHEMA = 'dbo' 
              AND FK.TABLE_NAME='Album'
              AND PK.TABLE_NAME='Artist'
              AND CU.COLUMN_NAME = 'ArtistId'
            ))
            
BEGIN
PRINT 'Creating foreign key on Album.ArtistId'
ALTER TABLE [Album] ADD CONSTRAINT [FK_Album_ArtistId] FOREIGN KEY ([ArtistId]) REFERENCES [Artist]([ArtistId])
END
GO
IF (NOT EXISTS(
      SELECT *
      FROM sys.indexes i
      inner join sys.objects o ON o.object_id = i.object_id
      WHERE i.name='UQ_AlbumTitleArtistId' and o.name='Album'
      and i.is_primary_key=0
      and i.is_hypothetical=0 and indexproperty(i.object_id, i.name, 'IsStatistics') = 0
      and objectproperty(i.object_id, 'IsUserTable') = 1
      and i.index_id between 1 and 254
      ))
BEGIN
PRINT 'Creating index UQ_AlbumTitleArtistId on Album'
CREATE UNIQUE INDEX [UQ_AlbumTitleArtistId] ON [Album] ([Title],[ArtistId]) 
END
GO
IF (NOT EXISTS(
      SELECT *
      FROM sys.indexes i
      inner join sys.objects o ON o.object_id = i.object_id
      WHERE i.name='IX_FK_Album_ArtistId' and o.name='Album'
      and i.is_primary_key=0
      and i.is_hypothetical=0 and indexproperty(i.object_id, i.name, 'IsStatistics') = 0
      and objectproperty(i.object_id, 'IsUserTable') = 1
      and i.index_id between 1 and 254
      ))
BEGIN
PRINT 'Creating index IX_FK_Album_ArtistId on Album'
CREATE  INDEX [IX_FK_Album_ArtistId] ON [Album] ([ArtistId]) 
END
GO
