'use strict';

const fs = require('fs');
const path = require('path');
const { HeadBucketCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = value;
  }
}

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

async function main() {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('Missing R2_* env vars. Set them in .env or Railway.');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`OK: bucket "${bucket}" is reachable (read)`);

  const testKey = `health-check/${Date.now()}.txt`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: Buffer.from('premium-status-r2-ok'),
        ContentType: 'text/plain',
      }),
    );
    console.log(`OK: test upload succeeded (${testKey})`);
  } catch (err) {
    console.error('WRITE FAILED:', err.message);
    console.error('');
    console.error('Fix in Cloudflare dashboard:');
    console.error('  1. R2 → Manage R2 API Tokens → Delete old tokens');
    console.error('  2. Create API token → Permission: Admin Read & Write');
    console.error('  3. Bucket: status');
    console.error('  4. Copy Access Key ID + Secret → Railway Variables');
    console.error('  5. Redeploy backend');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('R2 test failed:', err.message);
  process.exit(1);
});
