import * as zlib from 'zlib';

export interface TestZipFile {
  filename: string;
  content: string | Buffer;
}

/**
 * Creates a valid ZIP buffer in-memory with the given files.
 */
export function createInMemoryZip(files: TestZipFile[]): Buffer {
  const localHeaderChunks: Buffer[] = [];
  const centralDirChunks: Buffer[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const rawData = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, 'utf8');
    const deflated = zlib.deflateRawSync(rawData);
    const fnBuf = Buffer.from(file.filename, 'utf8');

    // Local File Header
    const lfh = Buffer.alloc(30 + fnBuf.length);
    lfh.writeUInt32LE(0x04034b50, 0); // Local header signature
    lfh.writeUInt16LE(20, 4); // Version needed
    lfh.writeUInt16LE(0, 6); // Flags
    lfh.writeUInt16LE(8, 8); // Method: Deflate
    lfh.writeUInt16LE(0, 10); // Time
    lfh.writeUInt16LE(0, 12); // Date
    lfh.writeUInt32LE(0, 14); // CRC
    lfh.writeUInt32LE(deflated.length, 18); // Compressed size
    lfh.writeUInt32LE(rawData.length, 22); // Uncompressed size
    lfh.writeUInt16LE(fnBuf.length, 26); // Filename length
    lfh.writeUInt16LE(0, 28); // Extra length
    fnBuf.copy(lfh, 30);

    const localChunk = Buffer.concat([lfh, deflated]);
    localHeaderChunks.push(localChunk);

    // Central Directory Header
    const cdh = Buffer.alloc(46 + fnBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0); // CD header signature
    cdh.writeUInt16LE(20, 4); // Version made by
    cdh.writeUInt16LE(20, 6); // Version needed
    cdh.writeUInt16LE(0, 8); // Flags
    cdh.writeUInt16LE(8, 10); // Method
    cdh.writeUInt16LE(0, 12); // Time
    cdh.writeUInt16LE(0, 14); // Date
    cdh.writeUInt32LE(0, 16); // CRC
    cdh.writeUInt32LE(deflated.length, 20);
    cdh.writeUInt32LE(rawData.length, 24);
    cdh.writeUInt16LE(fnBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // Extra length
    cdh.writeUInt16LE(0, 32); // Comment length
    cdh.writeUInt16LE(0, 34); // Disk start
    cdh.writeUInt16LE(0, 36); // Internal attr
    cdh.writeUInt32LE(0, 38); // External attr
    cdh.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    fnBuf.copy(cdh, 46);

    centralDirChunks.push(cdh);
    currentOffset += localChunk.length;
  }

  const allLocal = Buffer.concat(localHeaderChunks);
  const allCd = Buffer.concat(centralDirChunks);

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); // Entries on disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  eocd.writeUInt32LE(allCd.length, 12); // CD size
  eocd.writeUInt32LE(allLocal.length, 16); // CD offset
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([allLocal, allCd, eocd]);
}

/**
 * Creates a valid minimal DOCX buffer with all required placeholders.
 */
export function createValidDocxBuffer(): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Receipt: {receipt.number}</w:t></w:r></w:p>
    <w:p><w:r><w:t>School: {school.name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Student: {student.fullName} ({student.admissionNumber})</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total: {payment.amount}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#allocations}{index}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{feeHead}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{amount}{/allocations}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  return createInMemoryZip([
    { filename: '[Content_Types].xml', content: contentTypesXml },
    { filename: 'word/document.xml', content: documentXml },
  ]);
}
