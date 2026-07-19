function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

/** Reads store-method ZIP entries for export archive assertions. */
export function readZipStoreEntries(
  zip: Uint8Array,
): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 4 <= zip.byteLength) {
    const signature = readU32(zip, offset);
    if (signature !== 0x04034b50) break;

    const compression = readU16(zip, offset + 8);
    const compressedSize = readU32(zip, offset + 18);
    const nameLength = readU16(zip, offset + 26);
    const extraLength = readU16(zip, offset + 28);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(
      zip.subarray(nameStart, nameStart + nameLength),
    );
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (compression !== 0) {
      throw new Error(`unsupported_zip_compression:${compression}`);
    }

    entries.set(name, zip.subarray(dataStart, dataEnd));
    offset = dataEnd;
  }

  return entries;
}
