import { createCipheriv, randomBytes } from 'crypto';

const enum ErrorCode {
  success = 0,
  appIDInvalid = 1,
  userIDInvalid = 3,
  secretInvalid = 5,
  effectiveTimeInSecondsInvalid = 6,
}

const enum AesEncryptMode {
  GCM = 1,
}

interface ErrorInfo {
  errorCode: ErrorCode;
  errorMessage: string;
}

function makeNonce(): number {
  const min = -Math.pow(2, 31);
  const max = Math.pow(2, 31) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function aesGcmEncrypt(plainText: string, key: string): { encryptBuf: Buffer; nonce: Buffer } {
  if (![16, 24, 32].includes(key.length)) {
    throw createError(ErrorCode.secretInvalid, 'Invalid Secret length. Key must be 16, 24, or 32 bytes.');
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText, 'utf8');
  const encryptBuf = Buffer.concat([encrypted, cipher.final(), cipher.getAuthTag()]);
  return { encryptBuf, nonce };
}

function createError(errorCode: number, errorMessage: string): ErrorInfo {
  return { errorCode, errorMessage };
}

/** ZEGOCLOUD Token04 — https://github.com/zegoim/zego_server_assistant */
export function generateToken04(
  appId: number,
  userId: string,
  secret: string,
  effectiveTimeInSeconds: number,
  payload?: string,
): string {
  if (!appId || typeof appId !== 'number') {
    throw createError(ErrorCode.appIDInvalid, 'appID invalid');
  }
  if (!userId || typeof userId !== 'string' || userId.length > 64) {
    throw createError(ErrorCode.userIDInvalid, 'userId invalid');
  }
  if (!secret || typeof secret !== 'string' || secret.length !== 32) {
    throw createError(ErrorCode.secretInvalid, 'secret must be a 32 byte string');
  }
  if (!(effectiveTimeInSeconds > 0)) {
    throw createError(ErrorCode.effectiveTimeInSecondsInvalid, 'effectiveTimeInSeconds invalid');
  }

  const VERSION_FLAG = '04';
  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: makeNonce(),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || '',
  };

  const plainText = JSON.stringify(tokenInfo);
  const { encryptBuf, nonce } = aesGcmEncrypt(plainText, secret);

  const [b1, b2, b3, b4] = [new Uint8Array(8), new Uint8Array(2), new Uint8Array(2), new Uint8Array(1)];
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, nonce.byteLength, false);
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false);
  new DataView(b4.buffer).setUint8(0, AesEncryptMode.GCM);

  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(nonce),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
    Buffer.from(b4),
  ]);

  return VERSION_FLAG + Buffer.from(buf).toString('base64');
}
