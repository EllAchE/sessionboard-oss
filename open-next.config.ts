import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * No incremental cache override, and so no R2 bucket to bind. R2 cannot be enabled on a Cloudflare
 * account without a payment method, and requiring one to deploy an open-source project is a worse
 * trade than losing ISR persistence — nearly every route here is dynamic and per-event anyway. A
 * deployment that wants the cache back adds `r2IncrementalCache` here and the bucket to
 * `wrangler.jsonc`.
 */
export default defineCloudflareConfig();
