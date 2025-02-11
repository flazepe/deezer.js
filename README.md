# deezer.js

A simple package to interact with the Deezer API with track decryption support.

## Examples

### Searching for tracks, albums, artists, and playlists

```js
const { writeFile } = "fs/promises",
	Deezer = require("@flazepe/deezer.js"),
	deezer = new Deezer();

(async () => {
	// Search for tracks
	const tracks = await deezer.search("A track name", "track"); // Or simply `await deezer.search("A track name")`
	if (tracks[0]) console.log(tracks[0]);

	// Search for albums
	const albums = await deezer.search("An album name", "album");
	if (albums[0]) console.log(albums[0]);

	// Search for artists
	const artists = await deezer.search("An artist name", "artist");
	if (artists[0]) console.log(artists[0]);

	// Search for playlists
	const playlists = await deezer.search("A playlist name", "playlist");
	if (playlists[0]) console.log(playlists[0]);
})();
```

### Getting tracks, albums, artists, and playlists

```js
const { writeFile } = "fs/promises",
	Deezer = require("@flazepe/deezer.js"),
	deezer = new Deezer();

(async () => {
	// Get a track by ID
	let entity = await deezer.get("A track ID", "track"); // Or simply `await deezer.get("A track ID")`
	if (entity) console.log(entity.type, entity.info, entity.tracks); // `entity.tracks` would contain exactly 1 track

	// Get an album by ID
	entity = await deezer.get("An album ID", "album");
	if (entity) console.log(entity.type, entity.info, entity.tracks); // `entity.tracks` would contain the album's tracks

	// Get an artist by ID
	entity = await deezer.get("An artist ID", "artist");
	if (entity) console.log(entity.type, entity.info, entity.tracks); // `entity.tracks` would contain the artist's top tracks

	// Get a playlist by ID
	entity = await deezer.get("A playlist ID", "playlist");
	if (entity) console.log(entity.type, entity.info, entity.tracks); // `entity.tracks` would contain the playlist's tracks

	// No need to provide the entity type if you are providing a URL
	entity = await deezer.get("https://www.deezer.com/en/album/428673387");
	if (entity) console.log(entity.type, entity.info, entity.tracks);
})();
```

### Downloading a track

```js
const { writeFile } = "fs/promises",
	Deezer = require("@flazepe/deezer.js"),
	deezer = new Deezer();

(async () => {
	const tracks = await deezer.search("From Under Cover (Caught Up In A Love Song)"),
		track = tracks[0],
		trackBuffer = await deezer.getAndDecryptTrack(track);

	// Save track to a file
	await writeFile(`${track.ART_NAME} - ${track.SNG_TITLE}.mp3`, trackBuffer);
})();
```

### Downloading a track in FLAC (for Deezer Premium accounts only)

You can find your user session ID by grabbing the value of the `sid` cookie on the player after logging in.

```js
const { writeFile } = "fs/promises",
	Deezer = require("@flazepe/deezer.js"),
	deezer = new Deezer("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"); // Insert your user session ID here

(async () => {
	const tracks = await deezer.search("From Under Cover (Caught Up In A Love Song)"),
		track = tracks[0],
		trackBuffer = await deezer.getAndDecryptTrack(track, true); // Set `true` for the `flac` option

	// Save track to a file
	await writeFile(`${track.ART_NAME} - ${track.SNG_TITLE}.flac`, trackBuffer);
})();
```

## Links

-   [Documentation](https://flazepe.github.io/deezer.js/)
-   [npm](https://www.npmjs.com/package/@flazepe/deezer.js)
