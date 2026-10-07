import {createRemoteJWKSet, jwtVerify} from 'jose';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),{timeoutDuration:5000});
export async function verifySession(token, project, jwks = keys, now = Date.now()) {
  const {payload} = await jwtVerify(token,jwks,{algorithms:['RS256'],audience:project,
    issuer:`https://securetoken.google.com/${project}`,requiredClaims:['exp','iat','sub','auth_time'],currentDate:new Date(now)});
  const seconds = Math.floor(now/1000);
  if (!payload.sub || payload.sub.length>128 || !Number.isFinite(payload.iat) || payload.iat>seconds
    || !Number.isFinite(payload.auth_time) || payload.auth_time>seconds) throw Error('Invalid session');
  return payload.sub;
}
