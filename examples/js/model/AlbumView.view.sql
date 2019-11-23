create view AlbumView 
as
select 
  Album.Title as Album, Artist.Name as Artist 
from Album
left join Artist on Album.ArtistId = Artist.ArtistId
