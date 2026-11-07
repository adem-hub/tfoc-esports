const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#primary-navigation');

if (menuToggle && navigation) {
  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
    navigation.classList.toggle('is-open', !isOpen);
  });

  navigation.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation');
      navigation.classList.remove('is-open');
    }
  });
}

const heroVideo = document.querySelector('.hero-video');

if (heroVideo && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  heroVideo.pause();
}

const accountMessage = document.querySelector('#account-message');
const accountTabs = document.querySelector('.account-tabs');
const accountForms = document.querySelectorAll('[data-account-panel]');
const accountProfile = document.querySelector('#account-profile');
const adminDashboard = document.querySelector('#admin-dashboard');
const adminEntry = document.querySelector('#open-admin-dashboard');
const adminMessage = document.querySelector('#admin-message');
const siteContentForm = document.querySelector('#site-content-form');
const siteContentKey = document.querySelector('#site-content-key');
const siteContentValue = document.querySelector('#site-content-value');
const adminUserList = document.querySelector('#admin-user-list');
const adminClanList = document.querySelector('#admin-clan-list');
const adminBanList = document.querySelector('#admin-ban-list');
const createBanForm = document.querySelector('#create-ban-form');
const banDurationDays = document.querySelector('#ban-duration-days');
const permanentBan = document.querySelector('#ban-permanent');
const clanManager = document.querySelector('#clan-manager');
const createClanForm = document.querySelector('#create-clan-form');
const myClanPanel = document.querySelector('#my-clan-panel');
const incomingClanInvitations = document.querySelector('#incoming-clan-invitations');
const clanInvitations = document.querySelector('#clan-invitations');
const publicClanList = document.querySelector('#public-clan-list');
const publicBlacklist = document.querySelector('#public-blacklist');
let currentUser = null;
let editableSiteFields = [];

function showMessage(message, kind = 'error') {
  accountMessage.textContent = message;
  accountMessage.dataset.kind = kind;
  accountMessage.hidden = false;
}

function clearMessage() {
  accountMessage.textContent = '';
  accountMessage.hidden = true;
  delete accountMessage.dataset.kind;
}

function showAdminMessage(message, kind = 'error') {
  adminMessage.textContent = message;
  adminMessage.dataset.kind = kind;
  adminMessage.hidden = false;
}

function clearAdminMessage() {
  adminMessage.textContent = '';
  adminMessage.hidden = true;
  delete adminMessage.dataset.kind;
}

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'The request could not be completed.');
  }

  return result;
}

function showPanel(panel) {
  accountTabs.hidden = false;
  accountProfile.hidden = true;
  clanManager.hidden = true;
  adminEntry.hidden = true;
  adminDashboard.hidden = true;

  for (const form of accountForms) {
    const isActive = form.dataset.accountPanel === panel;
    form.hidden = !isActive;
    document.querySelector(`[data-account-tab="${form.dataset.accountPanel}"]`)
      .classList.toggle('is-active', isActive);
    document.querySelector(`[data-account-tab="${form.dataset.accountPanel}"]`)
      .setAttribute('aria-selected', String(isActive));
  }
}

function showProfile(user) {
  currentUser = user;
  accountTabs.hidden = true;
  for (const form of accountForms) form.hidden = true;
  document.querySelector('#profile-username').textContent = user.username;
  document.querySelector('#profile-email').textContent = user.email;
  document.querySelector('#profile-player-id').textContent = user.playerId;
  document.querySelector('#profile-whatsapp').textContent = user.whatsappPhone;
  adminEntry.hidden = user.role !== 'admin' && user.role !== 'owner';
  accountProfile.hidden = false;
  clanManager.hidden = false;
  showMessage(`Your account is ready. Access: ${user.role}.`, 'success');
  loadMyClan();
}

function renderSiteContent(content) {
  for (const [key, value] of Object.entries(content)) {
    const element = document.querySelector(`[data-site-content="${CSS.escape(key)}"]`);
    if (element && typeof value === 'string') element.textContent = value;
  }
}

function renderEditableFields(fields) {
  editableSiteFields = fields;
  siteContentKey.replaceChildren();

  for (const field of fields) {
    const option = document.createElement('option');
    option.value = field.key;
    option.textContent = field.label;
    siteContentKey.append(option);
  }

  updateContentEditor();
}

function updateContentEditor() {
  const field = editableSiteFields.find((item) => item.key === siteContentKey.value);
  siteContentValue.value = field ? field.value : '';
}

function createRosterTable(members, options = {}) {
  const table = document.createElement('table');
  table.className = 'clan-roster-table';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const heading of ['Player', 'Player ID', ...(options.canManage ? [''] : [])]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = heading;
    headerRow.append(cell);
  }
  head.append(headerRow);
  table.append(head);

  const body = document.createElement('tbody');
  for (const member of members) {
    const row = document.createElement('tr');
    const player = document.createElement('td');
    player.textContent = member.username;
    const playerId = document.createElement('td');
    playerId.textContent = member.playerId;
    row.append(player, playerId);
    if (options.canManage && member.role !== 'owner') {
      const action = document.createElement('td');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'admin-action-button admin-action-danger';
      remove.textContent = options.currentUserId === member.id ? 'Leave clan' : 'Remove';
      remove.addEventListener('click', () => removeClanMember(options.clanId, member.id, member.username));
      action.append(remove);
      row.append(action);
    } else if (options.canManage) {
      row.append(document.createElement('td'));
    }
    body.append(row);
  }
  table.append(body);
  return table;
}

function renderPublicClans(clans) {
  publicClanList.replaceChildren();
  if (!clans.length) {
    const empty = document.createElement('p');
    empty.className = 'clan-list-status';
    empty.textContent = 'No clans have been approved for the official list yet.';
    publicClanList.append(empty);
    return;
  }

  for (const clan of clans) {
    const card = document.createElement('article');
    card.className = 'public-clan-card';
    const heading = document.createElement('div');
    heading.className = 'public-clan-heading';
    const logo = document.createElement('img');
    logo.className = 'public-clan-logo';
    logo.src = clan.logoUrl;
    logo.alt = `${clan.name} logo`;
    logo.width = 88;
    logo.height = 88;
    const identity = document.createElement('div');
    identity.className = 'public-clan-identity';
    const tag = document.createElement('span');
    tag.className = 'clan-tag';
    tag.textContent = `[${clan.tag}]`;
    const name = document.createElement('h3');
    name.textContent = clan.name;
    const owner = document.createElement('p');
    owner.textContent = `Captain: ${clan.ownerUsername}`;
    identity.append(tag, name, owner);
    heading.append(logo, identity);

    const rosterHeading = document.createElement('div');
    rosterHeading.className = 'roster-heading';
    const rosterTitle = document.createElement('h4');
    rosterTitle.textContent = 'PUBLIC ROSTER';
    const count = document.createElement('span');
    count.textContent = `${clan.memberCount} ${clan.memberCount === 1 ? 'PLAYER' : 'PLAYERS'}`;
    rosterHeading.append(rosterTitle, count);
    const privacy = document.createElement('p');
    privacy.className = 'roster-privacy';
    privacy.textContent = 'Username and player ID only. Phone serial numbers are private.';
    const table = createRosterTable(clan.roster);
    card.append(heading, rosterHeading, privacy, table);
    publicClanList.append(card);
  }
}

async function loadPublicClans() {
  const result = await requestApi('/api/clans');
  renderPublicClans(result.clans);
}

function formatBlacklistDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function renderPublicBlacklist(bans) {
  publicBlacklist.replaceChildren();
  if (!bans.length) {
    const empty = document.createElement('p');
    empty.className = 'blacklist-list-status';
    empty.textContent = 'There are no current blacklist records.';
    publicBlacklist.append(empty);
    return;
  }

  for (const ban of bans) {
    const card = document.createElement('article');
    card.className = 'public-ban-card';
    const heading = document.createElement('div');
    heading.className = 'public-ban-heading';
    const name = document.createElement('h3');
    name.textContent = ban.username;
    const period = document.createElement('span');
    period.className = 'ban-period';
    period.textContent = ban.durationDays === null
      ? 'Permanent'
      : `${ban.durationDays} ${ban.durationDays === 1 ? 'day' : 'days'}`;
    heading.append(name, period);
    const reasonLabel = document.createElement('strong');
    reasonLabel.className = 'ban-reason-label';
    reasonLabel.textContent = 'Reason';
    const reason = document.createElement('p');
    reason.className = 'ban-reason';
    reason.textContent = ban.reason;
    const dates = document.createElement('p');
    dates.className = 'ban-dates';
    dates.textContent = ban.expiresAt
      ? `Recorded ${formatBlacklistDate(ban.createdAt)} · Expires ${formatBlacklistDate(ban.expiresAt)}`
      : `Recorded ${formatBlacklistDate(ban.createdAt)} · No expiry`;
    card.append(heading, reasonLabel, reason, dates);
    publicBlacklist.append(card);
  }
}

async function loadPublicBlacklist() {
  const result = await requestApi('/api/blacklist');
  renderPublicBlacklist(result.bans);
}

function createInvitationCard(invitation) {
  const card = document.createElement('article');
  card.className = 'incoming-invitation';
  const title = document.createElement('h5');
  title.textContent = `${invitation.clan.name} [${invitation.clan.tag}]`;
  const inviter = document.createElement('p');
  inviter.textContent = `${invitation.inviterUsername} invited you to join.`;
  const consentLabel = document.createElement('label');
  consentLabel.className = 'clan-consent';
  const consent = document.createElement('input');
  consent.type = 'checkbox';
  const consentText = document.createElement('span');
  consentText.textContent = 'I agree my username and player ID will be on the public roster. My phone serial will stay private.';
  consentLabel.append(consent, consentText);
  const actions = document.createElement('div');
  actions.className = 'invitation-actions';
  const accept = document.createElement('button');
  accept.className = 'button button-primary';
  accept.type = 'button';
  accept.textContent = 'Accept and join';
  accept.addEventListener('click', () => respondToClanInvitation(invitation.id, 'accept', consent.checked));
  const decline = document.createElement('button');
  decline.className = 'button button-quiet';
  decline.type = 'button';
  decline.textContent = 'Decline';
  decline.addEventListener('click', () => respondToClanInvitation(invitation.id, 'decline', false));
  actions.append(accept, decline);
  card.append(title, inviter, consentLabel, actions);
  return card;
}

function appendClansFormField(form, caption, name, value, options = {}) {
  const label = document.createElement('label');
  label.className = 'form-field';
  const title = document.createElement('span');
  title.textContent = caption;
  const input = document.createElement('input');
  input.name = name;
  input.type = options.type || 'text';
  input.value = value || '';
  input.required = options.required !== false;
  if (options.minLength) input.minLength = options.minLength;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.pattern) input.pattern = options.pattern;
  label.append(title, input);
  form.append(label);
  return input;
}

function renderCurrentClan(clan, sentInvitations) {
  createClanForm.hidden = true;
  myClanPanel.hidden = false;
  myClanPanel.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'my-clan-heading';
  const logo = document.createElement('img');
  logo.className = 'my-clan-logo';
  logo.src = clan.logoUrl;
  logo.alt = `${clan.name} logo`;
  logo.width = 84;
  logo.height = 84;
  const identity = document.createElement('div');
  const tag = document.createElement('span');
  tag.className = 'clan-tag';
  tag.textContent = `[${clan.tag}]`;
  const name = document.createElement('h4');
  name.textContent = clan.name;
  const role = document.createElement('p');
  role.textContent = clan.memberRole === 'owner' ? 'Clan owner' : 'Clan member';
  identity.append(tag, name, role);
  heading.append(logo, identity);
  const approvalStatus = document.createElement('p');
  approvalStatus.className = `clan-approval-status clan-approval-${clan.approvalStatus}`;
  if (clan.approvalStatus === 'approved') {
    approvalStatus.textContent = 'Official clan · approved';
  } else if (clan.approvalStatus === 'rejected') {
    approvalStatus.textContent = 'Not approved. Edit the clan details to submit it for review again.';
  } else {
    approvalStatus.textContent = 'Awaiting admin approval. It will appear in the official clans list after approval.';
  }

  const rosterHeading = document.createElement('div');
  rosterHeading.className = 'roster-heading';
  const rosterTitle = document.createElement('h4');
  rosterTitle.textContent = 'YOUR GENERATED ROSTER';
  const count = document.createElement('span');
  count.textContent = `${clan.memberCount} ${clan.memberCount === 1 ? 'PLAYER' : 'PLAYERS'}`;
  rosterHeading.append(rosterTitle, count);
  const privacy = document.createElement('p');
  privacy.className = 'roster-privacy';
  privacy.textContent = 'This roster is public and includes usernames and player IDs only. Device serial numbers are never shared.';
  myClanPanel.append(heading, approvalStatus, rosterHeading, privacy, createRosterTable(clan.roster, {
    canManage: true,
    clanId: clan.id,
    currentUserId: currentUser.id
  }));

  if (clan.memberRole !== 'owner') return;

  const editForm = document.createElement('form');
  editForm.className = 'clan-form clan-edit-form';
  const editTitle = document.createElement('h5');
  editTitle.textContent = 'Edit clan';
  editForm.append(editTitle);
  appendClansFormField(editForm, 'Clan name', 'name', clan.name, { minLength: 3, maxLength: 32 });
  appendClansFormField(editForm, 'Clan tag', 'tag', clan.tag, {
    minLength: 2,
    maxLength: 8,
    pattern: '[A-Za-z0-9]{2,8}'
  });
  const logoLabel = document.createElement('label');
  logoLabel.className = 'form-field';
  const logoCaption = document.createElement('span');
  logoCaption.textContent = 'Replace logo (optional)';
  const logoInput = document.createElement('input');
  logoInput.type = 'file';
  logoInput.name = 'logo';
  logoInput.accept = 'image/png,image/jpeg';
  logoLabel.append(logoCaption, logoInput);
  editForm.append(logoLabel);
  const saveButton = document.createElement('button');
  saveButton.className = 'button button-primary admin-submit';
  saveButton.type = 'submit';
  saveButton.textContent = 'Save clan changes';
  editForm.append(saveButton);
  editForm.addEventListener('submit', (event) => updateClan(event, clan.id));

  const inviteForm = document.createElement('form');
  inviteForm.className = 'clan-form clan-invite-form';
  const inviteTitle = document.createElement('h5');
  inviteTitle.textContent = 'Invite an existing player';
  const inviteNote = document.createElement('p');
  inviteNote.textContent = 'Enter their exact TFOC username. They must accept the invitation and public roster disclosure before they join.';
  inviteForm.append(inviteTitle, inviteNote);
  appendClansFormField(inviteForm, 'Player username', 'username', '', {
    minLength: 3,
    maxLength: 24,
    pattern: '[A-Za-z0-9_]{3,24}'
  });
  const inviteButton = document.createElement('button');
  inviteButton.className = 'button button-primary admin-submit';
  inviteButton.type = 'submit';
  inviteButton.textContent = 'Send invitation';
  inviteForm.append(inviteButton);
  inviteForm.addEventListener('submit', (event) => inviteClanPlayer(event, clan.id));

  const sentHeading = document.createElement('h5');
  sentHeading.className = 'pending-clan-heading';
  sentHeading.textContent = 'Pending invitations';
  const pendingList = document.createElement('ul');
  pendingList.className = 'pending-clan-list';
  if (sentInvitations.length) {
    for (const invitation of sentInvitations) {
      const item = document.createElement('li');
      item.textContent = `${invitation.username} · ${invitation.playerId}`;
      pendingList.append(item);
    }
  } else {
    const empty = document.createElement('li');
    empty.textContent = 'No pending invitations.';
    pendingList.append(empty);
  }

  const deleteButton = document.createElement('button');
  deleteButton.className = 'button button-quiet clan-delete-button';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete clan';
  deleteButton.addEventListener('click', () => deleteCurrentClan(clan.id, clan.name));

  myClanPanel.append(editForm, inviteForm, sentHeading, pendingList, deleteButton);
}

async function loadMyClan() {
  if (!currentUser) return;
  clanManager.hidden = false;
  myClanPanel.hidden = true;
  createClanForm.hidden = true;
  incomingClanInvitations.replaceChildren();
  clanInvitations.hidden = true;

  try {
    const result = await requestApi('/api/my-clans');
    if (result.invitations.length) {
      clanInvitations.hidden = false;
      for (const invitation of result.invitations) {
        incomingClanInvitations.append(createInvitationCard(invitation));
      }
    }

    if (result.clan) {
      renderCurrentClan(result.clan, result.sentInvitations);
    } else {
      myClanPanel.hidden = true;
      createClanForm.hidden = false;
    }
  } catch (error) {
    showMessage(error.message);
  }
}

async function readClanLogo(file) {
  if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Choose a PNG or JPEG clan logo.');
  }
  if (file.size > 512 * 1024) throw new Error('The clan logo must be under 512 KB.');

  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width !== bitmap.height || bitmap.width < 64 || bitmap.width > 1024) {
      throw new Error('Use a square logo between 64 × 64 and 1024 × 1024 pixels.');
    }
  } finally {
    bitmap.close();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('The logo file could not be read.')));
    reader.readAsDataURL(file);
  });
}

async function respondToClanInvitation(invitationId, decision, publicRosterConsent) {
  if (decision === 'accept' && !publicRosterConsent) {
    showMessage('Agree to public roster display before accepting this invitation.');
    return;
  }
  clearMessage();
  try {
    const result = await requestApi(`/api/clan-invitations/${encodeURIComponent(invitationId)}/respond`, {
      method: 'POST',
      body: JSON.stringify({ decision, publicRosterConsent })
    });
    showMessage(decision === 'accept' ? `You joined ${result.clanName} [${result.clanTag}].` : 'Clan invitation declined.', 'success');
    await Promise.all([loadMyClan(), loadPublicClans()]);
  } catch (error) {
    showMessage(error.message);
  }
}

async function updateClan(event, clanId) {
  event.preventDefault();
  const form = event.currentTarget;
  setFormBusy(form, true);
  clearMessage();
  try {
    const body = formValues(form);
    const logo = form.elements.namedItem('logo').files[0];
    delete body.logo;
    if (logo) body.logoDataUrl = await readClanLogo(logo);
    await requestApi(`/api/clans/${encodeURIComponent(clanId)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    showMessage('Clan details saved and submitted for admin approval.', 'success');
    await Promise.all([loadMyClan(), loadPublicClans()]);
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
}

async function inviteClanPlayer(event, clanId) {
  event.preventDefault();
  const form = event.currentTarget;
  setFormBusy(form, true);
  clearMessage();
  try {
    const result = await requestApi(`/api/clans/${encodeURIComponent(clanId)}/invitations`, {
      method: 'POST',
      body: JSON.stringify(formValues(form))
    });
    showMessage('Clan invitation sent.', 'success');
    form.reset();
    await loadMyClan();
    myClanPanel.querySelector('.clan-invite-form input[name="username"]')?.focus();
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
}

async function removeClanMember(clanId, memberId, username) {
  const isLeaving = memberId === currentUser.id;
  if (!window.confirm(isLeaving ? 'Leave this clan? Your name and player ID will be removed from its roster.' : `Remove ${username} from this clan?`)) return;
  clearMessage();
  try {
    await requestApi(`/api/clans/${encodeURIComponent(clanId)}/members/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
      body: '{}'
    });
    showMessage(isLeaving ? 'You left the clan.' : 'Player removed from the clan.', 'success');
    await Promise.all([loadMyClan(), loadPublicClans()]);
  } catch (error) {
    showMessage(error.message);
  }
}

async function createClan(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setFormBusy(form, true);
  clearMessage();
  try {
    const body = formValues(form);
    body.publicRosterConsent = form.elements.namedItem('publicRosterConsent').checked;
    body.logoDataUrl = await readClanLogo(form.elements.namedItem('logo').files[0]);
    delete body.logo;
    const result = await requestApi('/api/clans', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    form.reset();
    showMessage(`Clan ${result.clan.name} [${result.clan.tag}] was submitted for admin approval.`, 'success');
    await Promise.all([loadMyClan(), loadPublicClans()]);
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
}

async function deleteCurrentClan(clanId, clanName) {
  if (!window.confirm(`Permanently delete ${clanName} and remove its roster and pending invitations?`)) return;
  clearMessage();
  try {
    await requestApi(`/api/clans/${encodeURIComponent(clanId)}`, {
      method: 'DELETE',
      body: '{}'
    });
    showMessage('Clan deleted.', 'success');
    await Promise.all([loadMyClan(), loadPublicClans()]);
  } catch (error) {
    showMessage(error.message);
  }
}

function addAdminUser(user, actor) {
  const card = document.createElement('article');
  card.className = 'admin-user-card';

  const identity = document.createElement('div');
  identity.className = 'admin-user-identity';
  const username = document.createElement('strong');
  username.textContent = user.username;
  const email = document.createElement('span');
  email.textContent = user.email;
  const details = document.createElement('small');
  details.textContent = `Player ID ${user.playerId} · WhatsApp ${user.whatsappPhone}`;
  identity.append(username, email, details);

  const actions = document.createElement('div');
  actions.className = 'admin-user-actions';
  const role = document.createElement('span');
  role.className = `admin-role admin-role-${user.role}`;
  role.textContent = user.role;
  actions.append(role);

  if (actor.role === 'owner' && user.id !== actor.id && user.role !== 'owner') {
    const roleButton = document.createElement('button');
    roleButton.className = 'admin-action-button';
    roleButton.type = 'button';
    roleButton.textContent = user.role === 'admin' ? 'Remove admin access' : 'Make admin';
    roleButton.addEventListener('click', () => changeAdminRole(user.id, user.role === 'admin' ? 'member' : 'admin'));
    actions.append(roleButton);
  }

  if (user.id !== actor.id && user.role !== 'owner' && (user.role !== 'admin' || actor.role === 'owner')) {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'admin-action-button admin-action-danger';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Remove account';
    deleteButton.addEventListener('click', () => removeAccount(user));
    actions.append(deleteButton);
  }

  card.append(identity, actions);
  adminUserList.append(card);
}

function addAdminClan(clan) {
  const card = document.createElement('article');
  card.className = 'admin-clan-card';
  const identity = document.createElement('div');
  identity.className = 'admin-clan-identity';
  const logo = document.createElement('img');
  logo.className = 'admin-clan-logo';
  logo.src = clan.logoUrl;
  logo.alt = `${clan.name} logo`;
  logo.width = 64;
  logo.height = 64;
  const details = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = `${clan.name} [${clan.tag}]`;
  const owner = document.createElement('span');
  owner.textContent = `Owner: ${clan.ownerUsername}`;
  const roster = document.createElement('small');
  roster.textContent = `Roster: ${clan.roster.map((member) => `${member.username} (${member.playerId})`).join(', ')}`;
  details.append(name, owner, roster);
  identity.append(logo, details);

  const actions = document.createElement('div');
  actions.className = 'admin-user-actions';
  const approve = document.createElement('button');
  approve.className = 'admin-action-button';
  approve.type = 'button';
  approve.textContent = 'Approve';
  approve.addEventListener('click', () => reviewClan(clan.id, 'approve'));
  const reject = document.createElement('button');
  reject.className = 'admin-action-button admin-action-danger';
  reject.type = 'button';
  reject.textContent = 'Reject';
  reject.addEventListener('click', () => reviewClan(clan.id, 'reject'));
  actions.append(approve, reject);
  card.append(identity, actions);
  adminClanList.append(card);
}

function addAdminBan(ban) {
  const card = document.createElement('article');
  card.className = 'admin-ban-card';
  const details = document.createElement('div');
  details.className = 'admin-ban-details';
  const identity = document.createElement('div');
  identity.className = 'admin-ban-identity';
  const name = document.createElement('strong');
  name.textContent = ban.username;
  const status = document.createElement('span');
  status.className = `ban-status ban-status-${ban.status}`;
  status.textContent = ban.status;
  identity.append(name, status);
  const serial = document.createElement('p');
  serial.className = 'admin-ban-serial';
  serial.textContent = `Private device serial: ${ban.deviceSerial}`;
  const period = document.createElement('p');
  period.textContent = ban.durationDays === null
    ? 'Permanent'
    : `${ban.durationDays} ${ban.durationDays === 1 ? 'day' : 'days'}`;
  const reason = document.createElement('p');
  reason.textContent = `Reason: ${ban.reason}`;
  const dates = document.createElement('small');
  dates.textContent = ban.expiresAt
    ? `Created ${formatBlacklistDate(ban.createdAt)} · Expires ${formatBlacklistDate(ban.expiresAt)}`
    : `Created ${formatBlacklistDate(ban.createdAt)} · No expiry`;
  details.append(identity, serial, period, reason, dates);

  card.append(details);
  if (ban.status === 'active') {
    const revoke = document.createElement('button');
    revoke.className = 'admin-action-button admin-action-danger';
    revoke.type = 'button';
    revoke.textContent = 'Revoke record';
    revoke.addEventListener('click', () => revokeBan(ban));
    card.append(revoke);
  }
  adminBanList.append(card);
}

async function loadAdminDashboard() {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'owner')) return;
  adminDashboard.hidden = false;
  adminUserList.replaceChildren();
  adminClanList.replaceChildren();
  adminBanList.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'admin-loading';
  loading.textContent = 'Loading dashboard…';
  adminUserList.append(loading);
  const clanLoading = document.createElement('p');
  clanLoading.className = 'admin-loading';
  clanLoading.textContent = 'Loading clan registrations…';
  adminClanList.append(clanLoading);
  const banLoading = document.createElement('p');
  banLoading.className = 'admin-loading';
  banLoading.textContent = 'Loading blacklist records…';
  adminBanList.append(banLoading);

  try {
    const [contentResult, usersResult, clansResult, bansResult] = await Promise.all([
      requestApi('/api/admin/site-content'),
      requestApi('/api/admin/users'),
      requestApi('/api/admin/clans'),
      requestApi('/api/admin/bans')
    ]);
    renderEditableFields(contentResult.fields);
    adminBanList.replaceChildren();
    for (const ban of bansResult.bans) addAdminBan(ban);
    if (!bansResult.bans.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-loading';
      empty.textContent = 'No blacklist records yet.';
      adminBanList.append(empty);
    }
    adminClanList.replaceChildren();
    for (const clan of clansResult.clans) addAdminClan(clan);
    if (!clansResult.clans.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-loading';
      empty.textContent = 'No clans are waiting for approval.';
      adminClanList.append(empty);
    }
    adminUserList.replaceChildren();
    for (const user of usersResult.users) addAdminUser(user, currentUser);
    if (!usersResult.users.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-loading';
      empty.textContent = 'No player accounts yet.';
      adminUserList.append(empty);
    }
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function createBan(event) {
  event.preventDefault();
  setFormBusy(createBanForm, true);
  clearAdminMessage();
  try {
    const data = formValues(createBanForm);
    await requestApi('/api/admin/bans', {
      method: 'POST',
      body: JSON.stringify({
        username: data.username,
        durationDays: Number(data.durationDays),
        permanent: permanentBan.checked,
        reason: data.reason
      })
    });
    createBanForm.reset();
    banDurationDays.value = '7';
    banDurationDays.disabled = false;
    showAdminMessage('Blacklist record added. It is public but does not restrict website access.', 'success');
    await Promise.all([loadAdminDashboard(), loadPublicBlacklist()]);
  } catch (error) {
    showAdminMessage(error.message);
  } finally {
    setFormBusy(createBanForm, false);
  }
}

async function revokeBan(ban) {
  if (!window.confirm(`Revoke the blacklist record for ${ban.username}?`)) return;
  clearAdminMessage();
  try {
    await requestApi(`/api/admin/bans/${encodeURIComponent(ban.id)}/revoke`, {
      method: 'POST',
      body: '{}'
    });
    showAdminMessage('Blacklist record revoked.', 'success');
    await Promise.all([loadAdminDashboard(), loadPublicBlacklist()]);
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function reviewClan(clanId, decision) {
  clearAdminMessage();
  try {
    await requestApi(`/api/admin/clans/${encodeURIComponent(clanId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    });
    showAdminMessage(decision === 'approve' ? 'Clan approved and added to the official list.' : 'Clan registration rejected.', 'success');
    await Promise.all([loadAdminDashboard(), loadPublicClans(), loadMyClan()]);
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function changeAdminRole(userId, role) {
  clearAdminMessage();
  try {
    await requestApi('/api/admin/users/role', {
      method: 'POST',
      body: JSON.stringify({ userId, role })
    });
    showAdminMessage('Administrator access updated.', 'success');
    await loadAdminDashboard();
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function removeAccount(user) {
  if (!window.confirm(`Remove the account for ${user.username}? This also signs them out.`)) return;
  clearAdminMessage();
  try {
    await requestApi(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE',
      body: '{}'
    });
    showAdminMessage('Account removed.', 'success');
    await loadAdminDashboard();
  } catch (error) {
    showAdminMessage(error.message);
  }
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormBusy(form, busy) {
  const submit = form.querySelector('[type="submit"]');
  if (submit) {
    submit.disabled = busy;
    submit.setAttribute('aria-busy', String(busy));
  }
}

for (const tab of document.querySelectorAll('[data-account-tab]')) {
  tab.addEventListener('click', () => {
    clearMessage();
    showPanel(tab.dataset.accountTab);
  });
}

siteContentKey.addEventListener('change', updateContentEditor);

permanentBan.addEventListener('change', () => {
  banDurationDays.disabled = permanentBan.checked;
  banDurationDays.required = !permanentBan.checked;
});

adminEntry.addEventListener('click', (event) => {
  event.preventDefault();
  adminDashboard.hidden = false;
  clearAdminMessage();
  history.replaceState(null, '', '#admin-dashboard');
  adminDashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadAdminDashboard();
});

siteContentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = siteContentForm.querySelector('[type="submit"]');
  submit.disabled = true;
  clearAdminMessage();
  try {
    const result = await requestApi('/api/admin/site-content', {
      method: 'POST',
      body: JSON.stringify({ key: siteContentKey.value, value: siteContentValue.value })
    });
    const field = editableSiteFields.find((item) => item.key === result.key);
    if (field) field.value = result.value;
    renderSiteContent({ [result.key]: result.value });
    showAdminMessage('Website text saved.', 'success');
  } catch (error) {
    showAdminMessage(error.message);
  } finally {
    submit.disabled = false;
  }
});

createClanForm.addEventListener('submit', createClan);
createBanForm.addEventListener('submit', createBan);

document.querySelector('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setFormBusy(form, true);
  clearMessage();

  try {
    const result = await requestApi('/api/register', {
      method: 'POST',
      body: JSON.stringify(formValues(form))
    });
    showProfile(result.user);
    form.reset();
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
});

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setFormBusy(form, true);
  clearMessage();

  try {
    const result = await requestApi('/api/login', {
      method: 'POST',
      body: JSON.stringify(formValues(form))
    });
    showProfile(result.user);
    form.reset();
  } catch (error) {
    showMessage(error.message);
  } finally {
    setFormBusy(form, false);
  }
});

document.querySelector('#signout-button').addEventListener('click', async () => {
  clearMessage();
  try {
    await requestApi('/api/logout', { method: 'POST', body: '{}' });
    currentUser = null;
    adminDashboard.hidden = true;
    showPanel('login');
    showMessage('You have signed out.', 'success');
  } catch (error) {
    showMessage(error.message);
  }
});

Promise.all([requestApi('/api/site-content'), requestApi('/api/me')])
  .then(([contentResult, userResult]) => {
    renderSiteContent(contentResult.content);
    if (userResult.authenticated) showProfile(userResult.user);
    if (userResult.authenticated && (userResult.user.role === 'admin' || userResult.user.role === 'owner')
        && window.location.hash === '#admin-dashboard') {
      adminDashboard.hidden = false;
      loadAdminDashboard();
    }
  })
  .catch((error) => {
    showMessage(`Account service unavailable: ${error.message}`);
  });

loadPublicClans().catch((error) => {
  const status = document.createElement('p');
  status.className = 'clan-list-status';
  status.textContent = `Clans could not be loaded: ${error.message}`;
  publicClanList.replaceChildren(status);
});

loadPublicBlacklist().catch((error) => {
  const status = document.createElement('p');
  status.className = 'blacklist-list-status';
  status.textContent = `Blacklist records could not be loaded: ${error.message}`;
  publicBlacklist.replaceChildren(status);
});
