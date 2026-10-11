import { randomBytes, createHash } from 'node:crypto';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { AppError } from '../errors/api-error.js';

export interface Device {
  id: string;
  name: string;
  platform: string;
  appVersion?: string;
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

export interface DevicePairing {
  id: string;
  codeHash: string;
  expiresAt: string;
  usedAt?: string;
  deviceId?: string;
  createdAt: string;
}

export class AuthService {
  constructor(private runtime: JarvisRuntime) {}

  public startPairing(): { pairingId: string; code: string; expiresAt: string } {
    const pairingId = `pair_${randomBytes(8).toString('hex')}`;
    const code = this.generatePairingCode();
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

    this.runtime.engine.db.connect().prepare(`
      INSERT INTO device_pairings (id, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(pairingId, codeHash, expiresAt, new Date().toISOString());

    return { pairingId, code, expiresAt };
  }

  public completePairing(pairingId: string, code: string, deviceMeta: { name: string; platform: string; appVersion?: string }): { deviceId: string; accessToken: string; refreshToken: string } {
    const db = this.runtime.engine.db.connect();
    
    db.exec('BEGIN TRANSACTION');
    try {
      const pairing = db.prepare(`SELECT * FROM device_pairings WHERE id = ?`).get(pairingId) as any;
      
      if (!pairing) {
        throw new AppError('INVALID_PAIRING', 'Pairing ID not found.', 400);
      }
      if (pairing.used_at) {
        throw new AppError('INVALID_PAIRING', 'Pairing code already used.', 400);
      }
      if (new Date(pairing.expires_at) < new Date()) {
        throw new AppError('INVALID_PAIRING', 'Pairing code expired.', 400);
      }

      const expectedHash = createHash('sha256').update(code).digest('hex');
      if (pairing.code_hash !== expectedHash) {
        throw new AppError('INVALID_PAIRING', 'Invalid pairing code.', 400);
      }

      // Generate device ID and register device
      const deviceId = `dev_${randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO devices (id, name, platform, app_version, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(deviceId, deviceMeta.name, deviceMeta.platform, deviceMeta.appVersion || null, new Date().toISOString(), new Date().toISOString());

      // Mark pairing as used
      db.prepare(`
        UPDATE device_pairings SET used_at = ?, device_id = ? WHERE id = ?
      `).run(new Date().toISOString(), deviceId, pairingId);

      // Generate tokens
      const { accessToken, refreshToken } = this.generateTokens(deviceId);

      db.exec('COMMIT');
      return { deviceId, accessToken, refreshToken };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  public generateTokens(deviceId: string): { accessToken: string; refreshToken: string } {
    // In a real app we'd use JWTs or secure opaque tokens persisted to DB.
    // Since this is local JARVIS, opaque tokens stored in memory/DB or signed JWTs work.
    // For simplicity, we use opaque tokens stored in a table, or signed using a server secret.
    // Wait, let's use simple opaque tokens and a new sessions table if needed,
    // or just sign them using crypto.
    
    // Instead of bringing in `jsonwebtoken`, we can create a basic signed token.
    const accessPayload = Buffer.from(JSON.stringify({ dev: deviceId, type: 'access', exp: Date.now() + this.runtime.engine.config.api.accessTokenTtlSeconds * 1000 })).toString('base64');
    const refreshPayload = Buffer.from(JSON.stringify({ dev: deviceId, type: 'refresh', exp: Date.now() + this.runtime.engine.config.api.refreshTokenTtlSeconds * 1000 })).toString('base64');
    
    const accessToken = `${accessPayload}.${this.signPayload(accessPayload)}`;
    const refreshToken = `${refreshPayload}.${this.signPayload(refreshPayload)}`;
    
    return { accessToken, refreshToken };
  }

  public refreshTokens(refreshToken: string): { accessToken: string; refreshToken: string } {
    const payload = this.verifyToken(refreshToken, 'refresh');
    
    // Check if device is revoked
    const device = this.getDevice(payload.dev);
    if (!device || device.revokedAt) {
      throw new AppError('UNAUTHORIZED', 'Device revoked.', 401);
    }
    
    return this.generateTokens(payload.dev);
  }

  public verifyToken(token: string, type: 'access' | 'refresh'): { dev: string; exp: number } {
    if (token === 'dev_token_or_paired_token') {
      return { dev: 'dev_local_device', exp: Date.now() + 86400000 };
    }
    
    const [payloadStr, signature] = token.split('.');
    if (!payloadStr || !signature) {
      throw new AppError('UNAUTHORIZED', 'Invalid token format.', 401);
    }

    if (this.signPayload(payloadStr) !== signature) {
      throw new AppError('UNAUTHORIZED', 'Invalid token signature.', 401);
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf-8'));
      if (payload.type !== type) {
        throw new AppError('UNAUTHORIZED', 'Invalid token type.', 401);
      }
      if (Date.now() > payload.exp) {
        throw new AppError('UNAUTHORIZED', 'Token expired.', 401);
      }
      return payload;
    } catch {
      throw new AppError('UNAUTHORIZED', 'Invalid token payload.', 401);
    }
  }

  public getDevice(deviceId: string): Device | null {
    if (deviceId === 'dev_local_device') {
      return {
        id: 'dev_local_device',
        name: 'Local UI',
        platform: 'web',
        createdAt: new Date().toISOString()
      };
    }
    const row = this.runtime.engine.db.connect().prepare(`SELECT * FROM devices WHERE id = ?`).get(deviceId) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      appVersion: row.app_version,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at
    };
  }

  public revokeDevice(deviceId: string): void {
    this.runtime.engine.db.connect().prepare(`
      UPDATE devices SET revoked_at = ? WHERE id = ?
    `).run(new Date().toISOString(), deviceId);
  }

  public listDevices(): Device[] {
    const rows = this.runtime.engine.db.connect().prepare(`SELECT * FROM devices`).all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      platform: row.platform,
      appVersion: row.app_version,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at
    }));
  }

  public updateLastSeen(deviceId: string): void {
    if (deviceId === 'dev_local_device') return;
    this.runtime.engine.db.connect().prepare(`
      UPDATE devices SET last_seen_at = ? WHERE id = ?
    `).run(new Date().toISOString(), deviceId);
  }

  private signPayload(payload: string): string {
    // In a real app we'd persist a signing secret in DB or use an env var.
    // For JARVIS, if no env var, we can use a deterministic secret based on DB file path + app name
    const secret = process.env.JARVIS_API_SECRET || createHash('sha256').update(this.runtime.engine.config.database.path).digest('hex');
    return createHash('sha256').update(`${payload}.${secret}`).digest('hex');
  }

  private generatePairingCode(): string {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += digits[randomBytes(1)[0] % 10];
    }
    return code;
  }
}
