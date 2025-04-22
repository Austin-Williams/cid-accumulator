// Minimal drop-in replacement for multiformats/cid CID class
// Supports dag-cbor (0x71), sha2-256 (0x12), and V1 CIDs
// Generics: CID<T = unknown, Code extends number = number, Alg extends number = number, Version extends number = number>

// Minimal base32 encoding/decoding for CID string representation
// (Uses RFC4648 alphabet, lower-case)
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"
function base32encode(bytes: Uint8Array): string {
	let bits = 0,
		value = 0,
		output = ""
	for (let i = 0; i < bytes.length; i++) {
		value = (value << 8) | bytes[i]
		bits += 8
		while (bits >= 5) {
			output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
			bits -= 5
		}
	}
	if (bits > 0) {
		output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
	}
	return output
}

function base32decode(str: string): Uint8Array {
	let bits = 0,
		value = 0,
		//_index = 0,
		output = []
	str = str.toLowerCase().replace(/=+$/, "")
	for (let i = 0; i < str.length; i++) {
		value = (value << 5) | BASE32_ALPHABET.indexOf(str[i])
		bits += 5
		if (bits >= 8) {
			output.push((value >>> (bits - 8)) & 0xff)
			bits -= 8
		}
	}
	return new Uint8Array(output)
}

// Type for multihash digest (matches multiformats)
export interface MultihashDigest<Alg extends number = number> {
	code: Alg
	digest: Uint8Array
	size: number
	bytes: Uint8Array
}

export class CID<
	Data = unknown,
	Format extends number = number,
	Alg extends number = number,
	Version extends number = number,
> {
	// === Properties ===
	public readonly bytes: Uint8Array
	public readonly code: Format
	public readonly multihash: MultihashDigest<Alg>
	public readonly version: Version
	public readonly [Symbol.toStringTag]: string = "CID"

	// === Accessors ===
	get asCID(): CID<Data, Format, Alg, Version> | null {
		return this
	}
	get byteLength(): number {
		return this.bytes.length
	}
	get byteOffset(): number {
		return 0
	}

	// === Constructors ===
	constructor(version: Version, code: Format, multihash: MultihashDigest<Alg>, bytes?: Uint8Array) {
		this.version = version
		this.code = code
		this.multihash = multihash
		this.bytes = bytes || CID.encodeBytes(version, code, multihash.bytes)
	}

	// === Instance Methods ===
	equals(other: CID<any, any, any, any>): boolean {
		return other && this.toString() === other.toString()
	}
	link(): this {
		return this
	}
	toJSON(): any {
		return { "/": this.toString() }
	}
	toString(base?: { encode: (bytes: Uint8Array) => string }): string {
		// base32-encode the bytes, prefix with 'b' unless custom base provided
		if (base && typeof base.encode === "function") {
			return base.encode(this.bytes)
		}
		return "b" + base32encode(this.bytes)
	}
	toV0(): CID<Data, 112, 18, 0> {
		throw new Error("toV0 not supported in this minimal CID")
	}
	toV1(): CID<Data, Format, Alg, 1> {
		if (this.version === 1) return this as any
		throw new Error("Only v1 supported in this minimal CID")
	}

	// === Static Methods ===
	static asCID<
		T = unknown,
		Format extends number = number,
		Alg extends number = number,
		Version extends number = number,
	>(maybeCID: any): CID<T, Format, Alg, Version> | null {
		if (maybeCID && maybeCID instanceof CID) return maybeCID
		return null
	}

	static create<
		T = unknown,
		Format extends number = number,
		Alg extends number = number,
		Version extends number = number,
	>(version: Version, code: Format, multihash: MultihashDigest<Alg>): CID<T, Format, Alg, Version> {
		return new CID(version, code, multihash)
	}

	static createV0<T = unknown>(_multihash: MultihashDigest<18>): CID<T, 112, 18, 0> {
		throw new Error("CIDv0 not supported in this minimal CID")
	}

	static createV1<T = unknown, Format extends number = number, Alg extends number = number>(
		code: Format,
		multihash: MultihashDigest<Alg>,
	): CID<T, Format, Alg, 1> {
		return new CID(1 as const, code, multihash)
	}

	static decode(bytes: Uint8Array): CID<any, any, any, any> {
		if (bytes[0] === 1) {
			// V1: [1][codec][multihash...]
			const version = 1
			const code = CID.readVarint(bytes, 1)
			const codeLen = CID.varintLength(bytes, 1)
			const mhStart = 1 + codeLen
			const mh = CID.decodeMultihash(bytes.slice(mhStart))
			return new CID(version, code.value, mh, bytes)
		}
		throw new Error("Only CIDv1 supported")
	}

	static decodeFirst(bytes: Uint8Array): [CID<any, any, any, any>, number] {
		const cid = CID.decode(bytes)
		return [cid, cid.bytes.length]
	}

	static equals(a: CID<any, any, any, any>, b: CID<any, any, any, any>): boolean {
		return a && b && a.toString() === b.toString()
	}

	static inspectBytes(bytes: Uint8Array): any {
		// Minimal stub, not a full implementation
		return { version: bytes[0], codec: bytes[1], multihashCode: bytes[2] }
	}

	static parse(str: string): CID<any, any, any, any> {
		// Expect base32-encoded CIDv1
		if (str[0] !== "b") throw new Error('CID string must be base32 (start with "b")')
		const bytes = base32decode(str.slice(1))
		return CID.decode(bytes)
	}

	// === Helpers ===
	static encodeBytes(version: number, code: number, mhBytes: Uint8Array): Uint8Array {
		// [version (varint)][codec (varint)][multihash...]
		// For v1: version = 1 (1 byte), codec = 0x71 (1 byte)
		return new Uint8Array([version, code, ...mhBytes])
	}

	static readVarint(bytes: Uint8Array, offset: number): { value: number; length: number } {
		// Only supports single-byte varints (for 1 and 0x71)
		return { value: bytes[offset], length: 1 }
	}
	static varintLength(_bytes: Uint8Array, _offset: number): number {
		return 1
	}
	static decodeMultihash(bytes: Uint8Array): MultihashDigest<number> {
		// [code][length][digest...]
		const code = bytes[0]
		const size = bytes[1]
		const digest = bytes.slice(2, 2 + size)
		const mhBytes = bytes.slice(0, 2 + size)
		return { code, digest, size, bytes: mhBytes }
	}
}
