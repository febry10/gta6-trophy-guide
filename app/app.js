// Leonida Companion — an offline GTA VI trophy guide & tracker.
// All state lives in this browser (localStorage). Nothing is fetched but our own data file.
const LS_KEY = 'leonida-companion-v1';

const doc = await (await fetch('data/trophies.json')).json();
const TROPHIES = doc.trophies;
const byName = new Map(TROPHIES.map((t) => [t.name, t]));

const KIND_LABEL = { platinum: 'Platinum', story: 'Story', characters: 'Characters', collectibles: 'Collectibles', activities: 'Activities', misc: 'Miscellaneous' };
const KIND_ORDER = ['platinum', 'story', 'characters', 'collectibles', 'activities', 'misc'];
const GRADE_ORDER = ['platinum', 'gold', 'silver', 'bronze'];
const STAGE_META = [
  { n: 1, title: 'Stage 1 — Play the story, build the habits', hours: '60–80 hours', text: 'Play the five chapters and enjoy the game — there are no mission medals to chase. Take optional missions as they appear (you will want 100 of them for the 100% checklist), scan every new vehicle with the WAiNK app and study new animals through the binoculars as you go: both habits pay off in Stage 2. Finish the character questlines as they open. And do the one thing that cannot wait: when Lucia suggests meditating at Jason’s house in Chapter 1, follow her to the balcony and accept.' },
  { n: 2, title: 'Stage 2 — The 100% Completion checklist', hours: '~100 hours', text: 'After the credits, the checklist appears under Progress > Stats > 100% Completion — and everything you did during the story already counts. It is closer to 60% of true completion: 200 of 277 vehicles, 100 of 255 animals, 70 of 80 challenges, 250 stunts on the way to 300. Only robberies, underwater discoveries, shooting ranges, drone races and Bret’s quests must be done in full. This stage is the bulk of the platinum and earns most of the remaining trophies as it goes.' },
  { n: 3, title: 'Stage 3 — Cleanup, then the platinum', hours: '~10 hours', text: 'Whatever is left is small and specific: the one-off feats (Gunslinger, Catch Me If You Can, Challenging Tank), the partner jobs, the money totals and the still-unconfirmed oddballs. Finish the last trophy and Vice Got a Price! — the platinum — unlocks by itself.' },
];

// ---------- state ----------
const state = load() ?? { earned: [], subs: {}, spoilers: false };
let view = 'tracker';
let kindFilter = 'all';
let gradeFilter = 'all';
let query = '';
let earnedOnly = false;
let selected = null;

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
}
function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
const earnedSet = () => new Set(state.earned);
const isEarned = (t) => state.earned.includes(t.name);
function setEarned(t, on) {
  const s = earnedSet();
  if (on) s.add(t.name); else s.delete(t.name);
  state.earned = [...s];
  save();
}
const subCount = (t) => (state.subs[t.name] ?? []).length;

// ---------- shot seeding (used to render the maker's screenshots deterministically) ----------
const shotParam = new URLSearchParams(location.search).get('shot');
const SHOTS = {
  tracker: {
    earned: ['Just Like Paradise', 'Paradise Lost', 'T**s Ass Drug Money', 'Trust', 'Break the Bank', 'This Was No Boat Accident', 'Master of None', 'Baited My Tackle', 'Stick Fiddler', 'Whip It Good', 'Hot Together', 'Gunslinger', 'Little Boxes'],
    subs: { 'Positive Mental Attitude': [1, 2, 3, 4, 5] },
    selected: 'Positive Mental Attitude',
  },
  roadmap: { earned: ['Just Like Paradise', 'Paradise Lost', 'T**s Ass Drug Money', 'Trust', 'Break the Bank', 'This Was No Boat Accident', 'Master of None', 'Baited My Tackle', 'Stick Fiddler', 'Whip It Good', 'Hot Together', 'Gunslinger', 'Little Boxes'], view: 'roadmap' },
  missables: { earned: [], view: 'missables' },
  spoilers: {
    earned: ['Just Like Paradise', 'Master of None', 'Stick Fiddler', 'Whip It Good', 'Little Boxes'],
    spoilers: true, grade: 'bronze', selected: 'Snow Storm',
  },
};
if (shotParam && SHOTS[shotParam]) {
  const s = SHOTS[shotParam];
  state.earned = s.earned ?? [];
  state.subs = s.subs ?? {};
  state.spoilers = !!s.spoilers;
  save();
  view = s.view ?? 'tracker';
  gradeFilter = s.grade ?? 'all';
  selected = s.selected ?? null;
}

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const masked = (t) => state.spoilers && t.hidden && !isEarned(t);
const displayName = (t) => (masked(t) ? 'Hidden trophy' : t.name);
const displayDesc = (t) => (masked(t) ? 'Hidden on PSN — earn it to reveal its name.' : t.description);

function badges(t, { withKind = true } = {}) {
  const wrap = el('span', 'badges');
  wrap.append(el('span', `badge b-grade-${t.grade}`, t.grade));
  if (t.missable === 'possible') wrap.append(el('span', 'badge b-miss', 'Missable'));
  if (t.missable === 'watch') wrap.append(el('span', 'badge b-watch', 'Watch'));
  if (t.hidden) wrap.append(el('span', 'badge b-hidden', 'Hidden on PSN'));
  if (t.count) wrap.append(el('span', 'badge b-count', t.countLabel ?? String(t.count)));
  if (withKind && t.kind !== 'platinum') wrap.append(el('span', 'badge b-kind', KIND_LABEL[t.kind]));
  wrap.append(el('span', 'badge b-stage', `Stage ${t.stage}`));
  return wrap;
}

// ---------- header progress ----------
function renderProgress() {
  const total = TROPHIES.length;
  const n = state.earned.length;
  $('pc-earned').textContent = n;
  $('pc-pct').textContent = `${Math.round((n / total) * 100)}%`;
  $('pc-fill').style.width = `${(n / total) * 100}%`;
  $('pc-grades').textContent = GRADE_ORDER
    .map((g) => `${TROPHIES.filter((t) => t.grade === g && isEarned(t)).length}/${TROPHIES.filter((t) => t.grade === g).length} ${g}`)
    .join(' · ');
  const kinds = $('pc-kinds');
  kinds.replaceChildren();
  for (const k of KIND_ORDER) {
    const all = TROPHIES.filter((t) => t.kind === k);
    const got = all.filter(isEarned).length;
    const row = el('span', 'pc-kind');
    row.append(el('span', '', KIND_LABEL[k]), (() => { const b = el('span', 'kb'); const f = el('span', 'kf'); f.style.width = `${(got / all.length) * 100}%`; b.append(f); return b; })(), el('span', 'kn', `${got}/${all.length}`));
    kinds.append(row);
  }
  const stageBits = STAGE_META.map((s) => {
    const all = TROPHIES.filter((t) => t.stage === s.n);
    return `Stage ${s.n}: ${all.filter(isEarned).length}/${all.length}`;
  });
  $('pc-stage').textContent = `Roadmap — ${stageBits.join(' · ')}`;
  $('missable-badge').textContent = TROPHIES.filter((t) => t.missable === 'possible').length;
}

// ---------- tracker ----------
function buildChips() {
  const kc = $('kind-chips');
  kc.replaceChildren();
  const kinds = [['all', 'All kinds'], ...KIND_ORDER.map((k) => [k, KIND_LABEL[k]])];
  for (const [v, label] of kinds) {
    const c = el('button', 'chip' + (kindFilter === v ? ' is-on' : ''), '');
    c.type = 'button';
    const count = v === 'all' ? TROPHIES.length : TROPHIES.filter((t) => t.kind === v).length;
    c.append(document.createTextNode(label + ' '), el('span', 'n', String(count)));
    c.addEventListener('click', () => { kindFilter = v; renderTracker(); });
    kc.append(c);
  }
  const gc = $('grade-chips');
  gc.replaceChildren();
  const grades = [['all', 'All grades'], ...GRADE_ORDER.map((g) => [g, g[0].toUpperCase() + g.slice(1)])];
  for (const [v, label] of grades) {
    const c = el('button', 'chip' + (gradeFilter === v ? ' is-on' : ''), '');
    c.type = 'button';
    const count = v === 'all' ? TROPHIES.length : TROPHIES.filter((t) => t.grade === v).length;
    c.append(document.createTextNode(label + ' '), el('span', 'n', String(count)));
    c.addEventListener('click', () => { gradeFilter = v; renderTracker(); });
    gc.append(c);
  }
}

function visibleTrophies() {
  const q = query.trim().toLowerCase();
  return TROPHIES.filter((t) => {
    if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
    if (gradeFilter !== 'all' && t.grade !== gradeFilter) return false;
    if (earnedOnly && !isEarned(t)) return false;
    if (q) {
      const hay = masked(t) ? '' : `${t.name} ${t.description} ${t.guide}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function nextUp() {
  for (const s of STAGE_META) {
    const t = TROPHIES.find((x) => x.stage === s.n && !isEarned(x));
    if (t) return { stage: s, trophy: t };
  }
  return null;
}

function renderTracker() {
  buildChips();
  $('spoilers').checked = state.spoilers;
  const next = nextUp();
  const nu = $('nextup');
  nu.replaceChildren();
  if (next) {
    nu.append(el('strong', '', 'Next up: '), document.createTextNode(`${displayName(next.trophy)} — Stage ${next.stage.n} of the roadmap. `));
    const g = el('span', '', masked(next.trophy) ? 'A hidden story trophy: keep playing the story.' : next.trophy.guide.split('. ')[0] + '.');
    nu.append(g);
    const b = el('button', 'btn', 'Open it');
    b.type = 'button';
    b.addEventListener('click', () => selectTrophy(next.trophy.name, true));
    nu.append(b);
  } else {
    nu.append(el('strong', '', 'All 55 earned — platinum unlocked. Congratulations, Leonida Legend.'));
  }

  const list = visibleTrophies();
  $('list-count').textContent = `Showing ${list.length} of ${TROPHIES.length} trophies`;
  const ul = $('tlist');
  ul.replaceChildren();
  for (const t of list) {
    const li = el('li');
    const row = el('button', 'trow' + (isEarned(t) ? ' is-earned' : '') + (selected === t.name ? ' is-selected' : '') + (masked(t) ? ' masked' : ''));
    row.type = 'button';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = isEarned(t);
    box.setAttribute('aria-label', `Mark ${t.name} earned`);
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => { setEarned(t, box.checked); renderAll(); });
    const mid = el('span');
    mid.append(el('span', 'tname', displayName(t)), el('br'), el('span', 'tdesc', displayDesc(t)), el('br'), badges(t));
    const meta = el('span', 'tmeta');
    if (t.checklist) meta.append(el('span', 'badge b-count', `${subCount(t)}/${t.checklist.total} spots`));
    row.append(box, mid, meta);
    row.addEventListener('click', () => selectTrophy(t.name, false));
    li.append(row);
    ul.append(li);
  }
  renderDetail();
}

function selectTrophy(name, scroll) {
  selected = name;
  renderTracker();
  if (scroll) $('detail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderDetail() {
  const d = $('detail');
  d.replaceChildren();
  const t = selected ? byName.get(selected) : null;
  if (!t) {
    d.append(el('p', 'detail-empty', 'Pick a trophy from the list to read its guide — what to do, where, when it can be missed, and the sources it is built from.'));
    return;
  }
  const head = el('div');
  head.append(el('h2', '', displayName(t)), el('p', 'ddesc', displayDesc(t)), badges(t, { withKind: true }));
  d.append(head);

  const earnRow = el('div', 'earn-row');
  const eb = el('button', 'btn earn-btn' + (isEarned(t) ? ' is-earned' : ''), isEarned(t) ? '✓ Earned' : 'Mark earned');
  eb.type = 'button';
  eb.addEventListener('click', () => { setEarned(t, !isEarned(t)); renderAll(); });
  earnRow.append(eb);
  if (t.count) earnRow.append(el('span', '', `Tracker count: ${t.countLabel ?? t.count}`));
  d.append(earnRow);

  if (masked(t)) {
    d.append(el('p', '', 'This trophy is hidden on PlayStation and spoiler mode is on, so its name, description and guide stay covered until you earn it. Turn off “Hide story spoilers” if you’d rather read ahead.'));
    return;
  }

  // The structured guide comes first — what to do, where, and when it can be
  // missed — with its sources right under it, so the essentials are readable
  // without scrolling. The longer prose and callouts follow.
  d.append(el('h3', '', 'What · Where & how · When it can be missed'));
  const steps = el('ul', 'steps');
  for (const [k, label] of [['what', 'What'], ['where', 'Where & how'], ['when', 'When']]) {
    const li = el('li');
    li.append(el('span', 'sk', label + ': '), document.createTextNode(t.steps[k]));
    steps.append(li);
  }
  d.append(steps);

  const src = el('p', 'src-line');
  src.append(el('strong', '', 'Sources: '), document.createTextNode(t.sources.join(' · ')));
  d.append(src);

  if (t.missable === 'possible') {
    const c = el('div', 'miss-callout');
    c.append(el('strong', '', 'Possibly missable. '), document.createTextNode(t.missableNote));
    d.append(c);
  } else if (t.missable === 'watch') {
    const c = el('div', 'watch-callout');
    c.append(el('strong', '', 'Watch out. '), document.createTextNode(t.missableNote));
    d.append(c);
  }

  d.append(el('h3', '', 'Guide — in our own words'));
  d.append(el('p', '', t.guide));

  if (t.checklist) {
    d.append(el('h3', '', `Sub-checklist — ${t.checklist.label}`));
    const wrap = el('div', 'subcheck');
    const done = new Set(state.subs[t.name] ?? []);
    const headRow = el('div', 'sc-head');
    headRow.append(el('span', '', `${done.size} of ${t.checklist.total} done`), el('span', '', done.size === t.checklist.total ? 'Complete ✓' : ''));
    wrap.append(headRow);
    const grid = el('div', 'sc-grid');
    for (let i = 1; i <= t.checklist.total; i++) {
      const cell = el('button', 'sc-cell' + (done.has(i) ? ' is-done' : ''), String(i));
      cell.type = 'button';
      cell.addEventListener('click', () => {
        const s = new Set(state.subs[t.name] ?? []);
        if (s.has(i)) s.delete(i); else s.add(i);
        state.subs[t.name] = [...s].sort((a, b) => a - b);
        if (s.size === t.checklist.total) setEarned(t, true);
        save();
        renderAll();
      });
      grid.append(cell);
    }
    wrap.append(grid, el('p', 'sc-note', t.checklist.note + ' Ticking every spot marks the trophy earned.'));
    d.append(wrap);
  }
}

// ---------- roadmap ----------
function renderRoadmap() {
  const facts = doc.roadmapFacts;
  const strip = $('fact-strip');
  strip.replaceChildren();
  for (const [v, l] of [[facts.difficulty, 'Difficulty (PowerPyx)'], [facts.hours, 'To platinum'], [facts.playthroughs, 'Needed'], ['0 online', 'Online trophies'], ['No replay', 'Mission replay'], ['Cheats off', 'Cheats disable trophies']]) {
    const f = el('div', 'fact');
    f.append(el('div', 'fv', v), el('div', 'fl', l));
    strip.append(f);
  }
  const wrap = $('stages');
  wrap.replaceChildren();
  for (const s of STAGE_META) {
    const all = TROPHIES.filter((t) => t.stage === s.n);
    const got = all.filter(isEarned);
    const card = el('section', 'stage-card');
    const head = el('div', 'stage-head');
    head.append(el('h3', '', s.title), el('span', 'stage-count', `${got.length}/${all.length} earned · ${s.hours}`));
    const bar = el('div', 'stage-bar');
    const fill = el('div', 'stage-fill');
    fill.style.width = `${(got.length / all.length) * 100}%`;
    bar.append(fill);
    card.append(head, bar, el('p', '', s.text));
    if (s.n === 1) card.append(el('p', '', 'Missable flag for this stage: Positive Mental Attitude — see the Missables tab for the full reasoning. Nothing else in this stage can be lost permanently.'));
    const chips = el('div', 'stage-trophies');
    for (const t of all) {
      const c = el('span', 'chip' + (isEarned(t) ? ' done' : ''), displayName(t));
      if (t.missable === 'possible') c.append(el('span', 'badge b-miss', 'Missable'));
      chips.append(c);
    }
    card.append(chips);
    wrap.append(card);
  }
  const src = el('p', 'src-line');
  src.append(el('strong', '', 'Roadmap sources: '), document.createTextNode('PowerPyx — GTA VI Trophy Guide & Roadmap (stage structure, difficulty 4/10, ~200 hours, 1 playthrough, no mission replay) · GTABase — GTA VI Trophies & Achievements list. Stage membership of each trophy is our own grouping, computed from its kind and requirements.'));
  wrap.append(src);
}

// ---------- missables ----------
function renderMissables() {
  const main = $('missable-main');
  main.replaceChildren();
  for (const t of TROPHIES.filter((x) => x.missable === 'possible')) {
    const card = el('section', 'note-card danger miss-hero');
    const h = el('h3', '', '');
    h.append(document.createTextNode('The one flag: '), el('span', 'tname', t.name));
    card.append(h, badges(t));
    card.append(el('p', '', t.guide));
    card.append(el('p', '', t.missableNote));
    const src = el('p', 'src-line');
    src.append(el('strong', '', 'Sources: '), document.createTextNode(t.sources.join(' · ') + ' — both flag this trophy, and only this one, as potentially missable.'));
    card.append(src);
    main.append(card);
  }
  const wl = $('watch-list');
  wl.replaceChildren();
  for (const t of TROPHIES.filter((x) => x.missable === 'watch')) {
    const card = el('section', 'note-card');
    const h = el('h3', '', t.name);
    card.append(h, badges(t), el('p', '', t.missableNote));
    const src = el('p', 'src-line');
    src.append(el('strong', '', 'Sources: '), document.createTextNode(t.sources.join(' · ')));
    card.append(src);
    wl.append(card);
  }
}

// ---------- views ----------
function showView(v) {
  view = v;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('is-active', b.dataset.view === v);
  for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== `view-${v}`;
  if (v === 'roadmap') renderRoadmap();
  if (v === 'missables') renderMissables();
}
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => showView(b.dataset.view));

// ---------- controls ----------
$('search').addEventListener('input', (e) => { query = e.target.value; renderTracker(); });
$('spoilers').addEventListener('change', (e) => { state.spoilers = e.target.checked; save(); renderAll(); });
$('earned-only').addEventListener('change', (e) => { earnedOnly = e.target.checked; renderTracker(); });
$('export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ earned: state.earned, subs: state.subs }, null, 2)], { type: 'application/json' }));
  a.download = 'leonida-companion-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
$('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const names = Array.isArray(data) ? data : data.earned;
    if (!Array.isArray(names)) throw new Error('bad file');
    state.earned = names.filter((n) => byName.has(n));
    state.subs = (data && !Array.isArray(data) && data.subs) || {};
    save();
    renderAll();
  } catch { /* ignore a bad import file */ }
  e.target.value = '';
});
$('reset').addEventListener('click', () => {
  state.earned = [];
  state.subs = {};
  save();
  renderAll();
});

function renderAll() {
  renderProgress();
  renderTracker();
  if (view === 'roadmap') renderRoadmap();
  if (view === 'missables') renderMissables();
}

renderAll();
showView(view);
if (selected) renderDetail();
window.__shotReady = true;
