/**
 * Standalone PCAP reader for pcap-carve domain.
 * Reads classic pcap format and extracts IP/TCP/UDP/DNS packets.
 */

export interface PcapPacket {
  timestamp: number;
  capLen: number;
  origLen: number;
  data: Buffer;
  // Parsed layers
  ethType?: number;
  srcIp?: string;
  dstIp?: string;
  protocol?: number;
  srcPort?: number;
  dstPort?: number;
  tcpFlags?: number;
  tcpSeq?: number;
  tcpAck?: number;
  payload?: Buffer;
  streamIndex?: number;
}

export interface PcapHeader {
  magic: number;
  versionMajor: number;
  versionMinor: number;
  thiszone: number;
  sigfigs: number;
  snaplen: number;
  linkType: number;
  endianness: 'little' | 'big';
}

export function readPcap(buf: Buffer): { header: PcapHeader; packets: PcapPacket[] } {
  if (buf.length < 24) throw new Error('PCAP file too short');

  // Detect endianness from magic
  const magic = buf.readUInt32LE(0);
  const endianness: 'little' | 'big' =
    magic === 0xa1b2c3d4 || magic === 0xa1b23c4d ? 'big' : 'little';

  const readU32 =
    endianness === 'little'
      ? (b: Buffer, o: number) => b.readUInt32LE(o)
      : (b: Buffer, o: number) => b.readUInt32BE(o);
  const readU16 =
    endianness === 'little'
      ? (b: Buffer, o: number) => b.readUInt16LE(o)
      : (b: Buffer, o: number) => b.readUInt16BE(o);

  const header: PcapHeader = {
    magic: readU32(buf, 0),
    versionMajor: readU16(buf, 4),
    versionMinor: readU16(buf, 6),
    thiszone: readU32(buf, 8),
    sigfigs: readU32(buf, 12),
    snaplen: readU32(buf, 16),
    linkType: readU32(buf, 20),
    endianness,
  };

  const packets: PcapPacket[] = [];
  let pos = 24;

  while (pos + 16 <= buf.length) {
    const tsSec = readU32(buf, pos);
    const tsUsec = readU32(buf, pos + 4);
    const inclLen = readU32(buf, pos + 8);
    const origLen = readU32(buf, pos + 12);
    pos += 16;

    if (pos + inclLen > buf.length) break;

    const pktData = buf.subarray(pos, pos + inclLen);
    const pkt: PcapPacket = {
      timestamp: tsSec + tsUsec / 1e6,
      capLen: inclLen,
      origLen,
      data: pktData,
    };

    // Parse Ethernet
    if (header.linkType === 1 && pktData.length >= 14) {
      const ethType = pktData.readUInt16BE(12);
      pkt.ethType = ethType;

      if (ethType === 0x0800 && pktData.length >= 34) {
        // IPv4
        const ipHdrLen = (pktData[14] ?? 0 & 0x0f) * 4;
        const proto = pktData[23];
        if (proto !== undefined) pkt.protocol = proto;
        pkt.srcIp = `${pktData[26]}.${pktData[27]}.${pktData[28]}.${pktData[29]}`;
        pkt.dstIp = `${pktData[30]}.${pktData[31]}.${pktData[32]}.${pktData[33]}`;

        const transportStart = 14 + ipHdrLen;

        if (pkt.protocol === 6 && pktData.length >= transportStart + 20) {
          // TCP
          pkt.srcPort = pktData.readUInt16BE(transportStart);
          pkt.dstPort = pktData.readUInt16BE(transportStart + 2);
          const tcpHdrLen = (((pktData[transportStart + 12] ?? 0) >> 4) & 0x0f) * 4;
          pkt.tcpFlags = pktData[transportStart + 13];
          pkt.tcpSeq = pktData.readUInt32BE(transportStart + 4);
          pkt.tcpAck = pktData.readUInt32BE(transportStart + 8);
          const payloadStart = transportStart + tcpHdrLen;
          if (payloadStart < pktData.length) {
            pkt.payload = pktData.subarray(payloadStart);
          }
        } else if (pkt.protocol === 17 && pktData.length >= transportStart + 8) {
          // UDP
          pkt.srcPort = pktData.readUInt16BE(transportStart);
          pkt.dstPort = pktData.readUInt16BE(transportStart + 2);
          const udpLen = pktData.readUInt16BE(transportStart + 4);
          const payloadStart = transportStart + 8;
          if (payloadStart < pktData.length) {
            pkt.payload = pktData.subarray(
              payloadStart,
              Math.min(payloadStart + udpLen - 8, pktData.length),
            );
          }
        }
      }
    }

    packets.push(pkt);
    pos += inclLen;
  }

  return { header, packets };
}

// ── TCP Stream Reassembly ──

export interface TcpStream {
  index: number;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  packets: PcapPacket[];
  payload: Buffer;
}

export function reassembleTcpStreams(packets: PcapPacket[], maxStreams = 20): TcpStream[] {
  const streamMap = new Map<string, PcapPacket[]>();

  for (const pkt of packets) {
    if (
      pkt.protocol !== 6 ||
      !pkt.payload ||
      !pkt.srcIp ||
      !pkt.dstIp ||
      !pkt.srcPort ||
      !pkt.dstPort
    )
      continue;

    // Create a canonical stream key (lower IP:port first)
    const fwd = `${pkt.srcIp}:${pkt.srcPort}-${pkt.dstIp}:${pkt.dstPort}`;
    const rev = `${pkt.dstIp}:${pkt.dstPort}-${pkt.srcIp}:${pkt.srcPort}`;
    const key = fwd < rev ? fwd : rev;

    if (!streamMap.has(key)) streamMap.set(key, []);
    streamMap.get(key)!.push(pkt);
  }

  const streams: TcpStream[] = [];
  let idx = 0;

  for (const [key, pkts] of streamMap) {
    if (streams.length >= maxStreams) break;

    // Sort by sequence number
    pkts.sort((a, b) => (a.tcpSeq ?? 0) - (b.tcpSeq ?? 0));

    // Concatenate payloads
    const parts: Buffer[] = [];
    for (const pkt of pkts) {
      if (pkt.payload && pkt.payload.length > 0) {
        parts.push(pkt.payload);
      }
    }

    const [src, dst] = key.split('-');
    if (!src || !dst) continue;
    const [srcIp, srcPortStr] = src.split(':');
    const [dstIp, dstPortStr] = dst.split(':');
    if (!srcIp || !srcPortStr || !dstIp || !dstPortStr) continue;

    streams.push({
      index: idx++,
      srcIp,
      dstIp,
      srcPort: parseInt(srcPortStr),
      dstPort: parseInt(dstPortStr),
      packets: pkts,
      payload: Buffer.concat(parts),
    });
  }

  return streams;
}

// ── DNS Parsing ──

export interface DnsQuery {
  name: string;
  type: number;
  className: number;
}

export function parseDnsQueries(packets: PcapPacket[]): DnsQuery[] {
  const queries: DnsQuery[] = [];

  for (const pkt of packets) {
    if (!pkt.payload || pkt.payload.length < 12) continue;
    // Check if this is DNS (port 53)
    if (pkt.srcPort !== 53 && pkt.dstPort !== 53) continue;

    const buf = pkt.payload;
    const qdcount = buf.readUInt16BE(4);
    let pos = 12;

    for (let i = 0; i < qdcount && pos < buf.length; i++) {
      const labels: string[] = [];
      while (pos < buf.length) {
        const len = buf[pos++];
        if (len === undefined || len === 0) break;
        if ((len & 0xc0) === 0xc0) {
          pos++;
          break;
        }
        if (pos + len > buf.length) break;
        labels.push(buf.toString('ascii', pos, pos + len));
        pos += len;
      }
      if (pos + 4 <= buf.length) {
        queries.push({
          name: labels.join('.'),
          type: buf.readUInt16BE(pos),
          className: buf.readUInt16BE(pos + 2),
        });
      }
    }
  }

  return queries;
}
