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
const tournamentAdminEntry = document.querySelector('#open-tournament-dashboard');
const adminMessage = document.querySelector('#admin-message');
const siteContentForm = document.querySelector('#site-content-form');
const siteContentKey = document.querySelector('#site-content-key');
const siteContentValue = document.querySelector('#site-content-value');
const adminUserList = document.querySelector('#admin-user-list');
const adminClanList = document.querySelector('#admin-clan-list');
const adminClanManagerList = document.querySelector('#admin-clan-manager-list');
const adminBanList = document.querySelector('#admin-ban-list');
const tournamentCreatePanel = document.querySelector('#tournament-create-panel');
const manualClanPanel = document.querySelector('#manual-clan-panel');
const manualClanForm = document.querySelector('#manual-clan-form');
const manualClanOwner = document.querySelector('#manual-clan-owner');
const createTournamentForm = document.querySelector('#create-tournament-form');
const tournamentManagerUser = document.querySelector('#tournament-manager-user');
const tournamentAdminPanel = document.querySelector('#tournament-admin-panel');
const tournamentAdminList = document.querySelector('#tournament-admin-list');
const eventForm = document.querySelector('#event-form');
const eventEditId = document.querySelector('#event-edit-id');
const eventImageInput = document.querySelector('#event-image');
const eventSubmit = document.querySelector('#event-submit');
const eventCancelEdit = document.querySelector('#event-cancel-edit');
const adminEventList = document.querySelector('#admin-event-list');
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
const publicTournamentList = document.querySelector('#public-tournament-list');
const publicEventList = document.querySelector('#public-event-list');
const homeNews = document.querySelector('.home-news');
const homeNewsViewport = document.querySelector('.home-news-viewport');
const homeNewsTrack = document.querySelector('#home-news-track');
const homeNewsPrevious = document.querySelector('#home-news-previous');
const homeNewsNext = document.querySelector('#home-news-next');
const homeNewsPause = document.querySelector('#home-news-pause');
let currentUser = null;
let currentClan = null;
let editableSiteFields = [];
let homeNewsIndex = 0;
let homeNewsTimer = null;
let homeNewsPaused = false;
let homeNewsScrollFrame = null;

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
  tournamentAdminEntry.hidden = true;
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
  currentClan = null;
  accountTabs.hidden = true;
  for (const form of accountForms) form.hidden = true;
  document.querySelector('#profile-username').textContent = user.username;
  document.querySelector('#profile-email').textContent = user.email;
  document.querySelector('#profile-player-id').textContent = user.playerId;
  document.querySelector('#profile-whatsapp').textContent = user.whatsappPhone;
  adminEntry.hidden = user.role !== 'admin' && user.role !== 'owner';
  tournamentAdminEntry.hidden = true;
  accountProfile.hidden = false;
  clanManager.hidden = false;
  showMessage(`Your account is ready. Access: ${user.role}.`, 'success');
  loadMyClan();
  loadTournamentAdminAccess();
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
  const headings = options.canManage
    ? ['Player', 'Player ID', 'New device serial · private', 'Actions']
    : ['Player', 'Player ID', 'Role', 'Joined'];
  for (const heading of headings) {
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
    if (options.canManage) {
      const playerIdInput = document.createElement('input');
      playerIdInput.className = 'clan-roster-edit-input';
      playerIdInput.type = 'text';
      playerIdInput.minLength = 3;
      playerIdInput.maxLength = 64;
      playerIdInput.value = member.playerId;
      playerIdInput.setAttribute('aria-label', `${member.username} player ID`);
      playerId.append(playerIdInput);
      const serial = document.createElement('input');
      serial.className = 'clan-roster-edit-input';
      serial.type = 'password';
      serial.minLength = 3;
      serial.maxLength = 128;
      serial.autocomplete = 'new-password';
      serial.placeholder = 'Leave blank to keep current';
      serial.setAttribute('aria-label', `${member.username} new private device serial`);
      const serialCell = document.createElement('td');
      serialCell.append(serial);
      const actions = document.createElement('td');
      const actionGroup = document.createElement('div');
      actionGroup.className = 'clan-manager-edit-actions';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'admin-action-button';
      save.textContent = 'Save';
      save.addEventListener('click', () => saveClanMemberDetails(
        options.clanId, member, playerIdInput.value, serial.value, save
      ));
      actionGroup.append(save);
      if (member.role !== 'owner') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'admin-action-button admin-action-danger';
        remove.textContent = options.currentUserId === member.id ? 'Leave clan' : 'Remove';
        remove.addEventListener('click', () => removeClanMember(options.clanId, member.id, member.username));
        actionGroup.append(remove);
      }
      actions.append(actionGroup);
      row.append(player, playerId, serialCell, actions);
      body.append(row);
      continue;
    }
    playerId.textContent = member.playerId;
    const role = document.createElement('td');
    role.textContent = member.role === 'owner' ? 'Owner' : 'Member';
    const joined = document.createElement('td');
    joined.textContent = formatBlacklistDate(member.joinedAt);
    row.append(player, playerId, role, joined);
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
    const registered = document.createElement('p');
    registered.textContent = `Registered ${formatBlacklistDate(clan.createdAt)}`;
    identity.append(tag, name, owner, registered);
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
    privacy.textContent = 'Roster roles and join dates are public with usernames and player IDs. Contact details and device serials stay private.';
    const table = createRosterTable(clan.roster);
    card.append(heading, rosterHeading, privacy, table);
    publicClanList.append(card);
  }
}

async function loadPublicClans() {
  const result = await requestApi('/api/clans');
  renderPublicClans(result.clans);
}

function tournamentFormatName(format) {
  return {
    league: 'League · round robin',
    elimination: 'Single elimination',
    groups_elimination: 'Groups + elimination'
  }[format] || format;
}

function tournamentStageName(match) {
  if (match.stage === 'league') return `League · round ${match.round}`;
  if (match.stage === 'group') return `Group ${match.group} · match ${match.slot}`;
  if (match.stage === 'elimination') return match.round === 1 ? `Elimination · round 1 · match ${match.slot}` : `Elimination · round ${match.round} · match ${match.slot}`;
  if (match.stage === 'playoff') return match.round === 1 ? `Semi-final ${match.slot}` : 'Final';
  return 'Match';
}

function createTournamentTable(tournament) {
  const table = document.createElement('table');
  table.className = 'tournament-standings-table';
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  for (const title of ['#', 'Clan', 'P', 'W', 'D', 'L', 'GD', 'Pts']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = title;
    header.append(cell);
  }
  head.append(header);
  table.append(head);
  const body = document.createElement('tbody');
  for (const [index, item] of tournament.standings.entries()) {
    const row = document.createElement('tr');
    const difference = item.goalsFor - item.goalsAgainst;
    for (const value of [
      String(index + 1),
      `[${item.clanTag}] ${item.clanName}`,
      String(item.played),
      String(item.wins),
      String(item.draws),
      String(item.losses),
      difference > 0 ? `+${difference}` : String(difference),
      String(item.points)
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  return table;
}

function createTournamentMatchList(tournament, publicView = true) {
  const list = document.createElement('div');
  list.className = 'tournament-match-list';
  if (!tournament.matches.length) {
    const empty = document.createElement('p');
    empty.className = 'tournament-list-status';
    empty.textContent = 'The schedule will appear after the tournament administrator completes the draw.';
    list.append(empty);
    return list;
  }
  for (const match of tournament.matches) {
    const card = document.createElement('article');
    card.className = 'tournament-match-card';
    const details = document.createElement('div');
    details.className = 'tournament-match-details';
    const phase = document.createElement('span');
    phase.className = 'tournament-match-phase';
    phase.textContent = tournamentStageName(match);
    const teams = document.createElement('strong');
    const home = match.home ? `[${match.home.tag}] ${match.home.name}` : 'TBD';
    const away = match.away ? `[${match.away.tag}] ${match.away.name}` : 'TBD';
    teams.textContent = `${home}  ${match.homeScore === null ? 'vs' : `${match.homeScore} - ${match.awayScore}`}  ${away}`;
    const date = document.createElement('small');
    date.textContent = match.scheduledAt ? formatBlacklistDate(match.scheduledAt) : 'Time to be announced';
    details.append(phase, teams, date);
    card.append(details);
    if (!publicView) card.dataset.matchId = match.id;
    list.append(card);
  }
  return list;
}

function publicTournamentCard(tournament) {
  const card = document.createElement('article');
  card.className = 'public-tournament-card';
  const heading = document.createElement('div');
  heading.className = 'public-tournament-heading';
  const logo = document.createElement('img');
  logo.className = 'public-tournament-logo';
  logo.src = tournament.logoUrl;
  logo.alt = `${tournament.name} logo`;
  logo.width = 100;
  logo.height = 100;
  const identity = document.createElement('div');
  identity.className = 'public-tournament-identity';
  const status = document.createElement('span');
  status.className = `tournament-status tournament-status-${tournament.status}`;
  status.textContent = tournament.status === 'registration' ? 'Registration open' : tournament.status === 'completed' ? 'Completed' : 'Draw complete';
  const name = document.createElement('h3');
  name.textContent = tournament.name;
  const summary = document.createElement('p');
  summary.textContent = `${tournamentFormatName(tournament.format)} · ${tournament.entries.length}/${tournament.maxClans} clans`;
  const organizers = document.createElement('p');
  organizers.textContent = `Organizers: ${tournament.organizers}`;
  identity.append(status, name, summary, organizers);
  heading.append(logo, identity);

  const actions = document.createElement('div');
  actions.className = 'tournament-poster-actions';
  for (const [kind, label] of [
    ['tournament', 'Tournament poster'],
    ['schedule', 'Match schedule poster'],
    ['standings', 'Standings poster']
  ]) {
    const button = document.createElement('button');
    button.className = 'admin-action-button';
    button.type = 'button';
    button.textContent = `Export ${label}`;
    button.addEventListener('click', () => exportTournamentPoster(tournament, kind)
      .catch((error) => showMessage(`Poster export failed: ${error.message}`)));
    actions.append(button);
  }

  const entryArea = document.createElement('div');
  entryArea.className = 'tournament-registration';
  if (!currentUser) {
    const signIn = document.createElement('a');
    signIn.className = 'button button-quiet';
    signIn.href = '#account';
    signIn.textContent = 'Sign in to register your clan';
    entryArea.append(signIn);
  } else if (['pending', 'accepted'].includes(tournament.myEntryStatus)) {
    const statusText = document.createElement('p');
    statusText.className = 'tournament-entry-status';
    statusText.textContent = `Your clan: ${tournament.myEntryStatus}`;
    entryArea.append(statusText);
  } else if (tournament.status === 'registration' && currentClan?.memberRole === 'owner'
      && currentClan.approvalStatus === 'approved') {
    const register = document.createElement('button');
    register.className = 'button button-primary';
    register.type = 'button';
    register.textContent = tournament.myEntryStatus ? 'Register your clan again' : 'Register your clan';
    register.addEventListener('click', () => registerClanForTournament(tournament));
    entryArea.append(register);
  } else if (tournament.myEntryStatus) {
    const statusText = document.createElement('p');
    statusText.className = 'tournament-entry-status';
    statusText.textContent = `Your clan registration: ${tournament.myEntryStatus}`;
    entryArea.append(statusText);
  } else if (tournament.status === 'registration') {
    const hint = document.createElement('p');
    hint.className = 'tournament-entry-status';
    hint.textContent = 'An owner of an approved clan can register here.';
    entryArea.append(hint);
  }

  const matchesHeading = document.createElement('h4');
  matchesHeading.className = 'tournament-subheading';
  matchesHeading.textContent = 'MATCH SCHEDULE & SCORES';
  const matches = createTournamentMatchList(tournament);
  const standingsHeading = document.createElement('h4');
  standingsHeading.className = 'tournament-subheading';
  standingsHeading.textContent = 'CLAN STANDINGS';
  const standings = tournament.standings.length
    ? createTournamentTable(tournament)
    : Object.assign(document.createElement('p'), {
      className: 'tournament-list-status',
      textContent: 'Standings will appear after clans are accepted.'
    });
  card.append(heading, actions, entryArea, matchesHeading, matches, standingsHeading, standings);
  return card;
}

function renderPublicTournaments(tournaments) {
  publicTournamentList.replaceChildren();
  if (!tournaments.length) {
    const empty = document.createElement('p');
    empty.className = 'tournament-list-status';
    empty.textContent = 'No tournaments have been announced yet.';
    publicTournamentList.append(empty);
    return;
  }
  for (const tournament of tournaments) publicTournamentList.append(publicTournamentCard(tournament));
}

async function loadPublicTournaments() {
  const result = await requestApi('/api/tournaments');
  renderPublicTournaments(result.tournaments);
}

function createEventCard(event, isAdmin = false) {
  const card = document.createElement('article');
  card.className = 'event-card';
  const image = document.createElement('img');
  image.className = 'event-picture';
  image.src = event.imageUrl;
  image.alt = `${event.title} event picture`;
  image.loading = 'lazy';
  image.width = 1200;
  image.height = 675;
  const body = document.createElement('div');
  body.className = 'event-card-body';
  const date = document.createElement('time');
  date.className = 'event-date';
  date.dateTime = event.createdAt;
  date.textContent = formatBlacklistDate(event.createdAt);
  const title = document.createElement('h3');
  title.textContent = event.title;
  const description = document.createElement('p');
  description.className = 'event-description';
  description.textContent = event.description;
  body.append(date, title, description);
  card.append(image, body);

  if (isAdmin) {
    const actions = document.createElement('div');
    actions.className = 'event-admin-actions';
    const edit = document.createElement('button');
    edit.className = 'admin-action-button';
    edit.type = 'button';
    edit.textContent = 'Edit event';
    edit.addEventListener('click', () => beginEditEvent(event));
    const remove = document.createElement('button');
    remove.className = 'admin-action-button admin-action-danger';
    remove.type = 'button';
    remove.textContent = 'Delete event';
    remove.addEventListener('click', () => deleteEvent(event));
    actions.append(edit, remove);
    card.append(actions);
  }
  return card;
}

function renderPublicEvents(events) {
  publicEventList.replaceChildren();
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'event-list-status';
    empty.textContent = 'No events have been published yet.';
    publicEventList.append(empty);
    return;
  }
  for (const event of events) publicEventList.append(createEventCard(event));
}

async function loadPublicEvents() {
  const result = await requestApi('/api/events');
  renderPublicEvents(result.events);
}

function updateHomeNewsFocus(scroll = false) {
  const cards = [...homeNewsTrack.querySelectorAll('.home-news-card')];
  if (!cards.length) return;
  cards.forEach((card, index) => {
    card.classList.toggle('is-focused', index === homeNewsIndex);
    card.setAttribute('aria-current', index === homeNewsIndex ? 'true' : 'false');
  });
  if (scroll) {
    const card = cards[homeNewsIndex];
    const viewportBounds = homeNewsViewport.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    const left = homeNewsViewport.scrollLeft
      + cardBounds.left - viewportBounds.left
      - (homeNewsViewport.clientWidth - cardBounds.width) / 2;
    homeNewsViewport.scrollTo({
      left,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
}

function stopHomeNewsRotation() {
  if (homeNewsTimer !== null) {
    window.clearInterval(homeNewsTimer);
    homeNewsTimer = null;
  }
}

function startHomeNewsRotation() {
  stopHomeNewsRotation();
  if (homeNewsPaused || document.hidden || homeNewsTrack.children.length < 2) return;
  homeNewsTimer = window.setInterval(() => {
    homeNewsIndex = (homeNewsIndex + 1) % homeNewsTrack.children.length;
    updateHomeNewsFocus(true);
  }, 5200);
}

function showHomeNewsItem(direction) {
  const total = homeNewsTrack.children.length;
  if (!total) return;
  homeNewsIndex = (homeNewsIndex + direction + total) % total;
  updateHomeNewsFocus(true);
  startHomeNewsRotation();
}

function renderHomeNews(items) {
  homeNewsTrack.replaceChildren();
  for (const item of items) {
    const card = document.createElement('a');
    card.className = 'home-news-card';
    card.href = item.href;
    card.setAttribute('aria-roledescription', 'slide');
    const background = document.createElement('img');
    background.className = 'home-news-background';
    background.src = item.imageUrl || '/Logo.jpg';
    background.alt = '';
    background.setAttribute('aria-hidden', 'true');
    background.loading = 'lazy';
    background.decoding = 'async';
    const content = document.createElement('div');
    content.className = 'home-news-content';
    const category = document.createElement('span');
    category.textContent = item.category;
    const title = document.createElement('strong');
    title.textContent = item.title;
    const detail = document.createElement('small');
    detail.textContent = item.detail;
    content.append(category, title, detail);
    card.append(background, content);
    homeNewsTrack.append(card);
  }
  homeNewsIndex = 0;
  updateHomeNewsFocus(true);
  startHomeNewsRotation();
}

async function loadHomepageNews() {
  const results = await Promise.allSettled([
    requestApi('/api/events'),
    requestApi('/api/tournaments'),
    requestApi('/api/blacklist'),
    requestApi('/api/clans')
  ]);
  const updates = [];
  const [events, tournaments, blacklist, clans] = results;
  if (events.status === 'fulfilled') {
    for (const event of events.value.events) {
      updates.push({
        category: 'New event',
        title: event.title,
        detail: formatBlacklistDate(event.createdAt),
        createdAt: event.createdAt,
        imageUrl: event.imageUrl,
        href: '#events'
      });
    }
  }
  if (tournaments.status === 'fulfilled') {
    for (const tournament of tournaments.value.tournaments) {
      updates.push({
        category: 'Tournament',
        title: tournament.name,
        detail: `${tournamentFormatName(tournament.format)} · ${formatBlacklistDate(tournament.createdAt)}`,
        createdAt: tournament.createdAt,
        imageUrl: tournament.logoUrl,
        href: '#tournaments'
      });
    }
  }
  if (blacklist.status === 'fulfilled') {
    for (const ban of blacklist.value.bans) {
      updates.push({
        category: 'Blacklist update',
        title: ban.username,
        detail: `Public record added · ${formatBlacklistDate(ban.createdAt)}`,
        createdAt: ban.createdAt,
        imageUrl: '/blacklist-icon.svg',
        href: '#blacklist'
      });
    }
  }
  if (clans.status === 'fulfilled') {
    for (const clan of clans.value.clans) {
      updates.push({
        category: 'Registered clan',
        title: `${clan.name} [${clan.tag}]`,
        detail: `${clan.memberCount} ${clan.memberCount === 1 ? 'player' : 'players'} · ${formatBlacklistDate(clan.createdAt)}`,
        createdAt: clan.createdAt,
        imageUrl: clan.logoUrl,
        href: '#clans'
      });
    }
  }
  updates.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  if (updates.length) {
    renderHomeNews(updates.slice(0, 10));
  } else if (results.every((result) => result.status === 'rejected')) {
    renderHomeNews([{
      category: 'TFOC updates',
      title: 'Updates unavailable',
      detail: 'Check your connection and refresh.',
      href: '#home'
    }]);
  } else {
    renderHomeNews([{
      category: 'Join the community',
      title: 'Play as one',
      detail: 'Meet the clans and players of TFOC.',
      href: '#clans'
    }]);
  }
}

homeNewsPrevious.addEventListener('click', () => showHomeNewsItem(-1));
homeNewsNext.addEventListener('click', () => showHomeNewsItem(1));
homeNewsPause.addEventListener('click', () => {
  homeNewsPaused = !homeNewsPaused;
  homeNewsPause.textContent = homeNewsPaused ? '▶' : 'Ⅱ';
  homeNewsPause.setAttribute('aria-label', homeNewsPaused ? 'Play updates' : 'Pause updates');
  startHomeNewsRotation();
});
homeNewsPause.textContent = homeNewsPaused ? '▶' : 'Ⅱ';
homeNewsPause.setAttribute('aria-label', homeNewsPaused ? 'Play updates' : 'Pause updates');
homeNews.addEventListener('focusin', () => {
  stopHomeNewsRotation();
});
homeNews.addEventListener('focusout', (event) => {
  if (!event.relatedTarget || !homeNews.contains(event.relatedTarget)) {
    startHomeNewsRotation();
  }
});
homeNewsViewport.addEventListener('scroll', () => {
  if (homeNewsScrollFrame !== null) cancelAnimationFrame(homeNewsScrollFrame);
  homeNewsScrollFrame = requestAnimationFrame(() => {
    homeNewsScrollFrame = null;
    const viewportBounds = homeNewsViewport.getBoundingClientRect();
    const viewportCenter = viewportBounds.left + viewportBounds.width / 2;
    const cards = [...homeNewsTrack.querySelectorAll('.home-news-card')];
    if (!cards.length) return;
    const closestIndex = cards.reduce((bestIndex, card, index) => {
      const bounds = card.getBoundingClientRect();
      const distance = Math.abs(bounds.left + bounds.width / 2 - viewportCenter);
      const bestBounds = cards[bestIndex].getBoundingClientRect();
      const bestDistance = Math.abs(bestBounds.left + bestBounds.width / 2 - viewportCenter);
      return distance < bestDistance ? index : bestIndex;
    }, 0);
    if (closestIndex !== homeNewsIndex) {
      homeNewsIndex = closestIndex;
      updateHomeNewsFocus();
    }
  });
});
document.addEventListener('visibilitychange', startHomeNewsRotation);

function renderAdminEvents(events) {
  adminEventList.replaceChildren();
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-loading';
    empty.textContent = 'No events published yet.';
    adminEventList.append(empty);
    return;
  }
  for (const event of events) adminEventList.append(createEventCard(event, true));
}

function beginEditEvent(event) {
  eventEditId.value = event.id;
  eventForm.elements.namedItem('title').value = event.title;
  eventForm.elements.namedItem('description').value = event.description;
  eventImageInput.value = '';
  eventImageInput.required = false;
  eventSubmit.textContent = 'Save event changes';
  eventCancelEdit.hidden = false;
  eventForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  eventForm.elements.namedItem('title').focus();
}

function resetEventForm() {
  eventForm.reset();
  eventEditId.value = '';
  eventImageInput.required = true;
  eventSubmit.textContent = 'Publish event';
  eventCancelEdit.hidden = true;
}

async function readEventImage(file) {
  if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Choose a PNG or JPEG event picture.');
  }
  if (file.size > 1024 * 1024) throw new Error('The event picture must be under 1 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 64 || bitmap.height < 64 || bitmap.width > 2400 || bitmap.height > 2400) {
      throw new Error('Use an event picture between 64 × 64 and 2400 × 2400 pixels.');
    }
  } finally {
    bitmap.close();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('The event picture could not be read.')));
    reader.readAsDataURL(file);
  });
}

async function saveEvent(event) {
  event.preventDefault();
  setFormBusy(eventForm, true);
  try {
    const body = formValues(eventForm);
    const eventId = body.eventId;
    const imageFile = eventImageInput.files[0];
    delete body.eventId;
    delete body.image;
    if (imageFile) body.imageDataUrl = await readEventImage(imageFile);
    else if (!eventId) throw new Error('Choose a picture for the event.');
    const result = await requestApi(eventId
      ? `/api/admin/events/${encodeURIComponent(eventId)}`
      : '/api/admin/events', {
      method: eventId ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    resetEventForm();
    showAdminMessage(eventId ? 'Event updated.' : 'Event published.', 'success');
    renderAdminEvents(await requestApi('/api/admin/events').then((response) => response.events));
    await Promise.all([loadPublicEvents(), loadHomepageNews()]);
  } catch (error) {
    showAdminMessage(error.message);
  } finally {
    setFormBusy(eventForm, false);
  }
}

async function deleteEvent(event) {
  if (!window.confirm(`Permanently delete the event “${event.title}”?`)) return;
  try {
    await requestApi(`/api/admin/events/${encodeURIComponent(event.id)}`, {
      method: 'DELETE',
      body: '{}'
    });
    if (eventEditId.value === event.id) resetEventForm();
    showAdminMessage('Event deleted.', 'success');
    const result = await requestApi('/api/admin/events');
    renderAdminEvents(result.events);
    await Promise.all([loadPublicEvents(), loadHomepageNews()]);
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function registerClanForTournament(tournament) {
  try {
    await requestApi(`/api/tournaments/${encodeURIComponent(tournament.id)}/register`, {
      method: 'POST',
      body: '{}'
    });
    showMessage(`Your clan registration for ${tournament.name} was sent for approval.`, 'success');
    await loadPublicTournaments();
    await loadTournamentAdminAccess();
  } catch (error) {
    showMessage(error.message);
  }
}

async function exportTournamentPoster(tournament, kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the poster canvas.');
  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#19191b');
  background.addColorStop(0.58, '#101011');
  background.addColorStop(1, '#281014');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#e51d2a';
  context.fillRect(0, 0, 18, canvas.height);
  context.globalAlpha = 0.15;
  context.beginPath();
  context.moveTo(790, 0);
  context.lineTo(1080, 0);
  context.lineTo(1080, 530);
  context.closePath();
  context.fill();
  context.globalAlpha = 1;

  const image = new Image();
  image.src = tournament.logoUrl;
  await new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', () => reject(new Error('Tournament logo could not be loaded.')), { once: true });
  });
  context.save();
  context.beginPath();
  context.roundRect(72, 72, 150, 150, 26);
  context.clip();
  context.drawImage(image, 72, 72, 150, 150);
  context.restore();

  context.fillStyle = '#f3f1ed';
  context.font = '700 25px Arial, sans-serif';
  context.fillText('TFOC ESPORTS  /  TOURNAMENT SERIES', 260, 121);
  context.fillStyle = '#e51d2a';
  context.font = '700 22px Arial, sans-serif';
  context.fillText(kind === 'schedule' ? 'OFFICIAL MATCH SCHEDULE' : kind === 'standings' ? 'OFFICIAL STANDINGS' : 'OFFICIAL TOURNAMENT', 76, 300);
  context.fillStyle = '#f3f1ed';
  context.font = '900 76px Arial, sans-serif';
  const words = tournament.name.split(/\s+/);
  let titleLine = '';
  let titleY = 400;
  for (const word of words) {
    const candidate = titleLine ? `${titleLine} ${word}` : word;
    if (context.measureText(candidate).width > 900 && titleLine) {
      context.fillText(titleLine, 76, titleY);
      titleY += 92;
      titleLine = word;
    } else titleLine = candidate;
  }
  if (titleLine) context.fillText(titleLine, 76, titleY);
  const bodyTop = Math.max(510, titleY + 105);
  context.fillStyle = '#a9a7a4';
  context.font = '600 27px Arial, sans-serif';
  context.fillText(`${tournamentFormatName(tournament.format).toUpperCase()}  ·  ${tournament.organizers}`, 78, bodyTop);
  context.strokeStyle = 'rgba(255,255,255,.2)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(76, bodyTop + 40);
  context.lineTo(1000, bodyTop + 40);
  context.stroke();

  let rows;
  if (kind === 'schedule') {
    rows = tournament.matches.slice(0, 12).map((match) => {
      const time = match.scheduledAt ? formatBlacklistDate(match.scheduledAt) : 'Time TBA';
      const score = match.homeScore === null ? 'VS' : `${match.homeScore} - ${match.awayScore}`;
      return [`${tournamentStageName(match).toUpperCase()}  ·  ${time}`, `${match.home ? `[${match.home.tag}] ${match.home.name}` : 'TBD'}   ${score}   ${match.away ? `[${match.away.tag}] ${match.away.name}` : 'TBD'}`];
    });
  } else if (kind === 'standings') {
    rows = tournament.standings.slice(0, 12).map((team, index) => [
      `${String(index + 1).padStart(2, '0')}  [${team.clanTag}] ${team.clanName}`,
      `${team.played} played  ·  ${team.wins}W ${team.draws}D ${team.losses}L  ·  ${team.goalsFor - team.goalsAgainst >= 0 ? '+' : ''}${team.goalsFor - team.goalsAgainst} GD  ·  ${team.points} PTS`
    ]);
  } else {
    rows = [
      [`${tournament.entries.length} / ${tournament.maxClans} CLANS`, tournament.status === 'registration' ? 'REGISTRATION OPEN' : tournament.status.toUpperCase()],
      ['ORGANIZERS', tournament.organizers],
      ['COMPETITION FORMAT', tournamentFormatName(tournament.format).toUpperCase()],
      ['DRAW', tournament.drawMode.toUpperCase()]
    ];
  }
  let rowY = bodyTop + 104;
  for (const [title, detail] of rows) {
    if (rowY > 1190) break;
    context.fillStyle = '#e51d2a';
    context.fillRect(78, rowY - 25, 6, 74);
    context.fillStyle = '#f3f1ed';
    context.font = '700 27px Arial, sans-serif';
    context.fillText(title.slice(0, 70), 105, rowY);
    context.fillStyle = '#aaa8a5';
    context.font = '500 22px Arial, sans-serif';
    context.fillText(detail.slice(0, 90), 105, rowY + 38);
    rowY += 105;
  }
  context.fillStyle = '#f3f1ed';
  context.font = '800 22px Arial, sans-serif';
  context.fillText('PLAY AS ONE.  RISE TOGETHER.', 78, 1285);
  context.fillStyle = '#777674';
  context.font = '500 18px Arial, sans-serif';
  context.fillText('TUNISIAN FEDERATION OF CLANS', 78, 1318);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Poster image could not be generated.');
  const url = URL.createObjectURL(blob);
  const download = document.createElement('a');
  download.href = url;
  download.download = `${tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}.png`;
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  role.textContent = clan.memberRole === 'owner'
    ? 'Clan owner'
    : clan.isClanManager ? 'Assigned clan manager' : 'Clan member';
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
  privacy.textContent = 'Roster usernames, player IDs, roles, and join dates are public. Contact details and device serials are never shared.';
  myClanPanel.append(heading, approvalStatus, rosterHeading, privacy, createRosterTable(clan.roster, {
    canManage: clan.canManageClan,
    clanId: clan.id,
    currentUserId: currentUser.id
  }));

  if (!clan.canManageClan) return;

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

  myClanPanel.append(editForm, inviteForm, sentHeading, pendingList);
  if (clan.memberRole === 'owner') {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'button button-quiet clan-delete-button';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete clan';
    deleteButton.addEventListener('click', () => deleteCurrentClan(clan.id, clan.name));
    myClanPanel.append(deleteButton);
  }
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
    currentClan = result.clan;
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
    await loadPublicTournaments();
  } catch (error) {
    showMessage(error.message);
  }
}

async function readClanLogo(file) {
  if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Choose a PNG or JPEG clan logo.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('The clan logo must be under 10 MB.');

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

async function saveClanMemberDetails(clanId, member, playerId, deviceSerial, button) {
  const updatedPlayerId = playerId.trim();
  const updatedSerial = deviceSerial.trim();
  if (updatedPlayerId.length < 3 || updatedPlayerId.length > 64
      || (updatedSerial && (updatedSerial.length < 3 || updatedSerial.length > 128))) {
    showMessage('Enter a player ID of 3–64 characters and, if changing it, a device serial of 3–128 characters.');
    return;
  }
  button.disabled = true;
  clearMessage();
  try {
    const body = { playerId: updatedPlayerId };
    if (updatedSerial) body.deviceSerial = updatedSerial;
    await requestApi(`/api/clans/${encodeURIComponent(clanId)}/members/${encodeURIComponent(member.id)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    showMessage(`${member.username}’s player details updated. Device serials remain private.`, 'success');
    await Promise.all([loadMyClan(), loadPublicClans()]);
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
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

function updateManualClanOwnerOptions(users) {
  manualClanOwner.replaceChildren();
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = users.length ? 'Select an available player' : 'No eligible players available';
  manualClanOwner.append(prompt);
  for (const user of users) {
    const option = document.createElement('option');
    option.value = user.id;
    option.textContent = user.username;
    manualClanOwner.append(option);
  }
  manualClanOwner.disabled = users.length === 0;
  manualClanForm.querySelector('[type="submit"]').disabled = users.length === 0;
}

async function createManualClan(event) {
  event.preventDefault();
  setFormBusy(manualClanForm, true);
  clearAdminMessage();
  try {
    const body = formValues(manualClanForm);
    body.publicRosterConsent = manualClanForm.elements.namedItem('publicRosterConsent').checked;
    body.logoDataUrl = await readClanLogo(manualClanForm.elements.namedItem('logo').files[0]);
    delete body.logo;
    const result = await requestApi('/api/admin/clans/manual', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    manualClanForm.reset();
    showAdminMessage(`Clan ${result.clan.name} [${result.clan.tag}] added and approved.`, 'success');
    const [ownersResult] = await Promise.all([
      requestApi('/api/admin/clan-owners'),
      loadAdminDashboard(),
      loadPublicClans()
    ]);
    updateManualClanOwnerOptions(ownersResult.users);
  } catch (error) {
    showAdminMessage(error.message);
  } finally {
    setFormBusy(manualClanForm, false);
    if (manualClanOwner.options.length <= 1) manualClanForm.querySelector('[type="submit"]').disabled = true;
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
  owner.textContent = `Owner: ${clan.ownerUsername} · ${clan.approvalStatus}`;
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

function renderAdminClanManagers(clans) {
  adminClanManagerList.replaceChildren();
  if (!clans.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-loading';
    empty.textContent = 'Approved clans will appear here when available.';
    adminClanManagerList.append(empty);
    return;
  }
  for (const clan of clans) {
    const row = document.createElement('div');
    row.className = 'clan-manager-assignment';
    const identity = document.createElement('div');
    identity.className = 'clan-manager-assignment-identity';
    const name = document.createElement('strong');
    name.textContent = `${clan.name} [${clan.tag}]`;
    const owner = document.createElement('span');
    owner.textContent = `Owner: ${clan.ownerUsername}`;
    identity.append(name, owner);

    const select = document.createElement('select');
    select.setAttribute('aria-label', `Assigned manager for ${clan.name}`);
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'No assigned manager';
    select.append(none);
    const eligible = clan.roster.filter((member) => member.role === 'member');
    for (const member of eligible) {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = member.username;
      select.append(option);
    }
    select.value = clan.managerId || '';

    const save = document.createElement('button');
    save.className = 'admin-action-button';
    save.type = 'button';
    save.textContent = 'Save permission';
    save.addEventListener('click', () => saveClanManager(clan.id, select.value || null, save));
    row.append(identity, select, save);
    adminClanManagerList.append(row);
  }
}

async function saveClanManager(clanId, managerId, button) {
  button.disabled = true;
  try {
    await requestApi(`/api/admin/clans/${encodeURIComponent(clanId)}/manager`, {
      method: 'PUT',
      body: JSON.stringify({ managerId })
    });
    showAdminMessage(managerId ? 'Clan manager permission updated.' : 'Clan manager permission removed.', 'success');
    await loadAdminDashboard();
  } catch (error) {
    showAdminMessage(error.message);
  } finally {
    button.disabled = false;
  }
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

function updateTournamentManagerOptions(users) {
  tournamentManagerUser.replaceChildren();
  for (const user of users) {
    const option = document.createElement('option');
    option.value = user.id;
    option.textContent = `${user.username} · ${user.role}`;
    tournamentManagerUser.append(option);
  }
  if (!users.length) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No player accounts available';
    tournamentManagerUser.append(empty);
  } else if (currentUser && users.some((user) => user.id === currentUser.id)) {
    tournamentManagerUser.value = currentUser.id;
  }
}

function createTournamentEntryRow(tournament, entry) {
  const row = document.createElement('div');
  row.className = 'tournament-entry-row';
  const clan = document.createElement('strong');
  clan.textContent = `[${entry.clanTag}] ${entry.clanName}`;
  const status = document.createElement('span');
  status.className = `tournament-status tournament-status-${entry.status}`;
  status.textContent = entry.status;
  row.append(clan, status);
  if (tournament.status === 'registration' && ['pending', 'accepted'].includes(entry.status)) {
    const actions = document.createElement('div');
    actions.className = 'admin-user-actions';
    if (entry.status === 'pending') {
      for (const [action, label] of [['accept', 'Accept'], ['decline', 'Decline']]) {
        const button = document.createElement('button');
        button.className = 'admin-action-button';
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => reviewTournamentEntry(tournament, entry, action));
        actions.append(button);
      }
    }
    const remove = document.createElement('button');
    remove.className = 'admin-action-button admin-action-danger';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => reviewTournamentEntry(tournament, entry, 'remove'));
    actions.append(remove);
    row.append(actions);
  }
  return row;
}

function createTournamentMatchEditor(tournament, match) {
  const form = document.createElement('form');
  form.className = 'tournament-match-editor';
  const title = document.createElement('strong');
  title.textContent = tournamentStageName(match);
  const teams = document.createElement('p');
  teams.textContent = `${match.home ? `[${match.home.tag}] ${match.home.name}` : 'TBD'} vs ${match.away ? `[${match.away.tag}] ${match.away.name}` : 'TBD'}`;
  const fields = document.createElement('div');
  fields.className = 'tournament-score-fields';
  const dateLabel = document.createElement('label');
  dateLabel.className = 'form-field';
  dateLabel.textContent = 'Scheduled time';
  const date = document.createElement('input');
  date.type = 'datetime-local';
  if (match.scheduledAt) {
    const localDate = new Date(match.scheduledAt);
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    date.value = localDate.toISOString().slice(0, 16);
  }
  dateLabel.append(date);
  fields.append(dateLabel);
  for (const [side, score] of [['Home score', match.homeScore], ['Away score', match.awayScore]]) {
    const label = document.createElement('label');
    label.className = 'form-field';
    label.textContent = side;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '99';
    input.step = '1';
    input.value = score === null ? '' : String(score);
    input.dataset.score = side.startsWith('Home') ? 'home' : 'away';
    label.append(input);
    fields.append(label);
  }
  const save = document.createElement('button');
  save.className = 'admin-action-button';
  save.type = 'submit';
  save.textContent = 'Save match';
  form.append(title, teams, fields, save);
  form.addEventListener('submit', (event) => saveTournamentMatch(event, tournament, match));
  return form;
}

function addTournamentAdminCard(tournament) {
  const card = document.createElement('article');
  card.className = 'tournament-admin-card';
  const heading = document.createElement('div');
  heading.className = 'admin-clan-identity';
  const logo = document.createElement('img');
  logo.className = 'admin-clan-logo';
  logo.src = tournament.logoUrl;
  logo.alt = `${tournament.name} logo`;
  logo.width = 64;
  logo.height = 64;
  const titleBlock = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = tournament.name;
  const description = document.createElement('span');
  description.textContent = `${tournamentFormatName(tournament.format)} · ${tournament.published ? 'published' : 'draft'} · ${tournament.status} · ${tournament.entries.filter((entry) => entry.status === 'accepted').length}/${tournament.maxClans} clans`;
  titleBlock.append(title, description);
  heading.append(logo, titleBlock);
  card.append(heading);

  if (!tournament.published && tournament.status === 'registration') {
    const publish = document.createElement('button');
    publish.className = 'button button-primary admin-submit';
    publish.type = 'button';
    publish.textContent = 'Publish tournament';
    publish.addEventListener('click', () => publishTournament(tournament));
    card.append(publish);
  }

  const entriesHeading = document.createElement('h4');
  entriesHeading.className = 'tournament-subheading';
  entriesHeading.textContent = 'CLAN REGISTRATIONS';
  const entries = document.createElement('div');
  entries.className = 'tournament-entry-list';
  for (const entry of tournament.entries) entries.append(createTournamentEntryRow(tournament, entry));
  if (!tournament.entries.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-loading';
    empty.textContent = 'No clans have registered yet.';
    entries.append(empty);
  }
  card.append(entriesHeading, entries);

  if (tournament.published && tournament.status === 'registration') {
    const accepted = tournament.entries.filter((entry) => entry.status === 'accepted');
    const pending = tournament.entries.some((entry) => entry.status === 'pending');
    if (tournament.drawMode === 'manual') {
      const label = document.createElement('label');
      label.className = 'form-field tournament-manual-order';
      label.textContent = 'Manual draw order · enter every accepted clan tag, separated by commas';
      const order = document.createElement('input');
      order.type = 'text';
      order.value = accepted.map((entry) => entry.clanTag).join(', ');
      order.placeholder = 'ALPHA, BRAVO, CHARLIE';
      label.append(order);
      card.append(label);
      card.dataset.manualOrder = 'true';
      card._manualOrderInput = order;
    }
    const draw = document.createElement('button');
    draw.className = 'button button-primary admin-submit';
    draw.type = 'button';
    draw.textContent = tournament.drawMode === 'random' ? 'Create random draw' : 'Create manual draw';
    draw.disabled = pending || accepted.length < 2;
    draw.addEventListener('click', () => createTournamentDraw(tournament, card._manualOrderInput));
    card.append(draw);
    if (pending) {
      const note = document.createElement('p');
      note.className = 'tournament-entry-status';
      note.textContent = 'Review all pending registrations before creating the draw.';
      card.append(note);
    }
  }
  if (tournament.matches.length) {
    const scheduleHeading = document.createElement('h4');
    scheduleHeading.className = 'tournament-subheading';
    scheduleHeading.textContent = 'SCHEDULE & SCORES';
    const matches = document.createElement('div');
    matches.className = 'tournament-match-editor-list';
    for (const match of tournament.matches) matches.append(createTournamentMatchEditor(tournament, match));
    card.append(scheduleHeading, matches);
  }
  tournamentAdminList.append(card);
}

function renderTournamentAdminList(tournaments) {
  tournamentAdminList.replaceChildren();
  if (!tournaments.length) {
    const empty = document.createElement('p');
    empty.className = 'admin-loading';
    empty.textContent = currentUser?.role === 'owner'
      ? 'No tournaments yet. Create one to start registrations.'
      : 'You have not been assigned to manage a tournament.';
    tournamentAdminList.append(empty);
    return;
  }
  for (const tournament of tournaments) addTournamentAdminCard(tournament);
}

async function loadTournamentAdminAccess() {
  if (!currentUser) return;
  try {
    const result = await requestApi('/api/tournament-admin/tournaments');
    tournamentAdminEntry.hidden = currentUser.role !== 'owner' && result.tournaments.length === 0;
  } catch (error) {
    showMessage(error.message);
  }
}

async function loadTournamentDashboard() {
  if (!currentUser) return;
  adminDashboard.hidden = false;
  const globalAdmin = currentUser.role === 'owner' || currentUser.role === 'admin';
  adminDashboard.querySelector('.admin-heading > p').textContent = globalAdmin
    ? 'Manage public site content, player accounts, and tournament operations. Only the owner can assign tournament administrators.'
    : 'Manage registrations, draws, match schedules, and results only for tournaments assigned to your account.';
  tournamentCreatePanel.hidden = currentUser.role !== 'owner';
  manualClanPanel.hidden = currentUser.role !== 'owner';
  for (const panel of adminDashboard.querySelectorAll('.admin-panel:not(.tournament-admin-panel):not(.tournament-create-panel)')) {
    panel.hidden = !globalAdmin;
  }
  try {
    const result = await requestApi('/api/tournament-admin/tournaments');
    renderTournamentAdminList(result.tournaments);
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function reviewTournamentEntry(tournament, entry, action) {
  try {
    await requestApi(`/api/tournament-admin/${encodeURIComponent(tournament.id)}/entries/${encodeURIComponent(entry.id)}`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    const outcome = { accept: 'accepted', decline: 'declined', remove: 'removed' }[action];
    showAdminMessage(`Clan registration ${outcome}.`, 'success');
    await Promise.all([loadTournamentDashboard(), loadPublicTournaments()]);
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function publishTournament(tournament) {
  try {
    await requestApi(`/api/tournament-admin/${encodeURIComponent(tournament.id)}/publish`, {
      method: 'POST',
      body: '{}'
    });
    showAdminMessage(`${tournament.name} is now published and open for clan registrations.`, 'success');
    await Promise.all([loadTournamentDashboard(), loadPublicTournaments(), loadHomepageNews()]);
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function createTournamentDraw(tournament, manualOrderInput) {
  const body = {};
  if (tournament.drawMode === 'manual') {
    const tags = manualOrderInput.value.split(',').map((tag) => tag.trim().toUpperCase()).filter(Boolean);
    const accepted = tournament.entries.filter((entry) => entry.status === 'accepted');
    if (tags.length !== accepted.length || new Set(tags).size !== tags.length) {
      showAdminMessage('Enter each accepted clan tag exactly once for the manual draw.');
      return;
    }
    const orderedEntries = tags.map((tag) => accepted.find((entry) => entry.clanTag.toUpperCase() === tag));
    if (orderedEntries.some((entry) => !entry)) {
      showAdminMessage('The manual draw must contain only accepted clan tags.');
      return;
    }
    body.entryIds = orderedEntries.map((entry) => entry.id);
  }
  try {
    await requestApi(`/api/tournament-admin/${encodeURIComponent(tournament.id)}/draw`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    showAdminMessage('Tournament draw created and fixtures are ready.', 'success');
    await Promise.all([loadTournamentDashboard(), loadPublicTournaments()]);
  } catch (error) {
    showAdminMessage(error.message);
  }
}

async function saveTournamentMatch(event, tournament, match) {
  event.preventDefault();
  const form = event.currentTarget;
  const homeValue = form.querySelector('[data-score="home"]').value;
  const awayValue = form.querySelector('[data-score="away"]').value;
  const scheduledValue = form.querySelector('input[type="datetime-local"]').value;
  const body = {
    homeScore: homeValue === '' ? null : Number(homeValue),
    awayScore: awayValue === '' ? null : Number(awayValue),
    scheduledAt: scheduledValue ? new Date(scheduledValue).toISOString() : null
  };
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await requestApi(`/api/tournament-admin/${encodeURIComponent(tournament.id)}/matches/${encodeURIComponent(match.id)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    showAdminMessage('Match schedule and score saved.', 'success');
    await Promise.all([loadTournamentDashboard(), loadPublicTournaments()]);
  } catch (error) {
    showAdminMessage(error.message);
  } finally {
    submit.disabled = false;
  }
}

async function createTournament(event) {
  event.preventDefault();
  setFormBusy(createTournamentForm, true);
  try {
    const body = formValues(createTournamentForm);
    body.maxClans = Number(body.maxClans);
    body.logoDataUrl = await readClanLogo(createTournamentForm.elements.namedItem('logo').files[0]);
    delete body.logo;
    await requestApi('/api/tournaments', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    createTournamentForm.reset();
    showAdminMessage('Tournament created as a draft. Its assigned administrator must publish it before clans can register.', 'success');
    await Promise.all([loadAdminDashboard(), loadPublicTournaments()]);
  } catch (error) {
    showAdminMessage(error.message);
  } finally {
    setFormBusy(createTournamentForm, false);
  }
}

async function loadAdminDashboard() {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'owner')) return;
  adminDashboard.hidden = false;
  adminDashboard.querySelector('.admin-heading > p').textContent =
    'Manage public site content, player accounts, and tournament operations. Only the owner can assign tournament administrators.';
  tournamentCreatePanel.hidden = currentUser.role !== 'owner';
  manualClanPanel.hidden = currentUser.role !== 'owner';
  for (const panel of adminDashboard.querySelectorAll('.admin-panel:not(.tournament-admin-panel):not(.tournament-create-panel)')) {
    panel.hidden = false;
  }
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
    const [contentResult, usersResult, clansResult, bansResult, tournamentsResult, eventsResult, clanOwnersResult, clanManagersResult] = await Promise.all([
      requestApi('/api/admin/site-content'),
      requestApi('/api/admin/users'),
      requestApi('/api/admin/clans'),
      requestApi('/api/admin/bans'),
      requestApi('/api/tournament-admin/tournaments'),
      requestApi('/api/admin/events'),
      currentUser.role === 'owner'
        ? requestApi('/api/admin/clan-owners')
        : Promise.resolve({ users: [] }),
      requestApi('/api/admin/clan-managers')
    ]);
    renderTournamentAdminList(tournamentsResult.tournaments);
    renderAdminEvents(eventsResult.events);
    renderAdminClanManagers(clanManagersResult.clans);
    if (currentUser.role === 'owner') {
      updateTournamentManagerOptions(usersResult.users);
      updateManualClanOwnerOptions(clanOwnersResult.users);
    }
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
    await Promise.all([loadAdminDashboard(), loadPublicBlacklist(), loadHomepageNews()]);
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
    await Promise.all([loadAdminDashboard(), loadPublicBlacklist(), loadHomepageNews()]);
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

tournamentAdminEntry.addEventListener('click', (event) => {
  event.preventDefault();
  clearAdminMessage();
  history.replaceState(null, '', '#admin-dashboard');
  adminDashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadTournamentDashboard();
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
manualClanForm.addEventListener('submit', createManualClan);
createBanForm.addEventListener('submit', createBan);
createTournamentForm.addEventListener('submit', createTournament);
eventForm.addEventListener('submit', saveEvent);
eventCancelEdit.addEventListener('click', resetEventForm);

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
    currentClan = null;
    adminDashboard.hidden = true;
    tournamentAdminEntry.hidden = true;
    showPanel('login');
    showMessage('You have signed out.', 'success');
    await loadPublicTournaments();
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

loadPublicTournaments().catch((error) => {
  const status = document.createElement('p');
  status.className = 'tournament-list-status';
  status.textContent = `Tournaments could not be loaded: ${error.message}`;
  publicTournamentList.replaceChildren(status);
});

loadPublicEvents().catch((error) => {
  const status = document.createElement('p');
  status.className = 'event-list-status';
  status.textContent = `Events could not be loaded: ${error.message}`;
  publicEventList.replaceChildren(status);
});

loadPublicBlacklist().catch((error) => {
  const status = document.createElement('p');
  status.className = 'blacklist-list-status';
  status.textContent = `Blacklist records could not be loaded: ${error.message}`;
  publicBlacklist.replaceChildren(status);
});

loadHomepageNews().catch((error) => {
  renderHomeNews([{
    category: 'TFOC updates',
    title: 'Updates unavailable',
    detail: error.message,
    href: '#home'
  }]);
});
