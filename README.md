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

## Installation - as regular package

    npm install --save dbmodel

## Available commands
* **load** - loads structure of database, saves it to local directory (called *project*). Also can download data of enlisted tables (use --load-data-condition options)
* **deploy** - deploys structure from local directory (*project*) to database. *Deploy does not perform any actions leading to data loss, these changes must be made manually.*
  * creates not existing tables
  * creates not existing columns of existing tables
  * checks column NULL/NOT NULL flag, alters colums
  * checks tables, which are in database, but not in project, list of these tables are reported
  * checks columns, which are in database, but not in project, list of these columns are reported
  * checks indexes and its definitions, indexes are created or recreated, if neccessary (*but not deleted*)
  * checks and creates foreign keys
  * checks, creates new or changes existing views, stored procedures and functions
  * updates and creates static data (included in table yaml files)
* **build** - builds script from project folder. This operation is complete offline, no database connection is needed. Built script makes subset of deploy command. It can be executed on empty database, but also it can convert existing database to current structure (but only using operations below).
  * creates not existing tables
  * creates not existing columns of existing tables
  * creates not existing indexes (checked only by name)
  * creates not existing foreign keys
  * creates new or changes existing views, stored procedures and functions
  * updates and creates static data (included in table yaml files)

## Command line interface

```sh
# load from existing database
dbmodel load -s localhost -u USERNAME -p PASSWORD -d DATABASE -c mssql OUTPUT_FOLDER

# deploy project to database
dbmodel deploy -s localhost -u USERNAME -p PASSWORD -d DATABASE -c mssql PROJECT_FOLDER

# build SQL script from project
dbmodel build -c mssql PROJECT_FOLDER OUTPUT_FILE.sql
```

## JavaScript interface

```javascript
const dbmodel = require('dbmodel');

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

list of dbmodel exported functions:
* build - builds SQL script
* deploy - deploys model to database 
* dump - dumps loaded model into directory
* load - loads model from database
* read - reads model from directory
* connect - creates database connection defined in options

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
data: # static data (only for list tables)
  - AlbumId: -1 # values for all columns, which should be filled
    Title: Predefined static album
```
