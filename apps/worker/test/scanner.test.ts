import { describe, expect, it } from 'vitest';
import type { WorkerConfig } from '../src/config.js';
import { scanBuffer } from '../src/scanner.js';

const config = {
  SCAN_MODE: 'development'
} as WorkerConfig;

describe('development malware scanner', () => {
  it('allows ordinary synthetic content', async () => {
    await expect(scanBuffer(Buffer.from('synthetic invoice'), config)).resolves.toMatchObject({
      clean: true
    });
  });

  it('blocks the EICAR test signature', async () => {
    const result = await scanBuffer(
      Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
      config
    );
    expect(result.clean).toBe(false);
    expect(result.signature).toBe('EICAR-Test-Signature');
  });
});
