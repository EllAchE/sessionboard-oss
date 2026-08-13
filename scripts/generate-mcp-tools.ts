import { writeFile } from 'node:fs/promises';
import { buildMcpToolManifest } from '../lib/mcp/tools';

const output = new URL('../docs/mcp-tools.json', import.meta.url);
await writeFile(output, `${JSON.stringify(buildMcpToolManifest(), null, 2)}\n`);
