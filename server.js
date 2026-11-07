'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');

const scrypt = promisify(crypto.scrypt);
const ROOT = __dirname;
const SESSION_COOKIE = 'tfoc_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const MAX_REQUEST_SIZE = 8 * 1024;
const MAX_CLAN_REQUEST_SIZE = 700 * 1024;
const MAX_CLAN_LOGO_SIZE = 512 * 1024;
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SITE_CONTENT = Object.freeze({
  'hero.eyebrow': { label: 'Hero · eyebrow', value: 'TUNISIAN ESPORTS COMMUNITY' },
  'hero.titleFirst': { label: 'Hero · title line 1', value: 'PLAY AS ONE.' },
  'hero.titleSecond': { label: 'Hero · title line 2', value: 'RISE TOGETHER.' },
  'hero.description': { label: 'Hero · description', value: 'The home of Tunisian clans, players, and competitive gaming.' },
  'hero.join': { label: 'Hero · join button', value: 'Join TFOC' },
  'hero.explore': { label: 'Hero · explore link', value: 'Explore our focus' },
  'hero.footer': { label: 'Hero · footer tagline', value: 'UNITED BY THE GAME' },
  'hero.scroll': { label: 'Hero · scroll prompt', value: 'SCROLL TO EXPLORE' },
  'about.kicker': { label: 'About · section label', value: 'WHO WE ARE' },
  'about.titleFirst': { label: 'About · title line 1', value: 'ONE COMMUNITY.' },
  'about.titleSecond': { label: 'About · title line 2', value: 'COUNTLESS WAYS TO PLAY.' },
  'about.paragraphFirst': { label: 'About · paragraph 1', value: 'TFOC — the Tunisian Federation of Clans — brings players together through a shared love of gaming and competition.' },
  'about.paragraphSecond': { label: 'About · paragraph 2', value: 'From the first match to the final whistle, we believe the best moments happen when we play as one.' },
  'about.link': { label: 'About · link', value: 'Be part of the team' },
  'focus.kicker': { label: 'Focus · section label', value: 'THE TFOC SPIRIT' },
  'focus.titleFirst': { label: 'Focus · title line 1', value: 'BUILT AROUND' },
  'focus.titleSecond': { label: 'Focus · title line 2', value: 'THE GAME.' },
  'focus.description': { label: 'Focus · description', value: 'More than a match. A place to connect, improve, and represent.' },
  'focus.playTitle': { label: 'Play · title', value: 'Play together' },
  'focus.playDescription': { label: 'Play · description', value: 'Find your people and enjoy the game side by side.' },
  'focus.competeTitle': { label: 'Compete · title', value: 'Compete with pride' },
  'focus.competeDescription': { label: 'Compete · description', value: 'Bring your focus, back your teammates, and give every match your best.' },
  'focus.connectTitle': { label: 'Connect · title', value: 'Grow the community' },
  'focus.connectDescription': { label: 'Connect · description', value: 'Make new connections and help Tunisian esports move forward.' },
  'community.kicker': { label: 'Community · section label', value: 'YOUR NEXT MATCH STARTS HERE' },
  'community.titleFirst': { label: 'Community · title line 1', value: 'READY TO' },
  'community.titleSecond': { label: 'Community · title line 2', value: 'JOIN US?' },
  'community.description': { label: 'Community · description', value: 'Come meet the community and find your place in the game.' },
  'community.join': { label: 'Community · join button', value: 'Create your account' },
  'account.description': { label: 'Account · description', value: 'Create a player account with your email, player ID, and WhatsApp number. Your WhatsApp number is collected for contact only; no verification is required.' },
  'footer.description': { label: 'Footer · description', value: 'Tunisian Federation of Clans' },
  'footer.backToTop': { label: 'Footer · back to top', value: 'BACK TO TOP ↑' }
});
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/Logo.jpg', ['Logo.jpg', 'image/jpeg']],
  ['/eFootball™ 2027 Official Trailer  Season Update v6.0.0.mp4', ['eFootball™ 2027 Official Trailer  Season Update v6.0.0.mp4', 'video/mp4']]
]);

function createConfig(environment = process.env) {
  const encryptionKey = Buffer.from(environment.TFOC_DATA_ENCRYPTION_KEY || '', 'base64');
  const config = {
    sessionSecret: environment.TFOC_SESSION_SECRET || '',
    encryptionKey,
    databasePath: environment.TFOC_DB_PATH || path.join(ROOT, 'data', 'tfoc.sqlite'),
    trustProxy: environment.TFOC_TRUST_PROXY === 'true'
  };

  if (config.sessionSecret.length < 32) {
    throw new Error('TFOC_SESSION_SECRET must contain at least 32 characters.');
  }
  if (config.encryptionKey.length !== 32) {
    throw new Error('TFOC_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return config;
}

function initializeDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const previousUmask = process.platform === 'win32' ? null : process.umask(0o077);
  let database;
  try {
    database = new DatabaseSync(databasePath);
  } finally {
    if (previousUmask !== null) process.umask(previousUmask);
  }
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      player_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
      account_type TEXT NOT NULL CHECK (account_type = 'Player'),
      whatsapp_phone TEXT NOT NULL UNIQUE,
      whatsapp_phone_added_at INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
      device_serial_encrypted TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS site_content (
      content_key TEXT PRIMARY KEY,
      content_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tag TEXT NOT NULL COLLATE NOCASE UNIQUE,
      logo_mime TEXT NOT NULL CHECK (logo_mime IN ('image/png', 'image/jpeg')),
      logo_blob BLOB NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      public_roster_consent_at INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (clan_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS clan_invitations (
      id TEXT PRIMARY KEY,
      clan_id TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
      created_at INTEGER NOT NULL,
      responded_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS pending_clan_invitation
      ON clan_invitations (clan_id, invitee_id) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS clan_invitations_by_player
      ON clan_invitations (invitee_id, status);
    CREATE TABLE IF NOT EXISTS player_bans (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      device_serial_encrypted TEXT NOT NULL,
      duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
      reason TEXT NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS player_bans_active
      ON player_bans (user_id, expires_at) WHERE revoked_at IS NULL;
  `);
  const userColumns = database.prepare('PRAGMA table_info(users)').all();
  const clanColumns = database.prepare('PRAGMA table_info(clans)').all();
  if (userColumns.some((column) => column.name === 'whatsapp_verified_at')) {
    database.exec('ALTER TABLE users RENAME COLUMN whatsapp_verified_at TO whatsapp_phone_added_at');
  }
  if (!userColumns.some((column) => column.name === 'role')) {
    database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner'))");
  }
  if (!clanColumns.some((column) => column.name === 'approval_status')) {
    database.exec("ALTER TABLE clans ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'))");
  }
  if (!clanColumns.some((column) => column.name === 'reviewed_by')) {
    database.exec('ALTER TABLE clans ADD COLUMN reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL');
  }
  if (!clanColumns.some((column) => column.name === 'reviewed_at')) {
    database.exec('ALTER TABLE clans ADD COLUMN reviewed_at INTEGER');
  }
  database.exec('DROP TABLE IF EXISTS pending_registrations');
  const insertContent = database.prepare(`
    INSERT OR IGNORE INTO site_content (content_key, content_value, updated_at)
    VALUES (?, ?, ?)
  `);
  const timestamp = Date.now();
  for (const [key, content] of Object.entries(SITE_CONTENT)) {
    insertContent.run(key, content.value, timestamp);
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(databasePath, 0o600);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(`${databasePath}${suffix}`)) fs.chmodSync(`${databasePath}${suffix}`, 0o600);
    }
  }
  return database;
}

function encryptValue(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptValue(value, key) {
  const [encodedIv, encodedTag, encodedCiphertext, ...extra] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra.length) {
    throw new Error('Stored encrypted value is invalid.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function sessionHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateRegistration(data) {
  return data
    && typeof data === 'object'
    && typeof data.username === 'string'
    && /^[A-Za-z0-9_]{3,24}$/.test(data.username)
    && validEmail(data.email)
    && typeof data.playerId === 'string'
    && data.playerId.trim().length >= 3
    && data.playerId.trim().length <= 64
    && typeof data.whatsappPhone === 'string'
    && /^\+[1-9]\d{7,14}$/.test(data.whatsappPhone)
    && data.accountType === 'Player'
    && typeof data.deviceSerial === 'string'
    && data.deviceSerial.trim().length >= 3
    && data.deviceSerial.length <= 128
    && typeof data.password === 'string'
    && data.password.length >= 12
    && data.password.length <= 128;
}

function getClientIp(request, trustProxy) {
  if (trustProxy && typeof request.headers['x-forwarded-for'] === 'string') {
    return request.headers['x-forwarded-for'].split(',')[0].trim().slice(0, 64);
  }
  return request.socket.remoteAddress || 'unknown';
}

function makeRateLimiter() {
  const attempts = new Map();
  return (key, limit, windowMs) => {
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    attempts.set(key, recent);
    if (attempts.size > 10000) {
      for (const [storedKey, times] of attempts) {
        if (times.length === 0 || now - times[times.length - 1] >= windowMs) {
          attempts.delete(storedKey);
        }
      }
    }
    return true;
  };
}

function writeResponse(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(payload);
}

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}

function cookieOptions(request, config) {
  const forwardedProtocol = config.trustProxy ? request.headers['x-forwarded-proto'] : '';
  const isSecure = request.socket.encrypted || forwardedProtocol === 'https';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_DURATION / 1000)}${isSecure ? '; Secure' : ''}`;
}

function readCookie(request, name) {
  const cookieHeader = request.headers.cookie || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function requestHasSameOrigin(request) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || typeof request.headers.host !== 'string') return false;
  try {
    const parsedOrigin = new URL(origin);
    return ['http:', 'https:'].includes(parsedOrigin.protocol)
      && parsedOrigin.host.toLowerCase() === request.headers.host.toLowerCase();
  } catch {
    return false;
  }
}

async function readJson(request, maxBytes = MAX_REQUEST_SIZE) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) {
      const error = new Error('Request is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
}

function serveStatic(request, response, pathname) {
  const entry = PUBLIC_FILES.get(pathname);
  if (!entry) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Not found');
    return;
  }

  const filePath = path.join(ROOT, entry[0]);
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Not found');
    return;
  }

  response.setHeader('Content-Type', entry[1]);
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', entry[0].endsWith('.mp4') || entry[0].endsWith('.jpg') ? 'public, max-age=3600' : 'no-cache');

  const range = request.headers.range;
  if (range && entry[1] === 'video/mp4') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
      response.end();
      return;
    }
    let start = match[1] ? Number(match[1]) : Math.max(0, stats.size - Number(match[2]));
    let end = match[2] && match[1] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
    if (start >= stats.size || end < start) {
      response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stats.size}`
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.setHeader('Content-Length', stats.size);
  response.writeHead(200);
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(filePath).pipe(response);
}

function parseClanLogo(dataUrl) {
  const match = typeof dataUrl === 'string'
    && /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    throw new Error('Choose a PNG or JPEG clan logo.');
  }

  const mimeType = `image/${match[1]}`;
  const logo = Buffer.from(match[2], 'base64');
  if (logo.length === 0 || logo.length > MAX_CLAN_LOGO_SIZE || logo.toString('base64') !== match[2]) {
    throw new Error('The clan logo must be a valid image under 512 KB.');
  }

  let width;
  let height;
  if (mimeType === 'image/png'
      && logo.length >= 24
      && logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && logo.toString('ascii', 12, 16) === 'IHDR') {
    width = logo.readUInt32BE(16);
    height = logo.readUInt32BE(20);
  } else if (mimeType === 'image/jpeg' && logo[0] === 0xff && logo[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < logo.length) {
      if (logo[offset] !== 0xff) break;
      while (offset < logo.length && logo[offset] === 0xff) offset += 1;
      const marker = logo[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if ([0xd8, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(marker)) continue;
      if (offset + 2 > logo.length) break;
      const segmentLength = logo.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > logo.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (segmentLength < 7) break;
        height = logo.readUInt16BE(offset + 3);
        width = logo.readUInt16BE(offset + 5);
        break;
      }
      offset += segmentLength;
    }
  }

  if (!Number.isInteger(width) || !Number.isInteger(height)
      || width < 64 || height < 64 || width > 1024 || height > 1024
      || width !== height) {
    throw new Error('Use a square PNG or JPEG logo between 64 × 64 and 1024 × 1024 pixels.');
  }
  return { mimeType, logo };
}

function publicClanDetails(database, clan, includeIds = false) {
  const roster = database.prepare(`
    SELECT users.id, users.username, users.player_id, clan_members.role, clan_members.joined_at
    FROM clan_members
    JOIN users ON users.id = clan_members.user_id
    WHERE clan_members.clan_id = ?
    ORDER BY CASE clan_members.role WHEN 'owner' THEN 0 ELSE 1 END, users.username COLLATE NOCASE
  `).all(clan.id).map((member) => ({
    ...(includeIds ? { id: member.id } : {}),
    username: member.username,
    playerId: member.player_id,
    role: member.role,
    joinedAt: new Date(member.joined_at).toISOString()
  }));
  return {
    ...(includeIds ? { id: clan.id } : {}),
    ...(includeIds ? { approvalStatus: clan.approval_status } : {}),
    name: clan.name,
    tag: clan.tag,
    ownerUsername: clan.owner_username,
    logoUrl: `/api/clans/${encodeURIComponent(clan.tag)}/logo`,
    memberCount: roster.length,
    createdAt: new Date(clan.created_at).toISOString(),
    roster
  };
}

function createApplication(config, options = {}) {
  if (!config || config.sessionSecret.length < 32 || config.encryptionKey.length !== 32) {
    throw new Error('Valid session and encryption keys are required.');
  }

  const database = initializeDatabase(options.databasePath || config.databasePath);
  const allowRequest = makeRateLimiter();
  const dummySalt = Buffer.alloc(16, 0x54);
  const dummyHash = crypto.scryptSync('TFOC timing-safe placeholder', dummySalt, 32, PASSWORD_OPTIONS);

  function userDetails(user) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      playerId: user.player_id,
      accountType: user.account_type,
      whatsappPhone: user.whatsapp_phone,
      role: user.role,
      createdAt: new Date(user.created_at).toISOString()
    };
  }

  function getSiteContent() {
    const stored = database.prepare('SELECT content_key, content_value FROM site_content').all();
    return Object.fromEntries(stored.map((entry) => [entry.content_key, entry.content_value]));
  }

  function adminUser(request, response) {
    const user = currentUser(request);
    if (!user) {
      writeResponse(response, 401, { error: 'Sign in to access the admin dashboard.' });
      return null;
    }
    if (user.role !== 'admin' && user.role !== 'owner') {
      writeResponse(response, 403, { error: 'You do not have administrator access.' });
      return null;
    }
    return user;
  }

  function createUserSession(userId, request) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_DURATION;
    database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sessionHash(token), userId, expiresAt);
    return {
      'Set-Cookie': `${SESSION_COOKIE}=${token}; ${cookieOptions(request, config)}`
    };
  }

  function currentUser(request) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
    return database.prepare(`
      SELECT users.* FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(sessionHash(token), Date.now()) || null;
  }

  async function handleApi(request, response, pathname) {
    if (request.method === 'GET' && pathname === '/api/site-content') {
      writeResponse(response, 200, { content: getSiteContent() });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/blacklist') {
      const bans = database.prepare(`
        SELECT username, duration_days, reason, created_at, expires_at
        FROM player_bans
        WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC
      `).all(Date.now()).map((ban) => ({
        username: ban.username,
        durationDays: ban.duration_days,
        reason: ban.reason,
        createdAt: new Date(ban.created_at).toISOString(),
        expiresAt: ban.expires_at === null ? null : new Date(ban.expires_at).toISOString()
      }));
      writeResponse(response, 200, { bans });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/clans') {
      const clans = database.prepare(`
        SELECT clans.*, users.username AS owner_username
        FROM clans
        JOIN users ON users.id = clans.owner_id
        WHERE clans.approval_status = 'approved'
        ORDER BY clans.name COLLATE NOCASE
      `).all().map((clan) => publicClanDetails(database, clan));
      writeResponse(response, 200, { clans });
      return;
    }

    const clanLogoMatch = /^\/api\/clans\/([A-Z0-9]{2,8})\/logo$/i.exec(pathname);
    if (request.method === 'GET' && clanLogoMatch) {
      const clan = database.prepare('SELECT id, owner_id, approval_status, logo_mime, logo_blob FROM clans WHERE tag = ? COLLATE NOCASE')
        .get(clanLogoMatch[1]);
      if (!clan) {
        writeResponse(response, 404, { error: 'Clan not found.' });
        return;
      }
      if (clan.approval_status !== 'approved') {
        const viewer = currentUser(request);
        if (!viewer || (viewer.id !== clan.owner_id && viewer.role !== 'admin' && viewer.role !== 'owner')) {
          writeResponse(response, 404, { error: 'Clan not found.' });
          return;
        }
      }
      response.writeHead(200, {
        'Content-Type': clan.logo_mime,
        'Content-Length': clan.logo_blob.length,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(clan.logo_blob);
      return;
    }

    const publicClanMatch = /^\/api\/clans\/([A-Z0-9]{2,8})$/i.exec(pathname);
    if (request.method === 'GET' && publicClanMatch) {
      const clan = database.prepare(`
        SELECT clans.*, users.username AS owner_username
        FROM clans
        JOIN users ON users.id = clans.owner_id
        WHERE clans.tag = ? COLLATE NOCASE AND clans.approval_status = 'approved'
      `).get(publicClanMatch[1]);
      if (!clan) {
        writeResponse(response, 404, { error: 'Clan not found.' });
        return;
      }
      writeResponse(response, 200, { clan: publicClanDetails(database, clan) });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/my-clans') {
      const user = currentUser(request);
      if (!user) {
        writeResponse(response, 401, { error: 'Sign in to view your clan invitations.' });
        return;
      }
      const membership = database.prepare(`
        SELECT clans.*, users.username AS owner_username, clan_members.role AS member_role
        FROM clan_members
        JOIN clans ON clans.id = clan_members.clan_id
        JOIN users ON users.id = clans.owner_id
        WHERE clan_members.user_id = ?
      `).get(user.id);
      const invitations = database.prepare(`
        SELECT clan_invitations.id, clan_invitations.created_at, clans.id AS clan_id, clans.name, clans.tag,
          clans.owner_id, owner.username AS owner_username, inviter.username AS inviter_username,
          (SELECT COUNT(*) FROM clan_members WHERE clan_id = clans.id) AS member_count
        FROM clan_invitations
        JOIN clans ON clans.id = clan_invitations.clan_id
        JOIN users AS owner ON owner.id = clans.owner_id
        JOIN users AS inviter ON inviter.id = clan_invitations.inviter_id
        WHERE clan_invitations.invitee_id = ? AND clan_invitations.status = 'pending'
        ORDER BY clan_invitations.created_at DESC
      `).all(user.id).map((invite) => ({
        id: invite.id,
        clan: {
          id: invite.clan_id,
          name: invite.name,
          tag: invite.tag,
          ownerUsername: invite.owner_username,
          logoUrl: `/api/clans/${encodeURIComponent(invite.tag)}/logo`,
          memberCount: invite.member_count
        },
        inviterUsername: invite.inviter_username,
        createdAt: new Date(invite.created_at).toISOString()
      }));
      const sentInvitations = membership && membership.member_role === 'owner'
        ? database.prepare(`
          SELECT clan_invitations.id, clan_invitations.created_at, clan_invitations.status,
            invitee.username AS invitee_username, invitee.player_id
          FROM clan_invitations
          JOIN users AS invitee ON invitee.id = clan_invitations.invitee_id
          WHERE clan_invitations.clan_id = ? AND clan_invitations.status = 'pending'
          ORDER BY clan_invitations.created_at DESC
        `).all(membership.id).map((invite) => ({
          id: invite.id,
          username: invite.invitee_username,
          playerId: invite.player_id,
          createdAt: new Date(invite.created_at).toISOString()
        }))
        : [];
      writeResponse(response, 200, {
        clan: membership ? {
          ...publicClanDetails(database, membership, true),
          memberRole: membership.member_role
        } : null,
        invitations,
        sentInvitations
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/me') {
      const user = currentUser(request);
      writeResponse(response, 200, user
        ? { authenticated: true, user: userDetails(user) }
        : { authenticated: false });
      return;
    }

    if (pathname === '/api/admin/users' && request.method === 'GET') {
      if (!adminUser(request, response)) return;
      const users = database.prepare(`
        SELECT id, email, username, player_id, whatsapp_phone, role, created_at
        FROM users
        ORDER BY created_at DESC
      `).all().map((user) => ({
        id: user.id,
        email: user.email,
        username: user.username,
        playerId: user.player_id,
        whatsappPhone: user.whatsapp_phone,
        role: user.role,
        createdAt: new Date(user.created_at).toISOString()
      }));
      writeResponse(response, 200, { users });
      return;
    }

    if (pathname === '/api/admin/bans' && request.method === 'GET') {
      if (!adminUser(request, response)) return;
      const bans = database.prepare(`
        SELECT player_bans.*, users.username AS current_username
        FROM player_bans
        LEFT JOIN users ON users.id = player_bans.user_id
        ORDER BY player_bans.created_at DESC
      `).all().map((ban) => {
        const status = ban.revoked_at !== null
          ? 'revoked'
          : ban.expires_at !== null && ban.expires_at <= Date.now()
            ? 'expired'
            : 'active';
        return {
          id: ban.id,
          username: ban.username,
          currentUsername: ban.current_username,
          deviceSerial: decryptValue(ban.device_serial_encrypted, config.encryptionKey),
          durationDays: ban.duration_days,
          reason: ban.reason,
          status,
          createdAt: new Date(ban.created_at).toISOString(),
          expiresAt: ban.expires_at === null ? null : new Date(ban.expires_at).toISOString(),
          revokedAt: ban.revoked_at === null ? null : new Date(ban.revoked_at).toISOString()
        };
      });
      writeResponse(response, 200, { bans });
      return;
    }

    if (pathname === '/api/admin/clans' && request.method === 'GET') {
      if (!adminUser(request, response)) return;
      const clans = database.prepare(`
        SELECT clans.*, users.username AS owner_username
        FROM clans
        JOIN users ON users.id = clans.owner_id
        WHERE clans.approval_status = 'pending'
        ORDER BY clans.created_at ASC
      `).all().map((clan) => ({
        id: clan.id,
        ...publicClanDetails(database, clan),
        approvalStatus: clan.approval_status
      }));
      writeResponse(response, 200, { clans });
      return;
    }

    if (pathname === '/api/admin/site-content' && request.method === 'GET') {
      if (!adminUser(request, response)) return;
      const content = getSiteContent();
      const fields = Object.entries(SITE_CONTENT).map(([key, field]) => ({
        key,
        label: field.label,
        value: content[key] ?? field.value
      }));
      writeResponse(response, 200, { fields });
      return;
    }

    const acceptsJsonBody = ['POST', 'PUT', 'DELETE'].includes(request.method);
    if (!acceptsJsonBody) {
      writeResponse(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST, PUT, DELETE' });
      return;
    }

    if (!requestHasSameOrigin(request)) {
      writeResponse(response, 403, { error: 'Request origin could not be verified. Reload the page and try again.' });
      return;
    }

    let data;
    try {
      data = request.method === 'DELETE' ? {} : await readJson(
        request,
        pathname === '/api/clans' || /^\/api\/clans\/[0-9a-f-]{36}$/i.test(pathname)
          ? MAX_CLAN_REQUEST_SIZE
          : MAX_REQUEST_SIZE
      );
    } catch (error) {
      writeResponse(response, error.status || 400, { error: error.message });
      return;
    }

    const ip = getClientIp(request, config.trustProxy);
    const now = Date.now();

    if (pathname === '/api/admin/bans' && request.method === 'POST') {
      const actor = adminUser(request, response);
      if (!actor) return;
      const username = typeof data.username === 'string' ? data.username.trim() : '';
      const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
      const permanent = data.permanent === true;
      if (!/^[A-Za-z0-9_]{3,24}$/.test(username)
          || reason.length < 3
          || reason.length > 500
          || (!permanent && (!Number.isInteger(data.durationDays)
            || data.durationDays < 1
            || data.durationDays > 36500))) {
        writeResponse(response, 400, { error: 'Enter a player username, a reason of 3–500 characters, and a valid custom duration in days or select permanent.' });
        return;
      }

      const target = database.prepare('SELECT id, username, role, device_serial_encrypted FROM users WHERE username = ? COLLATE NOCASE')
        .get(username);
      if (!target) {
        writeResponse(response, 404, { error: 'No registered player account has that username.' });
        return;
      }
      if (target.id === actor.id || target.role === 'owner'
          || (target.role === 'admin' && actor.role !== 'owner')) {
        writeResponse(response, 403, { error: 'You do not have permission to add a blacklist record for this account.' });
        return;
      }
      const activeBan = database.prepare(`
        SELECT 1 FROM player_bans
        WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
      `).get(target.id, now);
      if (activeBan) {
        writeResponse(response, 409, { error: 'This player already has an active blacklist record.' });
        return;
      }

      const durationDays = permanent ? null : data.durationDays;
      const expiresAt = permanent ? null : now + durationDays * 24 * 60 * 60 * 1000;
      const banId = crypto.randomUUID();
      database.prepare(`
        INSERT INTO player_bans (
          id, user_id, username, device_serial_encrypted, duration_days, reason,
          created_by, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        banId,
        target.id,
        target.username,
        target.device_serial_encrypted,
        durationDays,
        reason,
        actor.id,
        now,
        expiresAt
      );
      writeResponse(response, 201, { banId });
      return;
    }

    const revokeBanMatch = /^\/api\/admin\/bans\/([0-9a-f-]{36})\/revoke$/i.exec(pathname);
    if (revokeBanMatch && request.method === 'POST') {
      const actor = adminUser(request, response);
      if (!actor) return;
      const result = database.prepare(`
        UPDATE player_bans SET revoked_by = ?, revoked_at = ?
        WHERE id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
      `).run(actor.id, now, revokeBanMatch[1], now);
      if (result.changes === 0) {
        const exists = database.prepare('SELECT 1 FROM player_bans WHERE id = ?').get(revokeBanMatch[1]);
        writeResponse(response, exists ? 409 : 404, {
          error: exists ? 'This blacklist record is no longer active.' : 'Blacklist record not found.'
        });
        return;
      }
      writeResponse(response, 200, { revoked: true, banId: revokeBanMatch[1] });
      return;
    }

    const clanReviewMatch = /^\/api\/admin\/clans\/([0-9a-f-]{36})\/review$/i.exec(pathname);
    if (clanReviewMatch && request.method === 'POST') {
      const actor = adminUser(request, response);
      if (!actor) return;
      if (!['approve', 'reject'].includes(data.decision)) {
        writeResponse(response, 400, { error: 'Choose approve or reject for this clan.' });
        return;
      }
      const status = data.decision === 'approve' ? 'approved' : 'rejected';
      const result = database.prepare(`
        UPDATE clans
        SET approval_status = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ? AND approval_status = 'pending'
      `).run(status, actor.id, now, clanReviewMatch[1]);
      if (result.changes === 0) {
        const exists = database.prepare('SELECT 1 FROM clans WHERE id = ?').get(clanReviewMatch[1]);
        writeResponse(response, exists ? 409 : 404, {
          error: exists ? 'This clan is no longer waiting for review.' : 'Clan not found.'
        });
        return;
      }
      writeResponse(response, 200, { clanId: clanReviewMatch[1], approvalStatus: status });
      return;
    }

    if (pathname === '/api/admin/site-content') {
      const actor = adminUser(request, response);
      if (!actor) return;
      if (typeof data.key !== 'string'
          || !Object.hasOwn(SITE_CONTENT, data.key)
          || typeof data.value !== 'string'
          || !data.value.trim()
          || data.value.trim().length > 300) {
        writeResponse(response, 400, { error: 'Choose a site text field and enter between 1 and 300 characters.' });
        return;
      }

      const value = data.value.trim();
      database.prepare(`
        INSERT INTO site_content (content_key, content_value, updated_at, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(content_key) DO UPDATE SET
          content_value = excluded.content_value,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).run(data.key, value, now, actor.id);
      writeResponse(response, 200, { key: data.key, value });
      return;
    }

    if (pathname === '/api/admin/users/role') {
      const actor = adminUser(request, response);
      if (!actor) return;
      if (actor.role !== 'owner') {
        writeResponse(response, 403, { error: 'Only the owner can change administrator access.' });
        return;
      }
      if (typeof data.userId !== 'string'
          || !/^[0-9a-f-]{36}$/i.test(data.userId)
          || !['admin', 'member'].includes(data.role)) {
        writeResponse(response, 400, { error: 'Choose a valid user and admin or member access.' });
        return;
      }
      if (data.userId === actor.id) {
        writeResponse(response, 400, { error: 'You cannot change your own owner access.' });
        return;
      }

      const target = database.prepare('SELECT id, role FROM users WHERE id = ?').get(data.userId);
      if (!target) {
        writeResponse(response, 404, { error: 'That user account no longer exists.' });
        return;
      }
      if (target.role === 'owner') {
        writeResponse(response, 403, { error: 'Owner access cannot be changed here.' });
        return;
      }
      database.prepare('UPDATE users SET role = ? WHERE id = ?').run(data.role, target.id);
      writeResponse(response, 200, { userId: target.id, role: data.role });
      return;
    }

    const deleteUserMatch = /^\/api\/admin\/users\/([0-9a-f-]{36})$/i.exec(pathname);
    if (deleteUserMatch && request.method === 'DELETE') {
      const actor = adminUser(request, response);
      if (!actor) return;
      const targetId = deleteUserMatch[1];
      if (targetId === actor.id) {
        writeResponse(response, 400, { error: 'You cannot remove your own account.' });
        return;
      }
      const target = database.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
      if (!target) {
        writeResponse(response, 404, { error: 'That user account no longer exists.' });
        return;
      }
      if (target.role === 'owner' || (target.role === 'admin' && actor.role !== 'owner')) {
        writeResponse(response, 403, { error: 'You do not have permission to remove this account.' });
        return;
      }
      database.prepare('DELETE FROM users WHERE id = ?').run(targetId);
      writeResponse(response, 200, { removed: true, userId: targetId });
      return;
    }

    if (pathname === '/api/clans' && request.method === 'POST') {
      const owner = currentUser(request);
      if (!owner) {
        writeResponse(response, 401, { error: 'Sign in before creating a clan.' });
        return;
      }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const tag = typeof data.tag === 'string' ? data.tag.trim().toUpperCase() : '';
      if (name.length < 3 || name.length > 32 || !/^[A-Z0-9]{2,8}$/.test(tag)) {
        writeResponse(response, 400, { error: 'Use a clan name of 3–32 characters and a tag of 2–8 letters or numbers.' });
        return;
      }
      if (data.publicRosterConsent !== true) {
        writeResponse(response, 400, { error: 'Confirm that your username and player ID can appear on the public clan roster.' });
        return;
      }

      const ipKey = `clan-create:ip:${ip}`;
      const ownerKey = `clan-create:user:${owner.id}`;
      if (!allowRequest(ipKey, 5, 60 * 60 * 1000) || !allowRequest(ownerKey, 3, 24 * 60 * 60 * 1000)) {
        writeResponse(response, 429, { error: 'Too many clan registration attempts. Please try again later.' }, { 'Retry-After': '3600' });
        return;
      }
      if (database.prepare('SELECT 1 FROM clan_members WHERE user_id = ?').get(owner.id)) {
        writeResponse(response, 409, { error: 'You must leave your current clan before creating another one.' });
        return;
      }

      let logo;
      try {
        logo = parseClanLogo(data.logoDataUrl);
      } catch (error) {
        writeResponse(response, 400, { error: error.message });
        return;
      }

      const clanId = crypto.randomUUID();
      try {
        database.exec('BEGIN IMMEDIATE');
        database.prepare(`
          INSERT INTO clans (
            id, name, tag, logo_mime, logo_blob, owner_id, created_at, approval_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(clanId, name, tag, logo.mimeType, logo.logo, owner.id, now);
        database.prepare(`
          INSERT INTO clan_members (clan_id, user_id, role, public_roster_consent_at, joined_at)
          VALUES (?, ?, 'owner', ?, ?)
        `).run(clanId, owner.id, now, now);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          writeResponse(response, 409, { error: 'That clan tag is already in use, or you already belong to a clan.' });
          return;
        }
        console.error('Clan registration failed:', error.message);
        writeResponse(response, 500, { error: 'The clan could not be created. Please try again later.' });
        return;
      }

      const clan = database.prepare(`
        SELECT clans.*, users.username AS owner_username
        FROM clans JOIN users ON users.id = clans.owner_id WHERE clans.id = ?
      `).get(clanId);
      writeResponse(response, 201, { clan: publicClanDetails(database, clan, true) });
      return;
    }

    const clanInvitationMatch = /^\/api\/clans\/([0-9a-f-]{36})\/invitations$/i.exec(pathname);
    if (clanInvitationMatch && request.method === 'POST') {
      const owner = currentUser(request);
      if (!owner) {
        writeResponse(response, 401, { error: 'Sign in before inviting a player.' });
        return;
      }
      const clanId = clanInvitationMatch[1];
      const clan = database.prepare(`
        SELECT clans.id, clan_members.role
        FROM clans
        JOIN clan_members ON clan_members.clan_id = clans.id
        WHERE clans.id = ? AND clan_members.user_id = ?
      `).get(clanId, owner.id);
      if (!clan || clan.role !== 'owner') {
        writeResponse(response, 403, { error: 'Only the clan owner can invite players.' });
        return;
      }
      if (typeof data.username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(data.username)) {
        writeResponse(response, 400, { error: 'Enter the existing player’s username.' });
        return;
      }
      if (!allowRequest(`clan-invite:${owner.id}`, 20, 60 * 60 * 1000)) {
        writeResponse(response, 429, { error: 'Too many invitations. Try again later.' }, { 'Retry-After': '3600' });
        return;
      }
      const invitee = database.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
        .get(data.username.trim());
      if (!invitee) {
        writeResponse(response, 404, { error: 'No player account has that username.' });
        return;
      }
      if (invitee.id === owner.id) {
        writeResponse(response, 400, { error: 'You are already the owner of this clan.' });
        return;
      }
      if (database.prepare('SELECT 1 FROM clan_members WHERE user_id = ?').get(invitee.id)) {
        writeResponse(response, 409, { error: 'That player already belongs to a clan.' });
        return;
      }
      const existingInvitation = database.prepare(`
        SELECT 1 FROM clan_invitations
        WHERE clan_id = ? AND invitee_id = ? AND status = 'pending'
      `).get(clanId, invitee.id);
      if (existingInvitation) {
        writeResponse(response, 409, { error: 'That player already has a pending invitation.' });
        return;
      }

      const invitationId = crypto.randomUUID();
      try {
        database.prepare(`
          INSERT INTO clan_invitations (id, clan_id, inviter_id, invitee_id, status, created_at)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(invitationId, clanId, owner.id, invitee.id, now);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          writeResponse(response, 409, { error: 'That player already has a pending invitation.' });
          return;
        }
        throw error;
      }
      writeResponse(response, 201, { invitationId });
      return;
    }

    const invitationResponseMatch = /^\/api\/clan-invitations\/([0-9a-f-]{36})\/respond$/i.exec(pathname);
    if (invitationResponseMatch && request.method === 'POST') {
      const player = currentUser(request);
      if (!player) {
        writeResponse(response, 401, { error: 'Sign in to respond to a clan invitation.' });
        return;
      }
      if (!['accept', 'decline'].includes(data.decision)) {
        writeResponse(response, 400, { error: 'Choose accept or decline.' });
        return;
      }
      if (data.decision === 'accept' && data.publicRosterConsent !== true) {
        writeResponse(response, 400, { error: 'Confirm that your username and player ID can appear on the public clan roster.' });
        return;
      }
      const invitation = database.prepare(`
        SELECT clan_invitations.*, clans.name, clans.tag
        FROM clan_invitations JOIN clans ON clans.id = clan_invitations.clan_id
        WHERE clan_invitations.id = ? AND clan_invitations.invitee_id = ?
          AND clan_invitations.status = 'pending'
      `).get(invitationResponseMatch[1], player.id);
      if (!invitation) {
        writeResponse(response, 404, { error: 'That pending clan invitation was not found.' });
        return;
      }
      if (data.decision === 'decline') {
        database.prepare(`
          UPDATE clan_invitations SET status = 'declined', responded_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(now, invitation.id);
        writeResponse(response, 200, { decision: 'declined' });
        return;
      }
      if (database.prepare('SELECT 1 FROM clan_members WHERE user_id = ?').get(player.id)) {
        writeResponse(response, 409, { error: 'Leave your current clan before accepting another invitation.' });
        return;
      }

      try {
        database.exec('BEGIN IMMEDIATE');
        database.prepare(`
          INSERT INTO clan_members (clan_id, user_id, role, public_roster_consent_at, joined_at)
          VALUES (?, ?, 'member', ?, ?)
        `).run(invitation.clan_id, player.id, now, now);
        database.prepare(`
          UPDATE clan_invitations SET status = 'accepted', responded_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(now, invitation.id);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          writeResponse(response, 409, { error: 'You already belong to a clan.' });
          return;
        }
        throw error;
      }
      writeResponse(response, 200, { decision: 'accepted', clanName: invitation.name, clanTag: invitation.tag });
      return;
    }

    const clanUpdateMatch = /^\/api\/clans\/([0-9a-f-]{36})$/i.exec(pathname);
    if (clanUpdateMatch && request.method === 'PUT') {
      const owner = currentUser(request);
      if (!owner) {
        writeResponse(response, 401, { error: 'Sign in to edit your clan.' });
        return;
      }
      const existingClan = database.prepare(`
        SELECT clans.id, clans.logo_mime, clans.logo_blob
        FROM clans
        JOIN clan_members ON clan_members.clan_id = clans.id
        WHERE clans.id = ? AND clans.owner_id = ? AND clan_members.user_id = ?
          AND clan_members.role = 'owner'
      `).get(clanUpdateMatch[1], owner.id, owner.id);
      if (!existingClan) {
        writeResponse(response, 403, { error: 'Only the clan owner can edit this clan.' });
        return;
      }
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const tag = typeof data.tag === 'string' ? data.tag.trim().toUpperCase() : '';
      if (name.length < 3 || name.length > 32 || !/^[A-Z0-9]{2,8}$/.test(tag)) {
        writeResponse(response, 400, { error: 'Use a clan name of 3–32 characters and a tag of 2–8 letters or numbers.' });
        return;
      }
      let logo = { mimeType: existingClan.logo_mime, logo: existingClan.logo_blob };
      if (Object.hasOwn(data, 'logoDataUrl')) {
        try {
          logo = parseClanLogo(data.logoDataUrl);
        } catch (error) {
          writeResponse(response, 400, { error: error.message });
          return;
        }
      }
      try {
        database.prepare(`
          UPDATE clans
          SET name = ?, tag = ?, logo_mime = ?, logo_blob = ?,
            approval_status = 'pending', reviewed_by = NULL, reviewed_at = NULL
          WHERE id = ?
        `)
          .run(name, tag, logo.mimeType, logo.logo, existingClan.id);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          writeResponse(response, 409, { error: 'That clan tag is already in use.' });
          return;
        }
        throw error;
      }
      const updatedClan = database.prepare(`
        SELECT clans.*, users.username AS owner_username
        FROM clans JOIN users ON users.id = clans.owner_id WHERE clans.id = ?
      `).get(existingClan.id);
      writeResponse(response, 200, { clan: publicClanDetails(database, updatedClan) });
      return;
    }

    const clanDeleteMatch = /^\/api\/clans\/([0-9a-f-]{36})$/i.exec(pathname);
    if (clanDeleteMatch && request.method === 'DELETE') {
      const owner = currentUser(request);
      if (!owner) {
        writeResponse(response, 401, { error: 'Sign in to delete your clan.' });
        return;
      }
      const result = database.prepare(`
        DELETE FROM clans
        WHERE id = ? AND owner_id = ?
          AND EXISTS (
            SELECT 1 FROM clan_members
            WHERE clan_id = clans.id AND user_id = ? AND role = 'owner'
          )
      `).run(clanDeleteMatch[1], owner.id, owner.id);
      if (result.changes === 0) {
        writeResponse(response, 403, { error: 'Only the clan owner can delete this clan.' });
        return;
      }
      writeResponse(response, 200, { deleted: true });
      return;
    }

    const clanMemberDeleteMatch = /^\/api\/clans\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/i.exec(pathname);
    if (clanMemberDeleteMatch && request.method === 'DELETE') {
      const actor = currentUser(request);
      if (!actor) {
        writeResponse(response, 401, { error: 'Sign in to manage clan membership.' });
        return;
      }
      const [, clanId, targetUserId] = clanMemberDeleteMatch;
      const actorMembership = database.prepare('SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?')
        .get(clanId, actor.id);
      const targetMembership = database.prepare('SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?')
        .get(clanId, targetUserId);
      if (!actorMembership || !targetMembership) {
        writeResponse(response, 404, { error: 'Clan member not found.' });
        return;
      }
      if (targetMembership.role === 'owner') {
        writeResponse(response, 400, { error: 'The clan owner must delete the clan or transfer ownership before leaving.' });
        return;
      }
      if (actor.id !== targetUserId && actorMembership.role !== 'owner') {
        writeResponse(response, 403, { error: 'Only the clan owner can remove another player.' });
        return;
      }
      database.prepare('DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?').run(clanId, targetUserId);
      writeResponse(response, 200, { removed: true });
      return;
    }

    if (pathname === '/api/register') {
      if (!validateRegistration(data)) {
        writeResponse(response, 400, {
          error: 'Check the form. Use a valid email, WhatsApp number in international format, Player account type, and a password of at least 12 characters.'
        });
        return;
      }

      const email = data.email.trim().toLowerCase();
      const username = data.username.trim();
      const playerId = data.playerId.trim();
      const phone = data.whatsappPhone;
      const ipKey = `register:ip:${ip}`;
      const phoneKey = `register:phone:${sessionHash(phone)}`;
      if (!allowRequest(ipKey, 5, 60 * 60 * 1000) || !allowRequest(phoneKey, 3, 60 * 60 * 1000)) {
        writeResponse(response, 429, { error: 'Too many registration attempts. Please try again later.' }, { 'Retry-After': '3600' });
        return;
      }

      const existing = database.prepare(`
        SELECT 1 FROM users
        WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE
          OR player_id = ? COLLATE NOCASE OR whatsapp_phone = ?
      `).get(email, username, playerId, phone);
      if (existing) {
        writeResponse(response, 409, { error: 'An account already uses one or more of those details.' });
        return;
      }

      const userId = crypto.randomUUID();
      const passwordSalt = crypto.randomBytes(16);
      const passwordHash = await scrypt(data.password, passwordSalt, 32, PASSWORD_OPTIONS);

      try {
        database.exec('BEGIN IMMEDIATE');
        database.prepare(`
          INSERT INTO users (
            id, email, username, player_id, account_type, whatsapp_phone,
            whatsapp_phone_added_at, device_serial_encrypted, password_salt,
            password_hash, created_at
          ) VALUES (?, ?, ?, ?, 'Player', ?, ?, ?, ?, ?, ?)
        `).run(
          userId, email, username, playerId, phone, now,
          encryptValue(data.deviceSerial.trim(), config.encryptionKey),
          passwordSalt.toString('base64url'), passwordHash.toString('base64url'), now
        );
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          writeResponse(response, 409, { error: 'An account already uses one or more of those details.' });
          return;
        }
        console.error('Account registration failed:', error.message);
        writeResponse(response, 500, { error: 'Your registration could not be saved. Please try again later.' });
        return;
      }

      writeResponse(response, 201, {
        user: userDetails(database.prepare('SELECT * FROM users WHERE id = ?').get(userId))
      }, createUserSession(userId, request));
      return;
    }

    if (pathname === '/api/login') {
      if (!validEmail(data.email) || typeof data.password !== 'string' || data.password.length > 128) {
        writeResponse(response, 400, { error: 'Enter a valid email and password.' });
        return;
      }
      const email = data.email.trim().toLowerCase();
      const loginKey = `login:${ip}:${sessionHash(email)}`;
      if (!allowRequest(loginKey, 8, 15 * 60 * 1000)) {
        writeResponse(response, 429, { error: 'Too many sign-in attempts. Please try again later.' }, { 'Retry-After': '900' });
        return;
      }

      const user = database.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
      const salt = user ? Buffer.from(user.password_salt, 'base64url') : dummySalt;
      const expected = user ? Buffer.from(user.password_hash, 'base64url') : dummyHash;
      const actual = await scrypt(data.password, salt, 32, PASSWORD_OPTIONS);
      if (!user || !safeEqual(actual, expected)) {
        writeResponse(response, 401, { error: 'Email or password is incorrect.' });
        return;
      }

      writeResponse(response, 200, { user: userDetails(user) }, createUserSession(user.id, request));
      return;
    }

    if (pathname === '/api/logout') {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) {
        database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sessionHash(token));
      }
      writeResponse(response, 200, { signedOut: true }, {
        'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieOptions(request, config).includes('; Secure') ? '; Secure' : ''}`
      });
      return;
    }

    writeResponse(response, 404, { error: 'Not found.' });
  }

  const server = http.createServer((request, response) => {
    securityHeaders(response);
    response.on('error', (error) => console.error('Response stream failed:', error.message));

    let pathname;
    try {
      pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
      pathname = decodeURIComponent(pathname);
    } catch {
      writeResponse(response, 400, { error: 'Invalid request path.' });
      return;
    }

    if (pathname.startsWith('/api/')) {
      handleApi(request, response, pathname).catch((error) => {
        console.error('Account request failed:', error.message);
        if (!response.headersSent) writeResponse(response, 500, { error: 'The account request could not be completed.' });
        else response.destroy();
      });
      return;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      serveStatic(request, response, pathname);
      return;
    }

    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
  });

  return { server, database };
}

if (require.main === module) {
  try {
    const config = createConfig();
    const { server } = createApplication(config);
    const host = process.env.HOST || '0.0.0.0';
    const port = Number(process.env.PORT || 3000);
    server.listen(port, host, () => {
      console.log(`TFOC website listening on http://${host}:${port}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createApplication, createConfig, initializeDatabase };
