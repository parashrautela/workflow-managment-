import { generateKeyPairSync, createSign } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
export const testFounder = { sub: 'test-founder', email: 'founder@gmail.com', name: 'Test Founder' };
export async function googleTestIdentity(directory) {
  const clientId = '123456-test.apps.googleusercontent.com';
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const mock = path.join(directory, 'google-certs.js');
  await writeFile(mock, `import {OAuth2Client} from 'google-auth-library';OAuth2Client.prototype.getFederatedSignonCertsAsync=async()=>({certs:{test:${JSON.stringify(keys.publicKey.export({ type: 'spki', format: 'pem' }))}}});`);
  const seed = async (file, extra = {}) => writeFile(file, JSON.stringify({ ...extra, googleAccounts: [{ id: 'test-founder-account', subject: testFounder.sub, email: testFounder.email, name: testFounder.name, kind: 'founder', status: 'Approved' }, ...(extra.googleAccounts || [])] }));
  const signIn = async (base, identity = testFounder) => {
    const challenge = await fetch(base + '/api/auth/google/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const { nonce } = await challenge.json();
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: 'https://accounts.google.com', aud: clientId, iat: now, exp: now + 3600, email_verified: true, hd: 'example.com', ...identity, nonce };
    const data = Buffer.from(JSON.stringify({ kid: 'test', alg: 'RS256' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    const credential = data + '.' + createSign('RSA-SHA256').update(data).sign(keys.privateKey, 'base64url');
    const response = await fetch(base + '/api/auth/google/sign-in', { method: 'POST', headers: { 'content-type': 'application/json', cookie: challenge.headers.getSetCookie()[0].split(';')[0] }, body: JSON.stringify({ credential, nonce }) });
    const cookies = response.headers.getSetCookie();
    return { status: response.status, data: await response.json(), cookie: cookies.findLast(value => /iksha_(employee|founder)=[A-Za-z0-9_-]+;/.test(value))?.split(';')[0] || '', cookies };
  };
  return { clientId, mock, seed, signIn };
}
