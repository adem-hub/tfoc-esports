'use strict';

const crypto = require('node:crypto');
const PASSWORD_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function bootstrapOwner(database, email, password) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Provide the email address of the account you control.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Enter the account password (12–128 characters).');
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    const existingOwner = database.prepare("SELECT 1 FROM users WHERE role = 'owner'").get();
    if (existingOwner) {
      throw new Error('An owner is already configured. Use the owner dashboard to manage administrators.');
    }

    const account = database.prepare('SELECT id, password_salt, password_hash FROM users WHERE email = ? COLLATE NOCASE')
      .get(email.trim().toLowerCase());
    if (!account) {
      throw new Error('Create and sign in to your account on the website first, then run this command again.');
    }
    const passwordHash = crypto.scryptSync(
      password,
      Buffer.from(account.password_salt, 'base64url'),
      32,
      PASSWORD_OPTIONS
    );
    const expectedHash = Buffer.from(account.password_hash, 'base64url');
    if (passwordHash.length !== expectedHash.length || !crypto.timingSafeEqual(passwordHash, expectedHash)) {
      throw new Error('The account password is incorrect. Owner access was not changed.');
    }

    database.prepare("UPDATE users SET role = 'owner' WHERE id = ?").run(account.id);
    database.exec('COMMIT');
    return account.id;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { bootstrapOwner };
