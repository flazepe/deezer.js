declare module "@flazepe/deezer.js" {
	export type EntityType = "track" | "album" | "artist" | "playlist";

	export class Deezer {
		api(method: string, body: Record<string, any>): Promise<Record<string, any>>;
		search(query: string, type: EntityType): Promise<Array<Record<string, any>>>;
		get(
			idOrURL: string,
			type?: EntityType
		): Promise<{
			type: EntityType;
			info: Record<string, any>;
			tracks: Array<Record<string, any>>;
		} | null>;
		getAndDecryptTrack(track: any): Promise<Buffer>;
	}
}
