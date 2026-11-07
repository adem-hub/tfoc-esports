# TFOC Esports

## Run the site and account service

The site and account API run together on Node.js 24 or newer. Account creation stores the WhatsApp number as contact information; it does not send a message or require WhatsApp verification. Opening `index.html` directly or serving it from a static-only host will not create accounts.

1. Copy `.env.example` to `.env`.
2. Generate both cryptographic keys in PowerShell and paste the output into `.env`:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Use the first value for `TFOC_SESSION_SECRET` and the second for `TFOC_DATA_ENCRYPTION_KEY`. Keep these keys private and do not commit `.env`. Losing the encryption key makes saved device serial numbers unreadable.

3. Start the server:

   ```powershell
   npm start
   ```

   Open `http://127.0.0.1:3000`. To make it reachable on a network or host, set `HOST` as appropriate and deploy behind HTTPS. When using a trusted reverse proxy, set `TFOC_TRUST_PROXY=true` only if that proxy overwrites forwarded client-IP and protocol headers.

## Set up the first administrator

1. Create your owner account on the website using an email address you control and a new, unique password. Registration is open, but owner access is not available in public registration.
2. In an interactive PowerShell terminal, run the following command using that account's email:

   ```powershell
   npm run bootstrap-owner -- owner@example.com
   ```

   Enter the account password when prompted. Input is hidden. The command checks the password against the account, and only works if an owner has not already been set. It never writes the password to configuration or source files.
3. Sign out and sign back in to show the admin dashboard.
4. In the dashboard, the owner can promote or remove admin access from player accounts. Admins can update public site text and manage player accounts, but cannot grant admin roles or remove the owner.

The dashboard edits public text only; it does not change the website's design, layout, or video/logo assets. Use normal text: HTML and scripts are always displayed as text, never executed.

## Clan registration and rosters

- Any signed-in player can submit one clan at a time with a unique 2–8 character tag and a square PNG or JPEG logo (64–1024 pixels, up to 512 KB). New submissions are private until an admin approves them.
- Admins and the owner can review pending clan submissions from the admin dashboard and approve or reject them. Only approved clans appear in the official public list. Editing an approved clan sends it back for review.
- Clan owners can edit the clan, invite existing players by username, remove members, or delete the clan. Invited players must accept to join and may decline instead.
- Clan owners and invited players explicitly consent before their username and player ID appear on the public roster. Phone numbers and encrypted device serials are never included in public clan data.
- Players can belong to one clan at a time. Members can leave; the owner must delete the clan to remove their own membership.

## Public player blacklist

- Admins and the owner can add a public disciplinary record for a registered player with a custom duration in days or no expiry, plus a reason. Active records appear in the public blacklist; admins can revoke a record early.
- Blacklist records are informational only and do not restrict website visits, sign-in, or registration.
- The player's device serial is copied from its encrypted account value and remains encrypted in storage. It is returned only to the authenticated admin dashboard and is never published in the public blacklist.

## Account data and safeguards

- Creating an account requires a unique email, username, player ID, WhatsApp contact number in international format, device serial number, and a password of at least 12 characters. The only available account type is Player.
- The WhatsApp number is not verified. Passwords are stored as scrypt hashes; device serial numbers are encrypted with AES-256-GCM. The session cookie is HTTP-only and same-site.
- Admins can change public site text and remove player accounts. Only the owner can promote or demote admins; owner access can only be initially bootstrapped from the server terminal after confirming the owner's account password.
- `data/tfoc.sqlite` contains account data and must be included in protected backups. The encryption and session keys are secrets, not application data.
- Restrict access to production account data, use HTTPS, and publish an appropriate privacy notice before collecting real users' phone numbers or device serial numbers.

## Tests

```powershell
npm test
```
