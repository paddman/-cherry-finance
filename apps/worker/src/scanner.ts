import { createConnection } from 'node:net';
import type { WorkerConfig } from './config.js';

export interface ScanResult {
  clean: boolean;
  method: string;
  signature?: string;
}

const EICAR_FRAGMENT = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';

function developmentScan(buffer: Buffer): ScanResult {
  if (buffer.toString('latin1').includes(EICAR_FRAGMENT)) {
    return {
      clean: false,
      method: 'development-eicar-check',
      signature: 'EICAR-Test-Signature'
    };
  }
  return { clean: true, method: 'development-eicar-check' };
}

async function clamavScan(
  buffer: Buffer,
  config: WorkerConfig
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: config.CLAMAV_HOST,
      port: config.CLAMAV_PORT
    });
    let response = '';
    const timer = setTimeout(() => {
      socket.destroy(new Error('ClamAV scan timed out'));
    }, config.CLAMAV_TIMEOUT_MS);

    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      response += chunk;
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      const normalized = response.trim();
      if (normalized.endsWith('OK')) {
        resolve({ clean: true, method: 'clamav-instream' });
        return;
      }
      const match = normalized.match(/: (.+) FOUND$/);
      if (match?.[1]) {
        resolve({
          clean: false,
          method: 'clamav-instream',
          signature: match[1]
        });
        return;
      }
      reject(new Error(`Unexpected ClamAV response: ${normalized || 'empty'}`));
    });
  });
}

export async function scanBuffer(
  buffer: Buffer,
  config: WorkerConfig
): Promise<ScanResult> {
  return config.SCAN_MODE === 'clamav'
    ? clamavScan(buffer, config)
    : developmentScan(buffer);
}
