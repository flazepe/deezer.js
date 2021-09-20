const { createDecipheriv, createHash } = require("crypto"),
	{ request } = require("https"),
	CBC_KEY = "g4el58wc" + "0zvf9na1",
	ENTITY_TYPES = ["track", "album", "artist", "playlist"];

module.exports.Deezer = class Deezer {
	#initialized = false;
	#sessionID = null;
	#apiToken = null;
	#licenseToken = null;

	constructor() {}

	#request(url, options = {}) {
		return new Promise((resolve, reject) =>
			request(url, options, res => {
				const chunks = [];

				res.on("data", chunk => chunks.push(chunk)).on("end", () => {
					const buffer = Buffer.concat(chunks);

					try {
						resolve(options.buffer ? buffer : JSON.parse(buffer.toString()));
					} catch (error) {
						reject(error);
					}
				});
			})
				.on("error", reject)
				.end(options.body)
		);
	}

	async #initialize() {
		const userData = await this.#request(
			"https://www.deezer.com/ajax/gw-light.php?method=deezer.getUserData&input=3&api_version=1.0&api_token="
		);

		this.#initialized = true;
		this.#sessionID = userData.results.SESSION_ID;
		this.#apiToken = userData.results.checkForm;
		this.#licenseToken = userData.results.USER.OPTIONS.license_token;
	}

	/**
	 * Does a request to the Deezer API.
	 * @param {string} method The Deezer API method.
	 * @param {Object} [body] The JSON body.
	 * @returns {Promise<Object>} The response.
	 */
	async api(method, body) {
		if (!this.#initialized) await this.#initialize();

		return this.#request(
			`https://www.deezer.com/ajax/gw-light.php?method=${method}&input=3&api_version=1.0&api_token=${
				this.#apiToken
			}`,
			{
				method: "POST",
				headers: { cookie: `sid=${this.#sessionID}` },
				body: JSON.stringify(body)
			}
		);
	}

	/**
	 * Searches for entities.
	 * @param {string} query The query.
	 * @param {"track" | "album" | "artist" | "playlist"} [type = "track"] The entity type.
	 * @returns {Promise<Array>} An array of search results.
	 */
	async search(query, type) {
		type = type?.toLowerCase();
		if (!ENTITY_TYPES.includes(type)) type = "track";

		return (await this.api("deezer.pageSearch", { query, start: 0, nb: 200, top_tracks: true }))
			.results[type.toUpperCase()].data;
	}

	/**
	 * Gets an entity by ID or URL.
	 * @param {string} idOrURL The entity ID or URL.
	 * @param {"track" | "album" | "artist" | "playlist"} [type] The entity type. Optional if a URL is provided.
	 * @returns {Promise<Object | null>} An object with entity info and resolved tracks.
	 */
	async get(idOrURL, type) {
		if (type) {
			type = type.toLowerCase();
		} else {
			while (idOrURL.endsWith("/")) idOrURL = idOrURL.slice(0, -1);

			type = ENTITY_TYPES.find(e => idOrURL.toLowerCase().includes(e));
			idOrURL = idOrURL.split("/").pop().split("?").shift();

			if (!type || !/^[0-9]+$/.test(idOrURL)) return null;
		}

		const data = { type };

		switch (type) {
			case "track":
				const track = (await this.api("song.getListData", { sng_ids: [idOrURL] })).results
					.data[0];

				Object.assign(data, { info: track, tracks: [track] });
				break;

			case "album":
				const album = (
					await this.api("deezer.pageAlbum", { alb_id: idOrURL, nb: 200, lang: "us" })
				).results;

				Object.assign(data, { info: album.DATA, tracks: album.SONGS?.data ?? [] });
				break;

			case "artist":
				const artist = (
					await this.api("deezer.pageArtist", { art_id: idOrURL, lang: "us" })
				).results;

				Object.assign(data, { info: artist.DATA, tracks: artist.TOP?.data ?? [] });
				break;

			case "playlist":
				const playlist = (
					await this.api("deezer.pagePlaylist", { playlist_id: idOrURL, nb: 200 })
				).results;

				Object.assign(data, { info: playlist.DATA, tracks: playlist.SONGS?.data ?? [] });
				break;
		}

		return data.info ? data : null;
	}

	/**
	 * Gets a track buffer and decrypts it.
	 * @param {Object} track The track object.
	 * @returns {Promise<Buffer>} The decrypted track buffer.
	 */
	async getAndDecryptTrack(track) {
		if (!this.#initialized) await this.#initialize();

		const buffer = await this.#request(
				(
					await this.#request("https://media.deezer.com/v1/get_url", {
						method: "POST",
						body: JSON.stringify({
							license_token: this.#licenseToken,
							media: [
								{
									type: "FULL",
									formats: [{ cipher: "BF_CBC_STRIPE", format: "MP3_128" }]
								}
							],
							track_tokens: [track.TRACK_TOKEN]
						})
					})
				).data[0].media[0].sources[0].url,
				{ buffer: true }
			),
			blowFishKey = (() => {
				const md5 = createHash("md5").update(track.SNG_ID, "ascii").digest("hex");

				let key = "";

				for (let i = 0; i < 16; i++)
					key += String.fromCharCode(
						md5.charCodeAt(i) ^ md5.charCodeAt(i + 16) ^ CBC_KEY.charCodeAt(i)
					);

				return key;
			})(),
			decryptedBuffer = Buffer.alloc(buffer.length);

		let i = 0,
			position = 0;

		while (position < buffer.length) {
			const chunkSize = buffer.length - position >= 2048 ? 2048 : buffer.length - position,
				chunk = Buffer.alloc(chunkSize);

			buffer.copy(chunk, 0, position, position + chunkSize);

			const chunkString =
				i % 3 || chunkSize < 2048
					? chunk.toString("binary")
					: createDecipheriv("bf-cbc", blowFishKey, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))
							.setAutoPadding(false)
							.update(chunk, "binary", "binary");

			decryptedBuffer.write(chunkString, position, chunkString.length, "binary");

			position += chunkSize;
			i++;
		}

		return decryptedBuffer;
	}
};
