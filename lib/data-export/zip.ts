type ZipInputFile = {
  name: string;
  data: Uint8Array;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(value: number): Uint8Array {
  const buffer = new Uint8Array(2);
  buffer[0] = value & 0xff;
  buffer[1] = (value >>> 8) & 0xff;
  return buffer;
}

function writeUint32LE(value: number): Uint8Array {
  const buffer = new Uint8Array(4);
  buffer[0] = value & 0xff;
  buffer[1] = (value >>> 8) & 0xff;
  buffer[2] = (value >>> 16) & 0xff;
  buffer[3] = (value >>> 24) & 0xff;
  return buffer;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function encodeFileName(name: string): Uint8Array {
  return new TextEncoder().encode(name);
}

export function createZipArchive(files: ZipInputFile[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encodeFileName(file.name);
    const checksum = crc32(file.data);
    const size = file.data.length;

    const localHeader = concat([
      writeUint32LE(0x04034b50),
      writeUint16LE(20),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint32LE(checksum),
      writeUint32LE(size),
      writeUint32LE(size),
      writeUint16LE(nameBytes.length),
      writeUint16LE(0),
      nameBytes,
      file.data,
    ]);

    localParts.push(localHeader);

    const centralHeader = concat([
      writeUint32LE(0x02014b50),
      writeUint16LE(20),
      writeUint16LE(20),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint32LE(checksum),
      writeUint32LE(size),
      writeUint32LE(size),
      writeUint16LE(nameBytes.length),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint16LE(0),
      writeUint32LE(0),
      writeUint32LE(offset),
      nameBytes,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length;
  }

  const centralDirectory = concat(centralParts);
  const endRecord = concat([
    writeUint32LE(0x06054b50),
    writeUint16LE(0),
    writeUint16LE(0),
    writeUint16LE(files.length),
    writeUint16LE(files.length),
    writeUint32LE(centralDirectory.length),
    writeUint32LE(offset),
    writeUint16LE(0),
  ]);

  return concat([...localParts, centralDirectory, endRecord]);
}
