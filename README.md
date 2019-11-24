# dbmodel
Deploy, load or build script from model of SQL database. Can be used as command-line tool or as javascript functions

Model is stored as a collection of files:
* tables - stored as YAML files
  * columns
  * indexes
  * primary keys
  * foreign keys
* views - stored as SQL file with extension **.view.sql**
* stored procedures - stored as SQL file with extension **.proc.sql**
* functions - stored as SQL file with extension **.func.sql**

Currently only supported client is **mssql** .

## Installation - as global tool

    npm install --global dbmodel

## Load structure from database 

    dbmodel load -s localhost -u USERNAME -p PASSWORD -d DATABASE -c mssql OUTPUT_FOLDER

## Deploy model to database 

    dbmodel deploy -s localhost -u USERNAME -p PASSWORD -d DATABASE -c mssql PROJECT_FOLDER

## Installation - as regular package

    npm install --save dbmodel

## Deploy model to database 

```javascript
await dbmodel.deploy({
  client: 'mssql',
  connection: {
    server: '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'Chinook_Model',
  },
  hooks: [dbmodel.hooks.autoIndexForeignKeys], // this hook adds indexes to all foreign keys
  projectDir: 'model',
})
```

## Table yaml file documentation

```yaml
name: Album # table name
columns:
  - name: AlbumId # column name
    type: int # data type. is used directly in target SQL engine 
    autoIncrement: true # column is autoincrement
    notNull: true # column is not nullable (default: is nullable)
  - name: Title
    type: nvarchar
    length: 160 # maximum character length
    notNull: true
  - name: ArtistId
    type: int
    notNull: true
    references: Artist # name of table. Is used for creating foreign key
  - name: isDeleted
    type: bit
    notNull: true
    default: 0 # default value
primaryKey:
  - AlbumId # list of primary key column names
indexes:
  - name: UQ_AlbumTitleArtistId # index name
    unique: true # whether index is unique. default=false
    columns: # list of index columns
      - Title
      - ArtistId
    filter: isDeleted=0 # if defined, filtered index (with WHERE condition) is created
```
