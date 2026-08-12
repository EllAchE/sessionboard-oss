import { writeFile } from 'node:fs/promises';
import { buildSpec } from '../app/api/v1/openapi.json/route';

const output = new URL('../docs/openapi.json', import.meta.url);
const origin = process.env.OPENAPI_ORIGIN ?? 'https://cicero.lhar8771.workers.dev';

await writeFile(output, `${JSON.stringify(buildSpec(origin), null, 2)}\n`);
