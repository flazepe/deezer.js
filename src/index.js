const blowfish = require("blowfish-js"),
	{ createHash } = require("crypto"),
	{ request } = require("https");

/**
 * @typedef {Object} Entity An object with entity type, info, and resolved tracks
 * @property {string} type The entity type
 * @property {Object} info The entity information
 * @property {Array} tracks An array of the entity's tracks
 */

class Deezer {
	static #CBC_KEY = "g4el58wc" + "0zvf9na1";
	static #ENTITY_TYPES = ["track", "album", "artist", "playlist"];
	static #SESSION_EXPIRE = 60000 * 15;
	#arl = null;
	#currentSessionTimestamp = null;
	#sessionID = null;
	#apiToken = null;
	#isPremium = false;
	#licenseToken = null;

	/**
	 * Constructs the Deezer class.
	 * @param {string} [arl] The Deezer ARL cookie, for authenticating as a Deezer Premium account
	 * @returns {Object} The Deezer class instance
	 */
	constructor(arl) {
		if (typeof arl === "string") this.#arl = arl;
	}

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

	async #ensureSession() {
		if (this.#currentSessionTimestamp + Deezer.#SESSION_EXPIRE > Date.now()) return;

		const data = await this.#request("https://www.deezer.com/ajax/gw-light.php?method=deezer.getUserData&input=3&api_version=1.0&api_token=", {
			headers: this.#arl ? { cookie: `arl=${this.#arl}` } : null
		});

		this.#currentSessionTimestamp = Date.now();
		this.#sessionID = data.results.SESSION_ID;
		this.#apiToken = data.results.checkForm;
		this.#isPremium = data.results.OFFER_NAME !== "Deezer Free";
		this.#licenseToken = data.results.USER.OPTIONS.license_token;
	}

	/**
	 * Does a request to the Deezer API.
	 * @param {string} method The Deezer API method
	 * @param {Object} body The JSON body
	 * @returns {Promise<Object>} The response
	 */
	async api(method, body) {
		if (typeof method !== "string") throw new TypeError("`method` must be a string.");
		if (body?.constructor !== Object) throw new TypeError("`body` must be an object.");

		await this.#ensureSession();

		return this.#request(`https://www.deezer.com/ajax/gw-light.php?method=${method}&input=3&api_version=1.0&api_token=${this.#apiToken}`, {
			method: "POST",
			headers: { cookie: `sid=${this.#sessionID}` },
			body: JSON.stringify(body)
		});
	}

	/**
	 * Searches for entities.
	 * @param {string} query The query
	 * @param {"track" | "album" | "artist" | "playlist"} [type = "track"] The entity type
	 * @returns {Promise.<Array>} An array of search results, depending on the entity type
	 */
	async search(query, type) {
		if (typeof query !== "string") throw new TypeError("`query` must be a string.");
		type = Deezer.#ENTITY_TYPES.find(e => e === type?.toLowerCase?.()) ?? "track";
		return (await this.api("deezer.pageSearch", { query, start: 0, nb: 200, top_tracks: true })).results[type.toUpperCase()].data;
	}

	/**
	 * Gets an entity by ID or URL.
	 * @param {string} idOrURL The entity ID or URL
	 * @param {"track" | "album" | "artist" | "playlist"} [type] The entity type. Optional if a URL is provided
	 * @returns {Promise.<Entity | null>} The {@link Entity} object, or null if no entity was found
	 */
	async get(idOrURL, type) {
		if (typeof idOrURL !== "string") throw new TypeError("`idOrURL` must be a string.");

		if (type) {
			if (typeof type !== "string") throw new TypeError("`type` must be a string.");
			type = Deezer.#ENTITY_TYPES.find(e => e === type.toLowerCase()) ?? "track";
		} else {
			while (idOrURL.endsWith("/")) idOrURL = idOrURL.slice(0, -1);

			type = Deezer.#ENTITY_TYPES.find(e => idOrURL.toLowerCase().includes(e));
			idOrURL = idOrURL.split("/").pop().split("?").shift();

			if (!type || !/^[0-9]+$/.test(idOrURL)) return null;
		}

		const data = { type };

		switch (type) {
			case "track":
				const track = (await this.api("song.getListData", { sng_ids: [idOrURL] })).results.data[0];

				Object.assign(data, { info: track, tracks: [track] });
				break;

			case "album":
				const album = (await this.api("deezer.pageAlbum", { alb_id: idOrURL, nb: 200, lang: "us" })).results;

				Object.assign(data, { info: album.DATA, tracks: album.SONGS?.data ?? [] });
				break;

			case "artist":
				const artist = (await this.api("deezer.pageArtist", { art_id: idOrURL, lang: "us" })).results;

				Object.assign(data, { info: artist.DATA, tracks: artist.TOP?.data ?? [] });
				break;

			case "playlist":
				const playlist = (await this.api("deezer.pagePlaylist", { playlist_id: idOrURL, nb: 200 })).results;

				Object.assign(data, { info: playlist.DATA, tracks: playlist.SONGS?.data ?? [] });
				break;
		}

		return data.info ? data : null;
	}

	/**
	 * Gets a track buffer and decrypts it. By default, the track is in MP3.
	 * @param {Object} track The track object
	 * @param {boolean} [flac = false] Whether to get the track in FLAC. Only works for Deezer Premium accounts
	 * @returns {Promise.<Buffer>} The decrypted track buffer
	 */
	async getAndDecryptTrack(track, flac = false) {
		if (track?.constructor !== Object) throw new TypeError("`track` must be an object.");
		if (["SNG_ID", "TRACK_TOKEN"].some(e => !(e in track))) throw new TypeError("`track` must be a valid track object.");

		await this.#ensureSession();

		if (flac && !this.#isPremium)
			throw new Error("FLAC is only supported on Deezer Premium accounts. Please provide the Deezer ARL cookie to the constructor.");

		const data = await this.#request("https://media.deezer.com/v1/get_url", {
			method: "POST",
			body: JSON.stringify({
				license_token: this.#licenseToken,
				media: [
					{
						type: "FULL",
						formats: [{ cipher: "BF_CBC_STRIPE", format: flac ? "FLAC" : this.#isPremium ? "MP3_320" : "MP3_128" }]
					}
				],
				track_tokens: [track.TRACK_TOKEN]
			})
		});

		if (data.errors) throw new Error(data.errors[0].message);

		const buffer = await this.#request(data.data[0].media[0].sources[0].url, { buffer: true }),
			md5 = createHash("md5").update(track.SNG_ID).digest("hex"),
			blowfishKey = blowfish.key(
				Array(16)
					.fill(0)
					.reduce((acc, _, i) => acc + String.fromCharCode(md5.charCodeAt(i) ^ md5.charCodeAt(i + 16) ^ Deezer.#CBC_KEY.charCodeAt(i)), "")
			),
			decryptedBuffer = Buffer.alloc(buffer.length);

		let i = 0,
			position = 0;

		while (position < buffer.length) {
			const chunkSize = Math.min(2048, buffer.length - position);

			let chunk = Buffer.alloc(chunkSize);
			buffer.copy(chunk, 0, position, position + chunkSize);

			if (i % 3 || chunkSize < 2048) {
				chunk = chunk.toString("binary");
			} else {
				chunk = blowfish.cbc(blowfishKey, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), chunk, true).toString("binary");
			}

			decryptedBuffer.write(chunk, position, chunk.length, "binary");

			position += chunkSize;
			i++;
		}

		return decryptedBuffer;
	}
}

module.exports = Deezer;
