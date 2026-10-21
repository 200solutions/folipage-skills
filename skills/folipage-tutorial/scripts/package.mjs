#!/usr/bin/env node
/**
 * Validates a tutorial folder and zips it for the folipage import. No
 * dependencies; Node 18+.
 *
 *   node package.mjs <docs-dir> [<out.zip>]
 *
 * Refuses when validation finds errors. Entries are sorted, so topic folders
 * reach the import — and the sidebar — in the order of their number prefix.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { listFiles, report, validate } from "./validate.mjs";

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(buf) {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
		date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
	};
}

/** A plain ZIP: deflate where it helps, stored where it does not (PNG, JPEG). */
export function zip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const { name, data, mtime } of entries) {
		const nameBuf = Buffer.from(name, "utf8");
		const deflated = deflateRawSync(data, { level: 9 });
		const stored = deflated.length >= data.length;
		const body = stored ? data : deflated;
		const crc = crc32(data);
		const { time, date } = dosTime(mtime);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6); // names are UTF-8
		local.writeUInt16LE(stored ? 0 : 8, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(date, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);
		locals.push(local, nameBuf, body);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(stored ? 0 : 8, 10);
		central.writeUInt16LE(time, 12);
		central.writeUInt16LE(date, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBuf);

		offset += local.length + nameBuf.length + body.length;
	}
	const directory = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, directory, end]);
}

const [dir, out] = process.argv.slice(2);
if (!dir) {
	console.log("Usage: node package.mjs <docs-dir> [<out.zip>]");
	process.exit(1);
}
const result = validate(dir);
report(result);
if (result.errors.length) {
	console.log("\nNot packaged: fix the errors above first.");
	process.exit(1);
}
const root = resolve(dir);
const target = resolve(out ?? `${basename(root)}.zip`);
if (!relative(root, target).startsWith("..")) {
	console.error("The ZIP must be written outside the docs folder, or it would end up inside the next package.");
	process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
const entries = listFiles(root).map((name) => ({
	name,
	data: readFileSync(join(root, name)),
	mtime: statSync(join(root, name)).mtime,
}));
writeFileSync(target, zip(entries));
console.log(`\nPackaged ${entries.length} files → ${target} (${(statSync(target).size / 1048576).toFixed(1)} MB)`);
