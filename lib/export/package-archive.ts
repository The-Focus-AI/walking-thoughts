import type { AccountExportPackage } from "./types";

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  out[2] = (value >>> 16) & 0xff;
  out[3] = (value >>> 24) & 0xff;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function encodePath(path: string): Uint8Array {
  return new TextEncoder().encode(path);
}

function collectEntries(pkg: AccountExportPackage): ZipEntry[] {
  const entries: ZipEntry[] = [
    {
      path: "account.json",
      bytes: new TextEncoder().encode(`${JSON.stringify(pkg.document, null, 2)}\n`),
    },
  ];

  for (const [threadId, markdown] of Object.entries(pkg.markdownByThreadId)) {
    entries.push({
      path: `threads/${threadId}.md`,
      bytes: new TextEncoder().encode(markdown),
    });
  }

  for (const file of pkg.media) {
    entries.push({
      path: file.exportPath,
      bytes: file.bytes,
    });
  }

  return entries;
}

/** Store-method ZIP (no compression) for portable account archives. */
export function packageAccountExportZip(pkg: AccountExportPackage): Uint8Array {
  const entries = collectEntries(pkg);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encodePath(entry.path);
    const checksum = crc32(entry.bytes);
    const size = entry.bytes.byteLength;
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(size),
      u32(size),
      u16(name.byteLength),
      u16(0),
      name,
    ]);
    localParts.push(localHeader, entry.bytes);

    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(size),
      u32(size),
      u16(name.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + size;
  }

  const centralDirectory = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.byteLength),
    u32(offset),
    u16(0),
  ]);

  return concat([...localParts, centralDirectory, end]);
}
