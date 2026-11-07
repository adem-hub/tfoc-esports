'use strict';

const { bootstrapOwner } = require('./admin-tools');
const { createConfig, initializeDatabase } = require('./server');

function readPassword(prompt) {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('Run the bootstrap command in an interactive terminal so the password can be entered without echo.'));
  }

  return new Promise((resolve, reject) => {
    let password = '';
    const finish = (error) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          finish(new Error('Owner setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          password = password.slice(0, -1);
        } else if (character >= ' ' && character !== '\u007f') {
          password += character;
        }
      }
    };
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  const [email, ...extraArguments] = process.argv.slice(2);
  if (!email || extraArguments.length > 0) {
    throw new Error('Usage: npm run bootstrap-owner -- <account-email>');
  }

  const config = createConfig();
  const database = initializeDatabase(config.databasePath);
  try {
    const password = await readPassword('Account password (input hidden): ');
    bootstrapOwner(database, email, password);
    console.log('Owner access is enabled for your account. Sign in again to load the admin dashboard.');
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
