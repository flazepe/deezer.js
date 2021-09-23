# deezer.js

A simple package to interact with the Deezer API with track decryption support.

# Example

```js
const { Deezer } = require("@flazepe/deezer.js"),
	deezer = new Deezer();

(async () => {
	const track = (await deezer.search("Re Bon Yoyage"))[0];

	// Save track to a file
	require("fs").writeFileSync(
		`${track.ART_NAME} - ${track.SNG_TITLE}.mp3`,
		await deezer.getAndDecryptTrack(track)
	);
})();
```

# Links

-   [Documentation](https://flazepe.github.io/deezer.js/)
-   [npm](https://www.npmjs.com/package/@flazepe/deezer.js)
