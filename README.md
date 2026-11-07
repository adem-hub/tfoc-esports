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
4. In the dashboard, the owner can promote or remove site-wide admin access from player accounts, create tournaments, and assign tournament-specific administrators. Admins can update public site text and manage player accounts, but cannot grant admin roles or remove the owner.

The site-content editor changes public text only; it does not change the website's design, layout, or video/logo assets. Use normal text: HTML and scripts are always displayed as text, never executed.

## Clan registration and rosters

- Any signed-in player can submit one clan at a time with a unique 2–8 character tag and a PNG or JPEG logo of any dimensions, up to 10 MB. New submissions are private until an admin approves them.
- The site owner can also add approved clans manually by assigning an eligible player as owner and confirming permission to publish that player’s username and player ID.
- Admins and the owner can review pending clan submissions from the admin dashboard and approve or reject them. Every approved clan, logo, owner, full roster, public player ID, role, and join date appears in the public list. Contact details and device serials are never public.
- Site admins can assign one existing member as the manager of each clan. The manager can edit clan details, invite players, remove members, and update roster player IDs or registered device serials. Clan-detail edits still require admin approval.
- Player ID and device serial changes made by an assigned clan manager update the player account directly. Serial values remain encrypted at rest and are never returned to the manager or published. A blank serial field leaves the current serial unchanged.
- Clan owners and assigned managers can invite existing players by username; invited players must accept and consent to public roster display before joining. Clan owners can delete their clan; members can leave.
- Clan owners and invited players explicitly consent before their username and player ID appear on the public roster. Phone numbers and encrypted device serials are never included in public clan data.
- Players can belong to one clan at a time. Members can leave; the owner must delete the clan to remove their own membership.

## Tournaments

- The site owner creates tournaments with a logo, name, organizers, clan capacity, and a competition system: league (round robin), single elimination, or groups followed by elimination. League capacity is limited to 16 clans; other formats support up to 32.
- When creating a tournament, the owner assigns an existing player as its tournament administrator. That role applies only to the selected tournament and does not grant site-wide admin access.
- Tournaments start as drafts and are hidden from the public. The assigned administrator must publish the tournament before clans can register.
- Owners of approved clans can register them while sign-up is open. The assigned tournament administrator can accept, decline, or remove registrations before the draw.
- Once all pending registrations are reviewed, the administrator creates a random draw or sets the manual draw order. The site generates fixtures, including group rounds and knockout progression.
- The tournament administrator can set match times and save scores. Public tournament pages show accepted clans, match schedules and results, and standings.
- Tournament posters, match-schedule posters, and standings posters can each be downloaded as PNG images from the public tournament page.

## Community events

- The owner and site-wide admins can publish public event stories with a title, written description, and PNG/JPEG picture.
- Event descriptions are plain text. Pictures may be square, landscape, or portrait, between 64 and 2400 pixels, up to 1 MB.
- Admins can edit an event's title and description while keeping its current picture, replace the picture, or delete the event.
- The homepage shows a horizontally auto-advancing carousel of recent event, published tournament, active blacklist, and clan updates. Cards use their event picture, tournament or clan logo, or a blacklist icon as a translucent background. Visitors can pause the carousel or move between cards manually.

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
