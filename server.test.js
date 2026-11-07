'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const { bootstrapOwner } = require('./admin-tools');
const { createApplication } = require('./server');

function testConfig(databasePath) {
  return {
    sessionSecret: 'test-only-session-secret-that-is-long-enough',
    encryptionKey: Buffer.alloc(32, 7),
    databasePath,
    trustProxy: false
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function testPngDataUrl(width = 64, height = width) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function startTestServer(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('creates an account immediately with a WhatsApp contact number and supports sign-in', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tfoc-account-test-'));
  const { server, database } = createApplication(testConfig(path.join(directory, 'accounts.sqlite')));

  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const origin = await startTestServer(server);
  const send = (route, body, headers = {}) => fetch(`${origin}${route}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  const registration = {
    username: 'test_player',
    email: 'player@example.test',
    playerId: 'GAME-PLAYER-123',
    accountType: 'Player',
    whatsappPhone: '+21612345678',
    deviceSerial: 'PRIVATE-DEVICE-SERIAL',
    password: 'a-strong-password-123'
  };

  const noOrigin = await send('/api/register', registration, { Origin: '' });
  assert.equal(noOrigin.status, 403);

  const created = await send('/api/register', registration);
  assert.equal(created.status, 201);
  const sessionCookie = created.headers.get('set-cookie').split(';', 1)[0];
  const createdBody = await created.json();
  assert.equal(createdBody.user.email, registration.email);
  assert.equal(createdBody.user.whatsappPhone, registration.whatsappPhone);
  assert.equal(Object.hasOwn(createdBody.user, 'whatsappVerified'), false);
  assert.equal(Object.hasOwn(createdBody.user, 'deviceSerial'), false);

  const profileResponse = await fetch(`${origin}/api/me`, {
    headers: { Cookie: sessionCookie }
  });
  const profile = await profileResponse.json();
  assert.equal(profile.authenticated, true);
  assert.equal(profile.user.username, registration.username);
  assert.equal(profile.user.whatsappPhone, registration.whatsappPhone);
  assert.equal(Object.hasOwn(profile.user, 'deviceSerial'), false);

  const storedSerial = database.prepare('SELECT device_serial_encrypted FROM users WHERE email = ?')
    .get(registration.email).device_serial_encrypted;
  assert.equal(storedSerial.includes(registration.deviceSerial), false);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending_registrations'").get(), undefined);

  const duplicate = await send('/api/register', registration);
  assert.equal(duplicate.status, 409);

  const verifyRoute = await send('/api/verify-whatsapp', { code: '123456' });
  assert.equal(verifyRoute.status, 404);

  const signedOut = await send('/api/logout', {}, { Cookie: sessionCookie });
  assert.equal(signedOut.status, 200);
  const signedIn = await send('/api/login', {
    email: registration.email,
    password: registration.password
  });
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).user.username, registration.username);
});

test('migrates existing verified accounts and removes pending verification data', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tfoc-account-migration-test-'));
  const databasePath = path.join(directory, 'accounts.sqlite');
  const previousDatabase = new DatabaseSync(databasePath);
  previousDatabase.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      player_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
      account_type TEXT NOT NULL CHECK (account_type = 'Player'),
      whatsapp_phone TEXT NOT NULL UNIQUE,
      whatsapp_verified_at INTEGER NOT NULL,
      device_serial_encrypted TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE pending_registrations (id TEXT PRIMARY KEY, otp_hash TEXT NOT NULL);
    INSERT INTO pending_registrations (id, otp_hash) VALUES ('old-pending', 'old-code-hash');
    CREATE TABLE clans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tag TEXT NOT NULL,
      logo_mime TEXT NOT NULL,
      logo_blob BLOB NOT NULL,
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO clans (id, name, tag, logo_mime, logo_blob, owner_id, created_at)
    VALUES ('legacy-clan', 'Legacy Clan', 'LEGACY', 'image/png', X'00', 'legacy-owner', 1);
  `);
  previousDatabase.close();

  const { server, database } = createApplication(testConfig(databasePath));
  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const userColumns = database.prepare('PRAGMA table_info(users)').all();
  assert.equal(userColumns.some((column) => column.name === 'whatsapp_verified_at'), false);
  assert.equal(userColumns.some((column) => column.name === 'whatsapp_phone_added_at'), true);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending_registrations'").get(), undefined);
  assert.equal(database.prepare('SELECT approval_status FROM clans WHERE id = ?').get('legacy-clan').approval_status, 'approved');
  assert.equal(database.prepare('SELECT reviewed_by FROM clans WHERE id = ?').get('legacy-clan').reviewed_by, null);
});

test('owner controls admin roles while admins can edit site content and manage players', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tfoc-admin-test-'));
  const { server, database } = createApplication(testConfig(path.join(directory, 'accounts.sqlite')));

  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const origin = await startTestServer(server);
  const send = (route, body, cookie, method = 'POST') => fetch(`${origin}${route}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {})
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
  });
  let nextPhone = 1;
  const register = async (username) => {
    const response = await send('/api/register', {
      username,
      email: `${username}@example.test`,
      playerId: `GAME-${username.toUpperCase()}`,
      accountType: 'Player',
      whatsappPhone: `+216${String(nextPhone++).padStart(8, '0')}`,
      deviceSerial: `PRIVATE-SERIAL-${username}`,
      password: 'a-strong-password-123'
    });
    assert.equal(response.status, 201);
    return {
      ...(await response.json()).user,
      cookie: response.headers.get('set-cookie').split(';', 1)[0]
    };
  };

  const owner = await register('tfoc_owner');
  const credentials = database.prepare('SELECT password_salt, password_hash FROM users WHERE id = ?').get(owner.id);
  const passwordMatches = crypto.scryptSync(
    'a-strong-password-123',
    Buffer.from(credentials.password_salt, 'base64url'),
    32,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
  ).toString('base64url') === credentials.password_hash;
  assert.equal(passwordMatches, true);
  await assert.rejects(bootstrapOwner(database, owner.email, 'wrong-password-123'), /password is incorrect/);
  await bootstrapOwner(database, owner.email, 'a-strong-password-123');
  assert.equal(database.prepare('SELECT role FROM users WHERE id = ?').get(owner.id).role, 'owner');
  await assert.rejects(bootstrapOwner(database, owner.email, 'a-strong-password-123'), /already configured/);

  const admin = await register('tfoc_admin');
  const secondAdmin = await register('tfoc_second_admin');
  const player = await register('tfoc_player');
  const ownerCookie = owner.cookie;

  const memberAdminList = await send('/api/admin/users', {}, player.cookie, 'GET');
  assert.equal(memberAdminList.status, 403);

  const promoteAdmin = await send('/api/admin/users/role', {
    userId: admin.id,
    role: 'admin'
  }, ownerCookie);
  assert.equal(promoteAdmin.status, 200);

  const promoteSecondAdmin = await send('/api/admin/users/role', {
    userId: secondAdmin.id,
    role: 'admin'
  }, ownerCookie);
  assert.equal(promoteSecondAdmin.status, 200);

  const ownerCannotRemoveOwnRole = await send('/api/admin/users/role', {
    userId: owner.id,
    role: 'member'
  }, ownerCookie);
  assert.equal(ownerCannotRemoveOwnRole.status, 400);

  const adminsCannotPromote = await send('/api/admin/users/role', {
    userId: player.id,
    role: 'admin'
  }, admin.cookie);
  assert.equal(adminsCannotPromote.status, 403);

  const adminsCannotRemoveAnotherAdmin = await send(`/api/admin/users/${secondAdmin.id}`, {}, admin.cookie, 'DELETE');
  assert.equal(adminsCannotRemoveAnotherAdmin.status, 403);

  const savedContent = await send('/api/admin/site-content', {
    key: 'hero.titleFirst',
    value: '<script>not executable</script>'
  }, admin.cookie);
  assert.equal(savedContent.status, 200);
  assert.deepEqual(await savedContent.json(), {
    key: 'hero.titleFirst',
    value: '<script>not executable</script>'
  });

  const publicContent = await fetch(`${origin}/api/site-content`);
  assert.equal((await publicContent.json()).content['hero.titleFirst'], '<script>not executable</script>');

  const invalidContentKey = await send('/api/admin/site-content', {
    key: 'homepage.rawHtml',
    value: '<img src=x onerror=alert(1)>'
  }, admin.cookie);
  assert.equal(invalidContentKey.status, 400);

  const unauthenticatedBanList = await send('/api/admin/bans', {}, undefined, 'GET');
  assert.equal(unauthenticatedBanList.status, 401);
  const createBan = await send('/api/admin/bans', {
    username: player.username,
    durationDays: 14,
    permanent: false,
    reason: 'Tournament conduct violation.'
  }, admin.cookie);
  assert.equal(createBan.status, 201);
  const publicBanList = await fetch(`${origin}/api/blacklist`);
  assert.equal(publicBanList.status, 200);
  const publicBans = await publicBanList.json();
  assert.equal(publicBans.bans.length, 1);
  assert.equal(publicBans.bans[0].username, player.username);
  assert.equal(publicBans.bans[0].durationDays, 14);
  assert.equal(publicBans.bans[0].reason, 'Tournament conduct violation.');
  assert.equal(Object.hasOwn(publicBans.bans[0], 'deviceSerial'), false);
  assert.equal(JSON.stringify(publicBans).includes(`PRIVATE-SERIAL-${player.username}`), false);
  const adminBanList = await send('/api/admin/bans', {}, admin.cookie, 'GET');
  const { bans } = await adminBanList.json();
  assert.equal(bans.length, 1);
  assert.equal(bans[0].deviceSerial, `PRIVATE-SERIAL-${player.username}`);
  assert.equal(bans[0].status, 'active');
  const storedBan = database.prepare('SELECT device_serial_encrypted FROM player_bans WHERE id = ?')
    .get(bans[0].id);
  assert.equal(storedBan.device_serial_encrypted.includes(`PRIVATE-SERIAL-${player.username}`), false);
  assert.equal((await send('/api/admin/bans', {
    username: player.username,
    durationDays: 7,
    permanent: false,
    reason: 'Duplicate record.'
  }, admin.cookie)).status, 409);

  const playerCanStillSignIn = await send('/api/login', {
    email: player.email,
    password: 'a-strong-password-123'
  });
  assert.equal(playerCanStillSignIn.status, 200);

  const permanentBan = await send('/api/admin/bans', {
    username: secondAdmin.username,
    permanent: true,
    reason: 'Repeated serious violation.'
  }, ownerCookie);
  assert.equal(permanentBan.status, 201);
  const allPublicBans = await (await fetch(`${origin}/api/blacklist`)).json();
  assert.equal(allPublicBans.bans.length, 2);
  assert.equal(allPublicBans.bans[0].durationDays, null);
  assert.equal(allPublicBans.bans[0].expiresAt, null);

  const revokeBan = await send(`/api/admin/bans/${bans[0].id}/revoke`, {}, admin.cookie);
  assert.equal(revokeBan.status, 200);
  const remainingPublicBans = await (await fetch(`${origin}/api/blacklist`)).json();
  assert.equal(remainingPublicBans.bans.length, 1);
  assert.equal(remainingPublicBans.bans[0].username, secondAdmin.username);

  const deletePlayer = await send(`/api/admin/users/${player.id}`, {}, admin.cookie, 'DELETE');
  assert.equal(deletePlayer.status, 200);
  assert.equal(database.prepare('SELECT id FROM users WHERE id = ?').get(player.id), undefined);

  const revokeAdmin = await send('/api/admin/users/role', {
    userId: admin.id,
    role: 'member'
  }, ownerCookie);
  assert.equal(revokeAdmin.status, 200);
});

test('clan registration, consent, invitations, roster privacy, and owner permissions', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tfoc-clan-test-'));
  const { server, database } = createApplication(testConfig(path.join(directory, 'accounts.sqlite')));

  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const origin = await startTestServer(server);
  const send = (route, body, cookie, method = 'POST') => fetch(`${origin}${route}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {})
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
  });
  let nextPhone = 1;
  const register = async (username) => {
    const response = await send('/api/register', {
      username,
      email: `${username}@example.test`,
      playerId: `GAME-${username.toUpperCase()}`,
      accountType: 'Player',
      whatsappPhone: `+216${String(nextPhone++).padStart(8, '0')}`,
      deviceSerial: `PRIVATE-SERIAL-${username}`,
      password: 'a-strong-password-123'
    });
    assert.equal(response.status, 201);
    return {
      ...(await response.json()).user,
      cookie: response.headers.get('set-cookie').split(';', 1)[0]
    };
  };

  const owner = await register('clan_owner');
  const member = await register('clan_member');
  const invitee = await register('clan_invitee');
  const outsider = await register('clan_outsider');
  await bootstrapOwner(database, owner.email, 'a-strong-password-123');
  const logoDataUrl = testPngDataUrl();

  assert.equal((await send('/api/admin/clans', {}, outsider.cookie, 'GET')).status, 403);

  const noConsent = await send('/api/clans', {
    name: 'Alpha Clan',
    tag: 'ALPHA',
    logoDataUrl,
    publicRosterConsent: false
  }, owner.cookie);
  assert.equal(noConsent.status, 400);

  const nonSquareLogo = await send('/api/clans', {
    name: 'Alpha Clan',
    tag: 'ALPHA',
    logoDataUrl: testPngDataUrl(64, 32),
    publicRosterConsent: true
  }, owner.cookie);
  assert.equal(nonSquareLogo.status, 400);

  const created = await send('/api/clans', {
    name: 'Alpha Clan',
    tag: 'ALPHA',
    logoDataUrl,
    publicRosterConsent: true
  }, owner.cookie);
  assert.equal(created.status, 201);
  const { clan } = await created.json();
  assert.equal(clan.memberCount, 1);
  assert.equal(clan.approvalStatus, 'pending');
  assert.equal(typeof clan.id, 'string');
  assert.equal(clan.roster[0].id, owner.id);

  const secondClan = await send('/api/clans', {
    name: 'Second Clan',
    tag: 'SECOND',
    logoDataUrl,
    publicRosterConsent: true
  }, owner.cookie);
  assert.equal(secondClan.status, 409);

  const publicListingResponse = await send('/api/clans', {}, undefined, 'GET');
  const publicListing = await publicListingResponse.json();
  assert.equal(publicListing.clans.length, 0);

  const pendingDetails = await send('/api/my-clans', {}, owner.cookie, 'GET');
  const pendingClanId = (await pendingDetails.json()).clan.id;
  const publicDetailsBeforeApproval = await send('/api/clans/ALPHA', {}, undefined, 'GET');
  assert.equal(publicDetailsBeforeApproval.status, 404);
  const privateLogoBeforeApproval = await fetch(`${origin}/api/clans/ALPHA/logo`);
  assert.equal(privateLogoBeforeApproval.status, 404);

  const pendingListResponse = await send('/api/admin/clans', {}, owner.cookie, 'GET');
  const pendingList = await pendingListResponse.json();
  assert.equal(pendingList.clans.length, 1);
  assert.equal(pendingList.clans[0].id, pendingClanId);
  assert.equal(Object.hasOwn(pendingList.clans[0].roster[0], 'id'), false);
  const approve = await send(`/api/admin/clans/${pendingClanId}/review`, { decision: 'approve' }, owner.cookie);
  assert.equal(approve.status, 200);
  const approvalStatus = await send('/api/my-clans', {}, owner.cookie, 'GET');
  assert.equal((await approvalStatus.json()).clan.approvalStatus, 'approved');
  const duplicateApproval = await send(`/api/admin/clans/${pendingClanId}/review`, { decision: 'approve' }, owner.cookie);
  assert.equal(duplicateApproval.status, 409);

  const approvedListingResponse = await send('/api/clans', {}, undefined, 'GET');
  const approvedListing = await approvedListingResponse.json();
  assert.equal(approvedListing.clans.length, 1);
  assert.equal(approvedListing.clans[0].roster[0].username, owner.username);
  assert.equal(Object.hasOwn(approvedListing.clans[0], 'id'), false);
  assert.equal(Object.hasOwn(approvedListing.clans[0].roster[0], 'id'), false);
  assert.equal(JSON.stringify(approvedListing).includes('PRIVATE-SERIAL'), false);

  const publicDetails = await send('/api/clans/ALPHA', {}, undefined, 'GET');
  assert.equal(publicDetails.status, 200);
  assert.equal(Object.hasOwn((await publicDetails.json()).clan.roster[0], 'id'), false);
  const logoResponse = await fetch(`${origin}/api/clans/ALPHA/logo`);
  assert.equal(logoResponse.status, 200);
  assert.equal(logoResponse.headers.get('content-type'), 'image/png');

  const ownerDetailsResponse = await send('/api/my-clans', {}, owner.cookie, 'GET');
  const ownerDetails = await ownerDetailsResponse.json();
  const clanId = ownerDetails.clan.id;
  assert.equal(ownerDetails.clan.roster[0].id, owner.id);
  assert.equal(JSON.stringify(ownerDetails).includes('PRIVATE-SERIAL'), false);

  const nonOwnerInvite = await send(`/api/clans/${clanId}/invitations`, {
    username: invitee.username
  }, member.cookie);
  assert.equal(nonOwnerInvite.status, 403);

  const inviteMember = await send(`/api/clans/${clanId}/invitations`, {
    username: member.username
  }, owner.cookie);
  assert.equal(inviteMember.status, 201);
  const memberInvitationId = (await inviteMember.json()).invitationId;
  const memberNoConsent = await send(`/api/clan-invitations/${memberInvitationId}/respond`, {
    decision: 'accept',
    publicRosterConsent: false
  }, member.cookie);
  assert.equal(memberNoConsent.status, 400);
  const acceptMember = await send(`/api/clan-invitations/${memberInvitationId}/respond`, {
    decision: 'accept',
    publicRosterConsent: true
  }, member.cookie);
  assert.equal(acceptMember.status, 200);

  const publicAfterJoin = await send('/api/clans/ALPHA', {}, undefined, 'GET');
  const publicClan = (await publicAfterJoin.json()).clan;
  assert.equal(publicClan.memberCount, 2);
  assert.equal(publicClan.roster.some((rosterMember) => Object.hasOwn(rosterMember, 'id')), false);
  assert.equal(JSON.stringify(publicClan).includes('PRIVATE-SERIAL'), false);

  const inviteeInvitation = await send(`/api/clans/${clanId}/invitations`, {
    username: invitee.username
  }, owner.cookie);
  assert.equal(inviteeInvitation.status, 201);
  const inviteeInvitationId = (await inviteeInvitation.json()).invitationId;
  const decline = await send(`/api/clan-invitations/${inviteeInvitationId}/respond`, {
    decision: 'decline',
    publicRosterConsent: false
  }, invitee.cookie);
  assert.equal(decline.status, 200);

  const memberCannotEdit = await send(`/api/clans/${clanId}`, {
    name: 'Changed Clan',
    tag: 'CHANGED'
  }, member.cookie, 'PUT');
  assert.equal(memberCannotEdit.status, 403);
  const memberCannotDelete = await send(`/api/clans/${clanId}`, {}, member.cookie, 'DELETE');
  assert.equal(memberCannotDelete.status, 403);

  const removeMember = await send(`/api/clans/${clanId}/members/${member.id}`, {}, owner.cookie, 'DELETE');
  assert.equal(removeMember.status, 200);
  const memberCanCreateClan = await send('/api/clans', {
    name: 'New Clan',
    tag: 'NEW',
    logoDataUrl,
    publicRosterConsent: true
  }, member.cookie);
  assert.equal(memberCanCreateClan.status, 201);

  const updateClan = await send(`/api/clans/${clanId}`, {
    name: 'Alpha Updated',
    tag: 'ALPHA2'
  }, owner.cookie, 'PUT');
  assert.equal(updateClan.status, 200);
  assert.equal((await send('/api/clans/ALPHA2', {}, undefined, 'GET')).status, 404);
  const resubmitted = await send('/api/my-clans', {}, owner.cookie, 'GET');
  assert.equal((await resubmitted.json()).clan.approvalStatus, 'pending');
  const reapprove = await send(`/api/admin/clans/${clanId}/review`, { decision: 'approve' }, owner.cookie);
  assert.equal(reapprove.status, 200);
  assert.equal((await send('/api/clans/ALPHA2', {}, undefined, 'GET')).status, 200);
  assert.equal((await send('/api/clans/ALPHA', {}, undefined, 'GET')).status, 404);

  const rejectedClan = await send('/api/clans', {
    name: 'Rejected Clan',
    tag: 'REJECT',
    logoDataUrl,
    publicRosterConsent: true
  }, invitee.cookie);
  assert.equal(rejectedClan.status, 201);
  const rejectedClanId = (await rejectedClan.json()).clan.id;
  const reject = await send(`/api/admin/clans/${rejectedClanId}/review`, { decision: 'reject' }, owner.cookie);
  assert.equal(reject.status, 200);
  assert.equal((await send('/api/clans/REJECT', {}, undefined, 'GET')).status, 404);
  assert.equal((await send('/api/my-clans', {}, invitee.cookie, 'GET')).status, 200);
  const rejectedDetails = await send('/api/my-clans', {}, invitee.cookie, 'GET');
  assert.equal((await rejectedDetails.json()).clan.approvalStatus, 'rejected');
  const resubmission = await send(`/api/clans/${rejectedClanId}`, {
    name: 'Reviewed Clan',
    tag: 'REVIEW'
  }, invitee.cookie, 'PUT');
  assert.equal(resubmission.status, 200);
  const resubmissionDetails = await send('/api/my-clans', {}, invitee.cookie, 'GET');
  assert.equal((await resubmissionDetails.json()).clan.approvalStatus, 'pending');
  assert.equal((await send(`/api/admin/clans/${rejectedClanId}/review`, { decision: 'approve' }, owner.cookie)).status, 200);

  const deleteClan = await send(`/api/clans/${clanId}`, {}, owner.cookie, 'DELETE');
  assert.equal(deleteClan.status, 200);
  assert.equal((await send('/api/clans/ALPHA2', {}, undefined, 'GET')).status, 404);
  assert.equal(database.prepare('SELECT clan_id FROM clan_members WHERE clan_id = ?').get(clanId), undefined);
});

test('serves byte ranges for the video cover', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tfoc-static-test-'));
  const { server, database } = createApplication(testConfig(path.join(directory, 'accounts.sqlite')));

  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const origin = await startTestServer(server);
  const response = await fetch(`${origin}/eFootball%E2%84%A2%202027%20Official%20Trailer%20%20Season%20Update%20v6.0.0.mp4`, {
    headers: { Range: 'bytes=0-31' }
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range').startsWith('bytes 0-31/'), true);
  assert.equal((await response.arrayBuffer()).byteLength, 32);
});
