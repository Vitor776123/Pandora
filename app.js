/* Pandora: centro de comando pessoal */
(() => {
'use strict';

const CFG = window.PANDORA_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* =========================================================
   Utilitários
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const TZ = 'America/Sao_Paulo';
const tzDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const tzTime = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// Data (ano-mês-dia) de um instante no fuso de São Paulo: uma tarefa concluída às 22h não cai no dia seguinte por causa do UTC.
const localDateOf = (iso) => { try { return tzDate.format(new Date(iso)); } catch (e) { return ymd(new Date(iso)); } };
const localTimeOf = (iso) => { try { return tzTime.format(new Date(iso)); } catch (e) { return ''; } };
const todayStr = () => localDateOf(Date.now());
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtLong = (s) => { const d = parseYmd(s); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
const fmtShort = (s) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
const fmtFull = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const monthOf = (s) => String(s).slice(0, 7);
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hm = (t) => (t ? String(t).slice(0, 5) : '');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const byId = (arr, id) => arr.find((x) => x.id === id);
const firstLine = (s, max = 140) => String(s || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, max) || '';

function debounce(fn, ms) {
  let t = null, args = null;
  const run = () => { t = null; const a = args; args = null; return fn(...a); };
  const w = (...a) => { args = a; clearTimeout(t); t = setTimeout(run, ms); };
  w.flush = () => (t ? (clearTimeout(t), run()) : Promise.resolve());
  return w;
}
const autosize = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };

/* =========================================================
   Cores do tema: um botão no topo, cada clique passa para a próxima.
   Para criar outra cor, acrescente aqui e um bloco :root[data-theme="..."] no styles.css.
   ========================================================= */
const THEMES = [
  { id: 'esmeralda', label: 'Esmeralda', bg: '#030a0d' },
  { id: 'rubi', label: 'Rubi', bg: '#0b0305' },
  { id: 'ouro', label: 'Ouro', bg: '#080603' },
  { id: 'prata', label: 'Prata', bg: '#070a0f' },
];
const THEME_KEY = 'pandora-theme';
let themeId = THEMES[0].id, themeSync = false;
const themeById = (id) => THEMES.find((t) => t.id === id);
const saveThemeRemote = debounce(async (id) => {
  if (!themeSync) return;
  try { await sb.auth.updateUser({ data: { theme: id } }); } catch (e) { /* sem rede: vale só neste aparelho */ }
}, 900);
function applyTheme(id, { save = true, remote = true } = {}) {
  const t = themeById(id) || THEMES[0];
  themeId = t.id;
  document.documentElement.setAttribute('data-theme', t.id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bg);
  syncFab();
  if (save) {
    try { localStorage.setItem(THEME_KEY, t.id); } catch (e) { /* sem armazenamento local */ }
    if (remote) saveThemeRemote(t.id);
  }
}
const MOTION_KEY = 'pandora-motion';
let motionOn = true, motionChosen = false;
const saveMotionRemote = debounce(async (on) => {
  if (!themeSync) return;
  try { await sb.auth.updateUser({ data: { motion: on ? 'on' : 'off' } }); } catch (e) { /* sem rede: vale só neste aparelho */ }
}, 900);
/* luzes que percorrem as curvas: o script as conduz a ~20 quadros por segundo (o movimento é lento, não se nota)
   e assim o vidro desfocado dos cartões é recalculado 3x menos do que numa animação de 60 quadros */
const FLOW_STEP = 1000 / 20 - 2;
const FLOW_LEN = { w: 16, m: 10, c: 5 }; // tamanho do rastro de cada camada (em % da curva)
const flowSmall = window.matchMedia ? window.matchMedia('(max-width: 820px)') : { matches: false };
let flowRaf = 0, flowLast = 0;
function flowTick(t) {
  flowRaf = requestAnimationFrame(flowTick);
  if (t - flowLast < FLOW_STEP) return;
  flowLast = t;
  const gs = document.querySelectorAll(document.body.classList.contains('nb-open') ? '.nb-flow .pl' : '#flow .pl');
  const max = Math.min(gs.length, flowSmall.matches ? 5 : gs.length), s = t / 1000;
  for (let i = 0; i < max; i++) {
    const g = gs[i];
    const p = ((((s - +g.dataset.o) / +g.dataset.d) % 1) + 1) % 1; // posição no ciclo, 0..1
    g.style.opacity = p < 0.1 ? p * 10 : p > 0.9 ? (1 - p) * 10 : 1;
    const c = -8 + 116 * p; // centro da luz ao longo da curva (começa e termina fora da tela)
    for (const path of g.children) path.setAttribute('stroke-dashoffset', (FLOW_LEN[path.getAttribute('class')] / 2 - c).toFixed(2));
  }
}
function flowSync() {
  const run = motionOn && !document.hidden;
  if (run && !flowRaf) flowRaf = requestAnimationFrame(flowTick);
  else if (!run && flowRaf) { cancelAnimationFrame(flowRaf); flowRaf = 0; }
}
function applyMotion(on, { save = true, remote = true } = {}) {
  motionOn = !!on;
  document.documentElement.setAttribute('data-motion', motionOn ? 'on' : 'off');
  flowSync();
  syncFab();
  if (save) {
    motionChosen = true;
    try { localStorage.setItem(MOTION_KEY, motionOn ? 'on' : 'off'); } catch (e) { /* sem armazenamento local */ }
    if (remote) saveMotionRemote(motionOn);
  }
}
const toggleMotion = () => applyMotion(!motionOn);
(() => {
  let v = null, reduce = false;
  try { v = localStorage.getItem(MOTION_KEY); } catch (e) { /* ignora */ }
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignora */ }
  motionChosen = v === 'on' || v === 'off';
  applyMotion(motionChosen ? v === 'on' : !reduce, { save: false });
  document.addEventListener('visibilitychange', flowSync);
})();
// o caderno de reunião cobre a tela e tem o seu próprio fundo: leva uma cópia das luzes
const flowMarkup = () => { const f = document.getElementById('flow'); return f ? f.outerHTML.replace(' id="flow"', '').replace('class="flow"', 'class="flow nb-flow"') : ''; };

const nextTheme = () => applyTheme(THEMES[(THEMES.findIndex((t) => t.id === themeId) + 1) % THEMES.length].id);
(() => { let v = null; try { v = localStorage.getItem(THEME_KEY); } catch (e) { /* ignora */ } applyTheme(v, { save: false }); })();

const ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  note: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h7M9 14.5h7M9 18h4"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  book: '<path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  file: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevL: '<path d="m14.5 6-6 6 6 6"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>',
  back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  exit: '<path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9"/>',
  arrowR: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.2v.1"/>',
  checkc: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.5 2.5 4.5-5"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  waves: '<path d="M3 8.5c3-3.2 6 3.2 9 0s6 3.2 9 0"/><path d="M3 15.5c3-3.2 6 3.2 9 0s6 3.2 9 0"/><path class="slash" d="M5 20 19 4"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-.9.7-1.6 1.6-1.6H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.9 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11.2" r=".9"/><circle cx="10.2" cy="7.6" r=".9"/><circle cx="14.6" cy="7.6" r=".9"/>',
};
const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

const STATUSES = ['Pendente', 'Em construção', 'Feito', 'Testado', 'No ar'];
const SCOLOR = {
  'Pendente': 'var(--s-pendente)', 'Em construção': 'var(--s-construcao)',
  'Feito': 'var(--s-feito)', 'Testado': 'var(--s-testado)', 'No ar': 'var(--s-noar)',
};
const isDone = (s) => s === 'Feito' || s === 'Testado' || s === 'No ar';
const pill = (s) => `<span class="pill"><i style="background:${SCOLOR[s]}"></i>${esc(s)}</span>`;
const KEY_POINTS_DEFAULT = '1. \n2. \n3. \n4. ';

/* =========================================================
   Estado e dados
   ========================================================= */
const S = {
  user: null,
  projects: [], templates: [], meetings: [], tasks: [], diary: [], reports: [], links: [],
  cal: { y: new Date().getFullYear(), m: new Date().getMonth(), sel: todayStr() },
  diarySel: null, repMonth: null, gesMonth: null, boardProject: '', meetFilter: '',
  gesTab: 'relatorio', tlProject: '', tlOpen: null,
};

const loaders = {
  projects: () => sb.from('projects').select('*').order('created_at'),
  templates: () => sb.from('meeting_templates').select('*').order('created_at'),
  meetings: () => sb.from('meetings').select('*').order('meeting_date', { ascending: false }).order('start_time', { ascending: false }),
  tasks: () => sb.from('tasks').select('*').order('created_at', { ascending: false }),
  diary: () => sb.from('diary_entries').select('*').order('entry_date', { ascending: false }),
  reports: () => sb.from('reports').select('*').order('month', { ascending: false }),
  links: () => sb.from('project_links').select('*').order('created_at'),
};
async function reload(...keys) {
  const ks = keys.length ? keys : Object.keys(loaders);
  const res = await Promise.all(ks.map((k) => loaders[k]()));
  res.forEach((r, i) => {
    if (r.error) { if (ks[i] === 'links') { console.warn(r.error); S.links = []; return; } throw r.error; }
    S[ks[i]] = r.data || [];
  });
}
const friendly = (e) => (/jwt|expired|not authenticated/i.test(e?.message || '') ? 'Sua sessão expirou. Entre novamente.' : (e?.message || 'Erro inesperado.'));
async function call(p) {
  const { data, error } = await p;
  if (error) { console.error(error); toast(friendly(error), 'error'); throw error; }
  return data;
}

/* =========================================================
   Interface base: toasts, modal, confirmação
   ========================================================= */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3400);
}

const modalState = { onClose: null };
function openModal(html, { wide = false, onClose = null } = {}) {
  modalState.onClose = onClose;
  const o = $('#overlay');
  o.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  o.hidden = false;
  const f = $('input:not([type=hidden]), textarea, select', o);
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() {
  const o = $('#overlay');
  const cb = modalState.onClose;
  modalState.onClose = null;
  o.hidden = true; o.innerHTML = '';
  if (cb) cb();
}
let confirmResolve = null;
function confirmDialog(msg, ok = 'Confirmar', danger = false) {
  return new Promise((res) => {
    confirmResolve = res;
    openModal(
      `<p class="modal-text">${esc(msg)}</p>
       <div class="modal-actions">
         <button class="btn ghost" data-act="modal-cancel">Cancelar</button>
         <button class="btn ${danger ? 'danger-solid' : 'primary'}" data-act="modal-ok">${esc(ok)}</button>
       </div>`,
      { onClose: () => { if (confirmResolve) { confirmResolve(false); confirmResolve = null; } } }
    );
  });
}

/* =========================================================
   Roteamento e navegação
   ========================================================= */
const VIEWS = {
  hoje: { label: 'Hoje', icon: 'sun', render: vHoje },
  calendario: { label: 'Calendário', icon: 'cal', render: vCalendario },
  reunioes: { label: 'Reuniões', icon: 'note', render: vReunioes },
  tarefas: { label: 'Tarefas', icon: 'check', render: vTarefas, mount: () => {} },
  projetos: { label: 'Projetos', icon: 'layers', render: vProjetos },
  diario: { label: 'Diário', icon: 'book', render: vDiario, mount: mountAutosize },
  relatorios: { label: 'Relatórios', icon: 'file', render: vRelatorios, mount: mountAutosize },
  gestao: { label: 'Gestão', icon: 'chart', render: vGestao },
};
let currentRoute = 'hoje';
const routeFromHash = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0]; return VIEWS[r] ? r : 'hoje'; };
function go(r) { if (location.hash === `#/${r}`) render(false); else location.hash = `#/${r}`; }
function mountAutosize() { $$('#view textarea.ruled').forEach(autosize); }

function renderNav() {
  $('#nav').innerHTML = `<div class="nav-panel">
    <div class="brand"><span class="mark" aria-hidden="true"></span><span class="brand-name lbl">Pandora</span></div>
    <button class="btn primary nav-new" data-act="new-meeting" aria-label="Nova reunião">${ico('plus')}<span class="lbl">Nova reunião</span></button>
    ${Object.entries(VIEWS).map(([k, v]) => `<a class="nav-item ${k === currentRoute ? 'active' : ''}" href="#/${k}" aria-label="${v.label}" ${k === currentRoute ? 'aria-current="page"' : ''}>${ico(v.icon)}<span class="lbl">${v.label}</span></a>`).join('')}
    <span class="nav-sp"></span>
    <button class="nav-user" data-act="open-account" aria-label="Conta">${ico('user')}<span class="lbl">${esc(S.user?.email || '')}</span></button>
  </div>`;
}

function ownerList() {
  const set = new Set([CFG.OWNER_NAME]);
  S.tasks.forEach((t) => t.owner && set.add(t.owner));
  S.meetings.forEach((m) => (Array.isArray(m.actions) ? m.actions : []).forEach((a) => a.owner && set.add(a.owner)));
  return [...set].filter(Boolean);
}
function refreshOwners() {
  const dl = $('#owners');
  if (dl) dl.innerHTML = ownerList().map((o) => `<option value="${esc(o)}"></option>`).join('');
}
function render(animate) {
  currentRoute = routeFromHash();
  refreshOwners();
  renderNav();
  const v = $('#view');
  const view = VIEWS[currentRoute];
  v.innerHTML = view.render();
  const page = v.firstElementChild;
  if (animate && page) page.classList.add('enter');
  if (view.mount) view.mount();
  document.title = `${view.label} · Pandora`;
}
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  const p = $('#view > .page');
  if (p && !$('#app').hidden) { p.classList.add('leaving'); setTimeout(() => render(true), 100); } else render(true);
});
function refreshUI() {
  if ($('#app').hidden) return;
  render(false);
  if (NB && !$('#notebook').hidden) renderNbActions();
}

/* =========================================================
   Componentes de lista
   ========================================================= */
function taskRow(x, inDay = false) {
  const proj = byId(S.projects, x.project_id);
  const late = !isDone(x.status) && x.due_date && x.due_date < todayStr();
  return `<div class="row ${isDone(x.status) ? 'is-done' : ''}" data-act="open-task" data-id="${x.id}" tabindex="0" role="button">
    <button class="check ${isDone(x.status) ? 'on' : ''}" data-act="complete-task" data-id="${x.id}" aria-label="${isDone(x.status) ? 'Reabrir tarefa' : 'Marcar como feita'}"></button>
    <div class="row-main"><div class="row-title">${esc(x.title)}</div>${proj || x.owner ? `<div class="row-sub">${[proj && esc(proj.name), x.owner && `Resp.: ${esc(x.owner)}`].filter(Boolean).join(' · ')}</div>` : ''}</div>
    ${pill(x.status)}
    <span class="due ${late ? 'late' : ''}">${inDay && isDone(x.status) && x.completed_at ? `feita ${esc(localTimeOf(x.completed_at))}` : x.due_date ? `${inDay ? 'prazo ' : ''}${fmtShort(x.due_date)}` : 'sem prazo'}</span>
  </div>`;
}
// Dia a que uma tarefa pertence no Diário: concluída → data de conclusão (fuso de São Paulo), ou o prazo se não houver; pendente → prazo.
const taskDay = (t) => (isDone(t.status) ? (t.completed_at ? localDateOf(t.completed_at) : t.due_date) : t.due_date) || '';
function meetRow(m, showDate = false) {
  const proj = byId(S.projects, m.project_id);
  const n = S.tasks.filter((t) => t.meeting_id === m.id).length;
  return `<div class="row" data-act="open-meeting" data-id="${m.id}" tabindex="0" role="button">
    <span class="${showDate ? 'dt' : 'time'}">${showDate ? fmtShort(m.meeting_date) : (hm(m.start_time) || '--:--')}</span>
    <div class="row-main"><div class="row-title">${esc(m.title || 'Reunião sem título')}</div>
      <div class="row-sub">${esc(m.kind)}${proj ? ` · ${esc(proj.name)}` : ''}${n ? ` · ${pl(n, 'ação', 'ações')}` : ''}</div></div>
    ${m.status === 'Finalizada' ? '<span class="tag done">Registrada</span>' : '<span class="tag draft">Rascunho</span>'}
  </div>`;
}
const cmpDue = (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999');

/* =========================================================
   Hoje
   ========================================================= */
function vHoje() {
  const t = todayStr();
  const ms = S.meetings.filter((m) => m.meeting_date === t).sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'));
  const open = S.tasks.filter((x) => !isDone(x.status));
  const late = open.filter((x) => x.due_date && x.due_date < t).sort(cmpDue);
  const todays = open.filter((x) => x.due_date === t);
  const soon = open.filter((x) => x.due_date && x.due_date > t && x.due_date <= addDays(t, 7)).sort(cmpDue);
  const doneWeek = S.tasks.filter((x) => isDone(x.status) && x.completed_at && localDateOf(x.completed_at) >= addDays(t, -6)).length;
  const entry = S.diary.find((d) => d.entry_date === t);
  const first = CFG.OWNER_NAME.split(' ')[0];
  const now = new Date();
  const h = now.getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const bits = [
    ms.length ? pl(ms.length, 'reunião hoje', 'reuniões hoje') : 'nenhuma reunião hoje',
    todays.length ? pl(todays.length, 'prazo para hoje', 'prazos para hoje') : null,
    late.length ? pl(late.length, 'tarefa atrasada', 'tarefas atrasadas') : null,
  ].filter(Boolean);

  // próxima reunião (ainda não finalizada, horário à frente)
  const nowMin = h * 60 + now.getMinutes();
  const toMin = (m) => +hm(m.start_time).slice(0, 2) * 60 + +hm(m.start_time).slice(3, 5);
  const next = ms.find((m) => m.status !== 'Finalizada' && hm(m.start_time) && toMin(m) >= nowMin - 5);
  let nextHtml = '';
  if (next) {
    const d = toMin(next) - nowMin;
    const when = d <= 0 ? 'agora' : d < 60 ? `em ${d} min` : `em ${Math.floor(d / 60)}h${d % 60 ? pad(d % 60) : ''}`;
    const pr = byId(S.projects, next.project_id);
    nextHtml = `<div class="next" data-act="open-meeting" data-id="${next.id}" tabindex="0" role="button">
      <span class="next-time">${hm(next.start_time)}</span>
      <span class="next-main"><span class="next-lbl">Próxima reunião · ${when}</span><b>${esc(next.title || 'Reunião sem título')}</b><small>${esc(next.kind)}${pr ? ` · ${esc(pr.name)}` : ''}</small></span>
      <span class="next-go">${ico('arrowR')}</span>
    </div>`;
  }

  // tarefas: no máximo 8 linhas, prioridade para as atrasadas
  let budget = 8;
  const L = late.slice(0, budget); budget -= L.length;
  const T = todays.slice(0, budget); budget -= T.length;
  const N = soon.slice(0, budget);
  const hidden = late.length + todays.length + soon.length - (L.length + T.length + N.length);
  const group = (title, list, cls = '') => (list.length ? `<div class="group-title ${cls}">${title}<span class="muted">${list.length}</span></div>${list.map(taskRow).join('')}` : '');

  const projs = S.projects.slice(0, 6);
  const projCards = projs.map((p) => {
    const st = projStats(p.id);
    const pend = st.total - st.done;
    return `<button class="pj" data-act="goto" data-route="projetos">
      <span class="pj-top"><b>${esc(p.name)}</b>${pill(p.status)}</span>
      <span class="bar"><i style="width:${st.pct}%"></i></span>
      <span class="pj-sub">${st.total ? `${st.pct}% concluído · ${pend ? pl(pend, 'pendente', 'pendentes') : 'sem pendências'}` : 'Sem tarefas ainda'}</span>
    </button>`;
  }).join('');
  const k = (n) => (typeof navigator !== 'undefined' ? kbdLabel(n) : n);

  return `<section class="page">
    <div class="page-head">
      <div>
        <h1 class="cap">${esc(fmtLong(t))}</h1>
        <p class="page-sub">${greet}, ${esc(first)}. ${esc(cap(bits.join(', ')))}.</p>
      </div>
      <div class="head-actions mobile-only"><button class="btn primary" data-act="new-meeting">${ico('plus')}Nova reunião</button></div>
    </div>
    <div class="bento">
      <section class="b-card b-agenda" style="--i:0" aria-labelledby="b-ag">
        <header class="b-head"><h2 id="b-ag" class="b-title">${ico('cal')}Agenda de hoje<span class="count">${ms.length}</span></h2><button class="btn ghost sm" data-act="new-meeting">${ico('plus')}Reunião</button></header>
        ${nextHtml}
        ${ms.length ? ms.map((m) => meetRow(m)).join('') : `<div class="empty center"><span class="empty-ico">${ico('cal')}</span><b>Nenhuma reunião registrada hoje</b><span>Abra o caderno quando a próxima começar.</span><button class="btn" data-act="new-meeting">${ico('plus')}Abrir caderno de reunião</button></div>`}
      </section>
      <section class="b-card b-stats" style="--i:1" aria-labelledby="b-st">
        <header class="b-head"><h2 id="b-st" class="b-title">${ico('chart')}Panorama</h2></header>
        <div class="stats">
          <button class="stat st-cal" data-act="goto" data-route="calendario"><b>${ms.length}</b><span class="st-ico">${ico('cal')}</span><span class="st-l">${ms.length === 1 ? 'reunião hoje' : 'reuniões hoje'}</span></button>
          <button class="stat st-clock" data-act="goto" data-route="tarefas"><b>${todays.length}</b><span class="st-ico">${ico('clock')}</span><span class="st-l">${todays.length === 1 ? 'prazo hoje' : 'prazos hoje'}</span></button>
          <button class="stat st-alert ${late.length ? 'warn' : ''}" data-act="goto" data-route="tarefas"><b>${late.length}</b><span class="st-ico">${ico('alert')}</span><span class="st-l">${late.length === 1 ? 'atrasada' : 'atrasadas'}</span></button>
          <button class="stat st-ok ok" data-act="goto" data-route="tarefas"><b>${doneWeek}</b><span class="st-ico">${ico('checkc')}</span><span class="st-l">${doneWeek === 1 ? 'concluída em 7 dias' : 'concluídas em 7 dias'}</span></button>
        </div>
      </section>
      <section class="b-card b-tasks" style="--i:2" aria-labelledby="b-tk">
        <header class="b-head"><h2 id="b-tk" class="b-title">${ico('clock')}Prazos</h2><button class="link" data-act="goto" data-route="tarefas">Ver tarefas${ico('arrowR')}</button></header>
        ${group('Atrasadas', L, 'late')}${group('Para hoje', T)}${group('Próximos 7 dias', N)}
        ${hidden ? `<p class="b-more">e mais ${pl(hidden, 'prazo', 'prazos')}. <button class="link" data-act="goto" data-route="tarefas">Abrir quadro</button></p>` : ''}
        ${!late.length && !todays.length && !soon.length ? `<div class="empty">Sem prazos nos próximos 7 dias.<br><button class="btn" data-act="new-task">${ico('plus')}Nova tarefa</button></div>` : ''}
      </section>
      <section class="b-card b-diary" style="--i:3" aria-labelledby="b-di">
        <header class="b-head"><h2 id="b-di" class="b-title">${ico('pencil')}Diário de hoje</h2><span class="save-state diary-state"></span></header>
        <textarea class="ruled" data-diary="${t}" rows="6" aria-label="Diário de hoje" placeholder="O que você fez hoje? Anote aqui e vira histórico para o relatório.">${esc(entry?.content || '')}</textarea>
      </section>
      <section class="b-card b-quick" style="--i:4" aria-labelledby="b-qk">
        <header class="b-head"><h2 id="b-qk" class="b-title">${ico('bolt')}Acesso rápido</h2></header>
        <div class="qlist">
          <button class="q" data-act="new-meeting">${ico('note')}<span>Nova reunião</span><kbd>${esc(k('Alt N'))}</kbd></button>
          <button class="q" data-act="new-task">${ico('check')}<span>Nova tarefa</span></button>
          <button class="q" data-act="qc-toggle">${ico('bolt')}<span>Captura rápida</span><kbd>${esc(k('Ctrl J'))}</kbd></button>
          <button class="q" data-act="open-search">${ico('search')}<span>Buscar ou comandos</span><kbd>${esc(k('Ctrl K'))}</kbd></button>
        </div>
      </section>
      <section class="b-card b-proj" style="--i:5" aria-labelledby="b-pj">
        <header class="b-head"><h2 id="b-pj" class="b-title">${ico('layers')}Projetos<span class="count">${S.projects.length}</span></h2><button class="link" data-act="goto" data-route="projetos">Ver todos${ico('arrowR')}</button></header>
        ${projs.length ? `<div class="pj-grid">${projCards}</div>` : `<div class="empty">Nenhum projeto cadastrado.<br><button class="btn" data-act="new-project">${ico('plus')}Novo projeto</button></div>`}
      </section>
    </div>
  </section>`;
}

/* =========================================================
   Calendário
   ========================================================= */
function vCalendario() {
  const { y, m } = S.cal;
  const sel = S.cal.sel;
  const t = todayStr();
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const meetBy = {}, taskBy = {};
  S.meetings.forEach((x) => (meetBy[x.meeting_date] ||= []).push(x));
  S.tasks.forEach((x) => { if (x.due_date) (taskBy[x.due_date] ||= []).push(x); });
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = ymd(d);
    const ms = (meetBy[ds] || []).slice().sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const ts = taskBy[ds] || [];
    const evs = [
      ...ms.map((x) => `<span class="ev meet">${hm(x.start_time) ? `${hm(x.start_time)} ` : ''}${esc(x.title || 'Reunião')}</span>`),
      ...ts.map((x) => `<span class="ev task ${isDone(x.status) ? 'done' : ''}"><i style="background:${SCOLOR[x.status]}"></i>${esc(x.title)}</span>`),
    ];
    const dots = ms.map(() => '<i></i>').join('') + ts.map(() => '<i class="t"></i>').join('');
    cells += `<button class="cell ${d.getMonth() !== m ? 'out' : ''} ${ds === t ? 'today' : ''} ${ds === sel ? 'sel' : ''}" data-act="cal-select" data-date="${ds}" aria-label="${esc(fmtLong(ds))}">
      <span class="dn">${d.getDate()}</span>${evs.slice(0, 3).join('')}${evs.length > 3 ? `<span class="ev-more">+${evs.length - 3} mais</span>` : ''}<span class="dots">${dots}</span></button>`;
  }
  const dayMs = (meetBy[sel] || []).slice().sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const dayTs = taskBy[sel] || [];
  const diaryE = S.diary.find((d) => d.entry_date === sel && d.content.trim());
  return `<section class="page">
    <div class="page-head cal-bar">
      <h1 class="cap">${MONTHS[m]} ${y}</h1>
      <button class="btn ghost" data-act="cal-today">Hoje</button>
      <button class="icon-btn" data-act="cal-prev" aria-label="Mês anterior">${ico('chevL')}</button>
      <button class="icon-btn" data-act="cal-next" aria-label="Próximo mês">${ico('chevR')}</button>
    </div>
    <div class="cal-layout">
      <div>
        <div class="cal-wd">${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal">${cells}</div>
      </div>
      <aside class="day-panel">
        <h2 class="cap">${esc(fmtLong(sel))}</h2>
        <button class="btn" data-act="new-meeting" data-date="${sel}">${ico('plus')}Reunião neste dia</button>
        <div class="group-title">Reuniões<span class="muted">${dayMs.length}</span></div>
        ${dayMs.length ? dayMs.map((x) => meetRow(x)).join('') : '<div class="empty" style="padding:10px 4px">Nenhuma reunião.</div>'}
        <div class="group-title">Prazos<span class="muted">${dayTs.length}</span></div>
        ${dayTs.length ? dayTs.map(taskRow).join('') : '<div class="empty" style="padding:10px 4px">Nenhum prazo.</div>'}
        ${diaryE ? `<div class="group-title">Diário</div><div class="row" data-act="diary-goto" data-date="${sel}" tabindex="0" role="button"><div class="row-main"><div class="row-sub" style="white-space:normal">${esc(firstLine(diaryE.content, 160))}</div></div></div>` : ''}
      </aside>
    </div>
  </section>`;
}

/* =========================================================
   Reuniões (lista) e modelos
   ========================================================= */
function vReunioes() {
  const kinds = [...new Set([...S.templates.map((t) => t.name), ...S.meetings.map((m) => m.kind)])];
  const list = S.meetings.filter((m) => !S.meetFilter || m.kind === S.meetFilter);
  const groups = {};
  list.forEach((m) => (groups[monthOf(m.meeting_date)] ||= []).push(m));
  return `<section class="page">
    <div class="page-head">
      <div><h1>Reuniões</h1><p class="page-sub">Todos os cadernos de reunião, do mais recente ao mais antigo.</p></div>
      <div class="head-actions">
        <button class="btn" data-act="open-templates">Modelos</button>
        <button class="btn primary" data-act="new-meeting">${ico('plus')}Nova reunião</button>
      </div>
    </div>
    <div class="tpl-tabs" style="margin-bottom:8px">
      <button class="chip ${!S.meetFilter ? 'on' : ''}" data-act="meet-filter" data-kind="">Todas</button>
      ${kinds.map((k) => `<button class="chip ${S.meetFilter === k ? 'on' : ''}" data-act="meet-filter" data-kind="${esc(k)}">${esc(k)}</button>`).join('')}
    </div>
    ${Object.keys(groups).length
      ? Object.entries(groups).map(([k, arr]) => `<h2 class="month-sep cap">${monthLabel(k)}</h2>${arr.map((m) => meetRow(m, true)).join('')}`).join('')
      : `<div class="empty">Nenhuma reunião ainda.<br><button class="btn primary" data-act="new-meeting">${ico('plus')}Abrir o primeiro caderno</button></div>`}
  </section>`;
}

function openTemplates(selId) {
  const list = S.templates;
  const blank = { id: '', name: '', agenda: '', key_points: KEY_POINTS_DEFAULT, default_tasks: [] };
  const cur = selId === 'new' ? blank : (byId(list, selId) || list[0] || blank);
  openModal(`
    <h3 class="modal-title">Modelos de reunião</h3>
    <p class="muted small">Cada modelo define a pauta, os pontos principais e as ações que já aparecem ao abrir o caderno.</p>
    <div class="tpl-tabs">
      ${list.map((t) => `<button class="chip ${t.id === cur.id ? 'on' : ''}" data-act="tpl-select" data-id="${t.id}">${esc(t.name)}</button>`).join('')}
      <button class="chip ${cur.id === '' ? 'on' : ''}" data-act="tpl-select" data-id="new">${ico('plus')}Novo modelo</button>
    </div>
    <form data-form="template" data-id="${cur.id}">
      <label>Nome<input name="name" required value="${esc(cur.name)}"></label>
      <label>Pauta (uma linha por assunto)<textarea name="agenda" rows="4">${esc(cur.agenda)}</textarea></label>
      <label>Pontos principais (começa numerado)<textarea name="key_points" rows="4">${esc(cur.key_points || KEY_POINTS_DEFAULT)}</textarea></label>
      <label>Ações pré-definidas (uma por linha)<textarea name="default_tasks" rows="4">${esc((cur.default_tasks || []).join('\n'))}</textarea></label>
      <div class="modal-actions">
        ${cur.id ? `<button type="button" class="btn danger" data-act="tpl-delete" data-id="${cur.id}">Excluir</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-act="modal-cancel">Fechar</button>
        <button class="btn primary">Salvar modelo</button>
      </div>
    </form>`, { wide: true });
}

/* =========================================================
   Caderno de reunião
   ========================================================= */
let NB = null;
const nbSaver = debounce(() => nbSave(), 800);
const hasContent = (m) => !!(m.title.trim() || m.observations.trim() || m.decisions.trim() || m.key_points.replace(/^\s*\d+[.)]\s*/gm, '').trim());

function openNotebook(id, opts = {}) {
  let m;
  if (id) {
    m = JSON.parse(JSON.stringify(byId(S.meetings, id)));
    m.actions = Array.isArray(m.actions) ? m.actions : [];
    m.start_time = hm(m.start_time);
  } else {
    const tpl = S.templates.find((t) => t.name === 'Geral') || S.templates[0];
    m = {
      id: null, title: '', meeting_date: opts.date || todayStr(), start_time: nowHM(), kind: tpl?.name || 'Geral',
      project_id: null, agenda: tpl?.agenda || '', key_points: tpl?.key_points || KEY_POINTS_DEFAULT,
      observations: '', decisions: '', status: 'Em andamento',
      actions: (tpl?.default_tasks || []).map((t) => ({ title: t, due: '', owner: '' })),
    };
  }
  NB = { m, dirty: false, saving: null, again: false };
  renderNotebook(opts.flip || 0);
}

const meetingsAsc = () => S.meetings.filter((m) => m.id).slice().sort((a, b) => (a.meeting_date + (hm(a.start_time) || '')).localeCompare(b.meeting_date + (hm(b.start_time) || '')));
function flipInfo() {
  const list = meetingsAsc();
  const id = NB.m.id;
  const i = id ? list.findIndex((x) => x.id === id) : -1;
  return {
    prev: id ? list[i - 1] : list[list.length - 1],
    next: id ? list[i + 1] : null,
    pos: i >= 0 ? `${i + 1} de ${list.length}` : 'Nova',
  };
}
async function nbFlip(dir) {
  if (!NB) return;
  await nbSettle();
  const f = flipInfo();
  const t = dir < 0 ? f.prev : f.next;
  if (!t) return;
  openNotebook(t.id, { flip: dir });
}

function renderNotebook(flip = 0) {
  const m = NB.m;
  const fl = flipInfo();
  const nb = $('#notebook');
  const fin = m.status === 'Finalizada';
  const kinds = [...new Set([...S.templates.map((t) => t.name), m.kind])];
  const sec = (title, f, rows) => `<section class="nb-sec"><h3>${title}</h3><textarea class="ruled" data-nb="${f}" rows="${rows}">${esc(m[f])}</textarea></section>`;
  nb.hidden = false;
  document.body.classList.add('nb-open');
  nb.innerHTML = `<div class="nb-shell">
    <header class="nb-bar">
      <div class="nb-flip" role="group" aria-label="Folhear reuniões">
        <button class="icon-btn" data-act="nb-flip" data-dir="-1" aria-label="Reunião anterior" title="Reunião anterior" ${fl.prev ? '' : 'disabled'}>${ico('chevL')}</button>
        <span class="nb-pos">${esc(fl.pos)}</span>
        <button class="icon-btn" data-act="nb-flip" data-dir="1" aria-label="Próxima reunião" title="Próxima reunião" ${fl.next ? '' : 'disabled'}>${ico('chevR')}</button>
      </div>
      <span class="save-state" id="nb-save" aria-live="polite"></span>
      <span class="spacer"></span>
      <button class="btn ghost" data-act="copy-ata" aria-label="Copiar ata" title="Copiar ata formatada">${ico('copy')}<span class="btn-t">Copiar ata</span></button>
      ${m.id ? '<button class="btn ghost" data-act="nb-delete" style="color:var(--danger)">Excluir</button>' : ''}
      ${fin ? '<span class="tag done">Registrada</span>' : '<button class="btn primary" id="nb-finish" data-act="nb-finish">Finalizar reunião</button>'}
      <button class="icon-btn" data-act="nb-close" aria-label="Fechar caderno" title="Fechar">${ico('x')}</button>
    </header>
    <article class="paper">
      <p class="paper-date" id="nb-date-long">${esc(fmtLong(m.meeting_date))} de ${m.meeting_date.slice(0, 4)}</p>
      <input class="paper-title" data-nb="title" placeholder="Título da reunião" value="${esc(m.title)}" autocomplete="off" aria-label="Título da reunião">
      <div class="meta">
        <label>Tipo<select data-nb="kind">${kinds.map((k) => `<option ${k === m.kind ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
        <label>Projeto<select data-nb="project_id"><option value="">Sem projeto</option>${S.projects.map((p) => `<option value="${p.id}" ${p.id === m.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label>Data<input type="date" data-nb="meeting_date" value="${m.meeting_date}"></label>
        <label>Hora<input type="time" data-nb="start_time" value="${esc(m.start_time || '')}"></label>
      </div>
      ${sec('Pauta', 'agenda', 3)}
      ${sec('Pontos principais', 'key_points', 5)}
      ${sec('Observações', 'observations', 4)}
      ${sec('Decisões', 'decisions', 3)}
      <section class="nb-sec"><h3>Ações e prazos</h3><div id="nb-actions"></div></section>
    </article>
  </div>`;
  nb.insertAdjacentHTML('afterbegin', flowMarkup());
  renderNbActions();
  $$('textarea', nb).forEach(autosize);
  if (flip) { nb.classList.add('open'); $('.paper', nb).classList.add(flip < 0 ? 'flip-prev' : 'flip-next'); }
  else { nb.classList.remove('open'); requestAnimationFrame(() => requestAnimationFrame(() => nb.classList.add('open'))); }
  nb.scrollTop = 0;
  setSaveState(m.id ? 'Todas as alterações salvas' : '');
  if (!m.id) setTimeout(() => $('[data-nb="title"]', nb)?.focus(), 350);
}

function renderNbActions() {
  const box = $('#nb-actions');
  if (!box || !NB) return;
  const m = NB.m;
  if (m.status === 'Finalizada') {
    const ts = S.tasks.filter((t) => t.meeting_id === m.id).sort(cmpDue);
    box.innerHTML = `${ts.length ? ts.map(taskRow).join('') : '<p class="muted">Esta reunião não gerou ações.</p>'}
      <div class="act-add"><input id="na-title" placeholder="Nova ação" aria-label="Nova ação"><input id="na-owner" list="owners" placeholder="Responsável" aria-label="Responsável" autocomplete="off"><input type="date" id="na-due" aria-label="Prazo"><button class="btn" data-act="nb-add-task">Adicionar</button></div>`;
    return;
  }
  box.innerHTML = `${m.actions.map((a, i) => `<div class="act-row">
      <span class="bullet"></span>
      <input data-ai="${i}" data-af="title" value="${esc(a.title)}" placeholder="Descreva a ação" aria-label="Ação ${i + 1}">
      <input data-ai="${i}" data-af="owner" list="owners" value="${esc(a.owner || '')}" placeholder="Responsável" autocomplete="off" aria-label="Responsável da ação ${i + 1}">
      <input type="date" data-ai="${i}" data-af="due" value="${esc(a.due || '')}" class="${a.due ? '' : 'nodue'}" aria-label="Prazo da ação ${i + 1}">
      <button class="icon-btn" data-act="nb-del-action" data-i="${i}" aria-label="Remover ação">${ico('x')}</button>
    </div>`).join('')}
    <button class="btn ghost" data-act="nb-add-action">${ico('plus')}Adicionar ação</button>
    <p class="nb-hint">Ao finalizar, cada ação vira uma tarefa com responsável e prazo, e a reunião entra no calendário.</p>`;
}

function setSaveState(txt, err = false) {
  const el = $('#nb-save');
  if (el) { el.textContent = txt; el.classList.toggle('err', err); }
}
function nbDirty() { NB.dirty = true; setSaveState('Salvando...'); nbSaver(); }

async function persistMeeting(nb) {
  const m = nb.m;
  if (!m.id && !hasContent(m)) return;
  const payload = {
    title: m.title || '', meeting_date: m.meeting_date || todayStr(), start_time: m.start_time || null,
    kind: m.kind, project_id: m.project_id || null, agenda: m.agenda, key_points: m.key_points,
    observations: m.observations, decisions: m.decisions,
    actions: m.actions.filter((a) => a.title.trim() || a.due),
  };
  if (m.id) await call(sb.from('meetings').update(payload).eq('id', m.id));
  else { const row = await call(sb.from('meetings').insert(payload).select().single()); m.id = row.id; }
  const idx = S.meetings.findIndex((x) => x.id === m.id);
  const obj = { ...(idx >= 0 ? S.meetings[idx] : { status: 'Em andamento', finished_at: null }), ...payload, id: m.id };
  if (idx >= 0) S.meetings[idx] = obj; else S.meetings.unshift(obj);
}
function nbSave(nb = NB) {
  if (!nb) return Promise.resolve();
  if (nb.saving) { nb.again = true; return nb.saving; }
  nb.saving = (async () => {
    try {
      do { nb.again = false; nb.dirty = false; await persistMeeting(nb); } while (nb.again);
      if (nb === NB) setSaveState(nb.m.id ? `Salvo às ${nowHM()}` : '');
    } catch (e) {
      nb.dirty = true;
      if (nb === NB) setSaveState('Não foi possível salvar. Vamos tentar de novo na próxima edição.', true);
    } finally { nb.saving = null; }
  })();
  return nb.saving;
}
async function nbSettle() {
  await nbSaver.flush();
  if (NB.saving) await NB.saving;
  if (NB.dirty) await nbSave();
}
function closeNotebook() {
  const nb = $('#notebook');
  nb.classList.remove('open');
  nb.hidden = true; nb.innerHTML = '';
  document.body.classList.remove('nb-open');
  NB = null;
  refreshUI();
}
async function nbClose() {
  await nbSettle();
  closeNotebook();
}

function applyKind(newKind) {
  const m = NB.m;
  const prev = S.templates.find((t) => t.name === m.kind);
  const next = S.templates.find((t) => t.name === newKind);
  if (next && m.status !== 'Finalizada') {
    if (!m.agenda.trim() || (prev && norm(m.agenda).trim() === norm(prev.agenda).trim())) {
      m.agenda = next.agenda;
      const ta = $('[data-nb="agenda"]'); ta.value = m.agenda; autosize(ta);
    }
    const prevDefaults = new Set(prev?.default_tasks || []);
    m.actions = m.actions.filter((a) => !(prevDefaults.has(a.title) && !a.due));
    (next.default_tasks || []).forEach((t) => { if (!m.actions.some((a) => a.title === t)) m.actions.push({ title: t, due: '', owner: '' }); });
    renderNbActions();
  }
  m.kind = newKind;
}

async function nbFinish() {
  const m = NB.m;
  if (!m.title.trim()) {
    toast('Dê um título à reunião antes de finalizar.', 'error');
    $('[data-nb="title"]')?.focus();
    return;
  }
  const acts = m.actions.filter((a) => a.title.trim());
  const noDue = acts.filter((a) => !a.due).length;
  if (noDue) {
    const ok = await confirmDialog(`${pl(noDue, 'ação está', 'ações estão')} sem prazo. Finalizar mesmo assim?`, 'Finalizar');
    if (!ok) return;
  }
  const btn = $('#nb-finish');
  if (btn) btn.disabled = true;
  try {
    await nbSaver.flush();
    if (NB.saving) await NB.saving;
    await nbSave();
    if (!m.id) throw new Error('Não foi possível salvar a reunião.');
    if (acts.length) {
      await call(sb.from('tasks').insert(acts.map((a) => ({
        title: a.title.trim(), due_date: a.due || null, owner: (a.owner || '').trim() || null, status: 'Pendente', meeting_id: m.id, project_id: m.project_id || null,
      }))));
      m.actions = [];
    }
    await call(sb.from('meetings').update({ status: 'Finalizada', finished_at: new Date().toISOString(), actions: [] }).eq('id', m.id));
    await reload('meetings', 'tasks');
    const d = parseYmd(m.meeting_date);
    S.cal = { y: d.getFullYear(), m: d.getMonth(), sel: m.meeting_date };
    closeNotebook();
    go('calendario');
    toast(acts.length ? `Reunião registrada com ${pl(acts.length, 'ação', 'ações')}.` : 'Reunião registrada no calendário.');
  } catch (e) {
    if (btn) btn.disabled = false;
  }
}

async function nbDelete() {
  const ok = await confirmDialog('Excluir esta reunião? As tarefas que ela gerou continuam existindo.', 'Excluir', true);
  if (!ok) return;
  const m = NB.m;
  nbSaver.flush(); if (NB.saving) await NB.saving;
  if (m.id) { await call(sb.from('meetings').delete().eq('id', m.id)); await reload('meetings', 'tasks'); }
  closeNotebook();
  toast('Reunião excluída.');
}

/* ---------- Ata formatada ---------- */
function ataText(m) {
  const fin = m.status === 'Finalizada';
  const acts = fin
    ? S.tasks.filter((t) => t.meeting_id === m.id).sort(cmpDue).map((t) => ({ title: t.title, due: t.due_date || '', owner: t.owner || '' }))
    : (m.actions || []).filter((a) => (a.title || '').trim()).map((a) => ({ title: a.title.trim(), due: a.due || '', owner: (a.owner || '').trim() }));
  const proj = byId(S.projects, m.project_id);
  const L = [`ATA DE REUNIÃO: ${(m.title || '').trim() || 'Sem título'}`];
  L.push(`Data: ${fmtFull(m.meeting_date)}${hm(m.start_time) ? ` às ${hm(m.start_time)}` : ''}`);
  L.push(`Tipo: ${m.kind}${proj ? ` | Projeto: ${proj.name}` : ''}`);
  const sec = (title, txt, numbered) => {
    let t = String(txt || '');
    if (numbered) t = t.split('\n').filter((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).join('\n');
    if (t.trim()) L.push('', title, t.trim());
  };
  sec('PAUTA', m.agenda);
  sec('PONTOS PRINCIPAIS', m.key_points, true);
  sec('OBSERVAÇÕES', m.observations);
  sec('DECISÕES', m.decisions);
  if (acts.length) {
    L.push('', 'AÇÕES E RESPONSÁVEIS');
    acts.forEach((a, i) => L.push(`${i + 1}. ${a.title} | Responsável: ${a.owner || 'a definir'} | Prazo: ${a.due ? fmtFull(a.due) : 'sem prazo'}`));
  }
  return L.join('\n');
}
async function copyAta(m) {
  const text = ataText(m);
  try {
    await navigator.clipboard.writeText(text);
    toast('Ata copiada. É só colar no e-mail ou no Teams.');
  } catch (e) {
    openModal(`<h3 class="modal-title">Copiar ata</h3>
      <p class="modal-text">Seu navegador não permitiu a cópia automática. Selecione o texto abaixo e copie (Ctrl+C).</p>
      <textarea id="ata-box" rows="14" readonly style="font-family:ui-monospace,Menlo,monospace;font-size:13px">${esc(text)}</textarea>
      <div class="modal-actions"><span class="spacer"></span><button class="btn primary" data-act="modal-cancel">Fechar</button></div>`, { wide: true });
    setTimeout(() => { const b = $('#ata-box'); if (b) { b.focus(); b.select(); } }, 60);
  }
}

/* =========================================================
   Tarefas
   ========================================================= */
function vTarefas() {
  const tasks = S.tasks.filter((t) => !S.boardProject || t.project_id === S.boardProject);
  const lanes = STATUSES.map((st) => {
    const arr = tasks.filter((t) => t.status === st).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    return `<div class="lane" data-status="${st}" style="--c:${SCOLOR[st]}">
      <div class="lane-head" style="--c:${SCOLOR[st]}">${esc(st)}<span class="count">${arr.length}</span></div>
      ${arr.map((x) => {
        const p = byId(S.projects, x.project_id);
        const late = !isDone(x.status) && x.due_date && x.due_date < todayStr();
        return `<article class="card" draggable="true" data-act="open-task" data-id="${x.id}" tabindex="0" role="button">
          <div class="card-title">${esc(x.title)}</div>
          <div class="card-meta">${x.due_date ? `<span class="due ${late ? 'late' : ''}" style="min-width:0">${fmtShort(x.due_date)}</span>` : ''}${p ? `<span>${esc(p.name)}</span>` : ''}${x.owner ? `<span class="own">${esc(x.owner)}</span>` : ''}${x.meeting_id ? '<span>de reunião</span>' : ''}</div>
        </article>`;
      }).join('')}
    </div>`;
  }).join('');
  return `<section class="page">
    <div class="page-head">
      <div><h1>Tarefas</h1><p class="page-sub">Arraste os cartões entre as colunas para mudar o status.</p></div>
      <div class="head-actions">
        <select data-bind="board-project" aria-label="Filtrar por projeto" style="width:auto">
          <option value="">Todos os projetos</option>
          ${S.projects.map((p) => `<option value="${p.id}" ${S.boardProject === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <button class="btn primary" data-act="new-task">${ico('plus')}Nova tarefa</button>
      </div>
    </div>
    <div class="board">${lanes}</div>
  </section>`;
}

function openTask(id, preset = {}) {
  const x = id ? byId(S.tasks, id) : { title: '', notes: '', owner: '', status: 'Pendente', due_date: preset.due || '', project_id: preset.project_id || '', meeting_id: preset.meeting_id || '' };
  if (!x) return;
  openModal(`
    <h3 class="modal-title">${id ? 'Tarefa' : 'Nova tarefa'}</h3>
    <form data-form="task" data-id="${id || ''}">
      <label>Título<input name="title" required value="${esc(x.title)}"></label>
      <div class="two">
        <label>Status<select name="status">${STATUSES.map((s) => `<option ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Prazo<input type="date" name="due_date" value="${esc(x.due_date || '')}"></label>
      </div>
      <div class="two">
        <label>Projeto<select name="project_id"><option value="">Sem projeto</option>${S.projects.map((p) => `<option value="${p.id}" ${p.id === x.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label>Responsável<input name="owner" list="owners" autocomplete="off" placeholder="Nome" value="${esc(x.owner || '')}"></label>
      </div>
      <label>Notas<textarea name="notes" rows="3">${esc(x.notes || '')}</textarea></label>
      ${x.meeting_id ? `<button type="button" class="link" data-act="open-meeting" data-id="${x.meeting_id}">Abrir a reunião de origem</button>` : ''}
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn danger" data-act="task-delete" data-id="${id}">Excluir</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-act="modal-cancel">Cancelar</button>
        <button class="btn primary">Salvar</button>
      </div>
    </form>`);
}

async function submitTask(form) {
  const f = new FormData(form);
  const id = form.dataset.id;
  const old = id ? byId(S.tasks, id) : null;
  const status = f.get('status');
  const patch = {
    title: String(f.get('title')).trim(), status,
    due_date: f.get('due_date') || null, project_id: f.get('project_id') || null,
    notes: String(f.get('notes')).trim() || null, owner: String(f.get('owner') || '').trim() || null,
    completed_at: isDone(status) ? (old?.completed_at || new Date().toISOString()) : null,
  };
  if (!patch.title) return;
  if (id) await call(sb.from('tasks').update(patch).eq('id', id));
  else await call(sb.from('tasks').insert(patch));
  await reload('tasks');
  closeModal(); refreshUI(); toast('Tarefa salva.');
}
async function setTaskStatus(id, status) {
  const t = byId(S.tasks, id);
  const patch = { status, completed_at: isDone(status) ? (t.completed_at || new Date().toISOString()) : null };
  await call(sb.from('tasks').update(patch).eq('id', id));
  Object.assign(t, patch);
  refreshUI();
}

/* =========================================================
   Projetos
   ========================================================= */
const projStats = (id) => {
  const ts = S.tasks.filter((t) => t.project_id === id);
  const done = ts.filter((t) => isDone(t.status)).length;
  return { total: ts.length, done, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
};
function vProjetos() {
  return `<section class="page">
    <div class="page-head">
      <div><h1>Projetos</h1><p class="page-sub">Cada projeto mostra o status e o avanço com base nas tarefas ligadas a ele.</p></div>
      <div class="head-actions"><button class="btn primary" data-act="new-project">${ico('plus')}Novo projeto</button></div>
    </div>
    ${S.projects.length ? `<div class="proj-grid">${S.projects.map((p) => {
      const st = projStats(p.id);
      return `<article class="proj" data-act="open-project" data-id="${p.id}" tabindex="0" role="button">
        <div class="proj-top"><span class="proj-name">${esc(p.name)}</span>${pill(p.status)}</div>
        <p class="proj-desc">${esc(p.description || '')}</p>
        <div class="bar"><i style="width:${st.pct}%"></i></div>
        <span class="muted small">${st.total ? `${st.done} de ${pl(st.total, 'tarefa concluída', 'tarefas concluídas')} (${st.pct}%)` : 'Nenhuma tarefa ligada ainda'}</span>
      </article>`;
    }).join('')}</div>` : `<div class="empty">Nenhum projeto ainda. Crie um para acompanhar fluxos e entregas.<br><button class="btn primary" data-act="new-project">${ico('plus')}Novo projeto</button></div>`}
  </section>`;
}
function openProject(id) {
  const p = id ? byId(S.projects, id) : { name: '', description: '', status: 'Pendente' };
  openModal(`
    <h3 class="modal-title">${id ? 'Projeto' : 'Novo projeto'}</h3>
    <form data-form="project" data-id="${id || ''}">
      <label>Nome<input name="name" required value="${esc(p.name)}"></label>
      <label>Status<select name="status">${STATUSES.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Descrição<textarea name="description" rows="3">${esc(p.description || '')}</textarea></label>
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn danger" data-act="project-delete" data-id="${id}">Excluir</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-act="modal-cancel">Cancelar</button>
        <button class="btn primary">Salvar</button>
      </div>
    </form>`);
}

/* =========================================================
   Diário
   ========================================================= */
let diaryDirty = false;
const diarySaver = debounce(async (date, content) => {
  try {
    const row = await call(sb.from('diary_entries').upsert(
      { user_id: S.user.id, entry_date: date, content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,entry_date' }
    ).select().single());
    const e = S.diary.find((d) => d.entry_date === date);
    if (e) { e.id = row.id; e.updated_at = row.updated_at; }
    diaryDirty = false;
    $$('.diary-state').forEach((el) => { el.textContent = `Salvo às ${nowHM()}`; el.classList.remove('err'); });
  } catch (err) {
    $$('.diary-state').forEach((el) => { el.textContent = 'Não foi possível salvar'; el.classList.add('err'); });
  }
}, 800);
function setDiaryLocal(date, content) {
  const e = S.diary.find((d) => d.entry_date === date);
  if (e) e.content = content;
  else { S.diary.unshift({ id: null, entry_date: date, content }); S.diary.sort((a, b) => b.entry_date.localeCompare(a.entry_date)); }
}
function vDiario() {
  const sel = S.diarySel || todayStr();
  const entry = S.diary.find((d) => d.entry_date === sel);
  const days = S.diary.filter((d) => d.content.trim()).slice(0, 80);
  const ms = S.meetings.filter((m) => m.meeting_date === sel);
  const doneT = S.tasks.filter((t) => isDone(t.status) && taskDay(t) === sel);
  const dueT = S.tasks.filter((t) => !isDone(t.status) && taskDay(t) === sel);
  return `<section class="page">
    <div class="page-head"><div><h1>Diário</h1><p class="page-sub">O que você fez em cada dia. Esse histórico alimenta o relatório mensal.</p></div>
      <div class="head-actions"><button class="btn" data-act="diary-goto" data-date="${todayStr()}">Ir para hoje</button></div></div>
    <div class="split">
      <nav class="side-list" aria-label="Dias com anotações">
        ${days.length ? days.map((d) => `<button class="side-item ${d.entry_date === sel ? 'on' : ''}" data-act="diary-goto" data-date="${d.entry_date}">${esc(fmtFull(d.entry_date))}<small>${esc(firstLine(d.content, 60))}</small></button>`).join('') : '<p class="muted small" style="padding:10px 14px">Nenhuma anotação ainda.</p>'}
      </nav>
      <div>
        <div class="editor-head">
          <h2 class="cap">${esc(fmtLong(sel))}</h2>
          <div class="head-actions"><span class="save-state diary-state"></span><input type="date" data-bind="diary-date" value="${sel}" style="width:auto" aria-label="Escolher data"></div>
        </div>
        <div class="pane"><textarea class="ruled" data-diary="${sel}" rows="12" placeholder="Escreva o que fez neste dia.">${esc(entry?.content || '')}</textarea></div>
        <div class="day-extra" id="day-extra">
          ${ms.length ? `<div class="group-title">Reuniões do dia<span class="muted">${ms.length}</span></div>${ms.map((m) => meetRow(m)).join('')}` : ''}
          ${doneT.length ? `<div class="group-title">Tarefas concluídas neste dia<span class="muted">${doneT.length}</span></div>${doneT.map((t) => taskRow(t, true)).join('')}` : ''}
          ${dueT.length ? `<div class="group-title">Tarefas pendentes com prazo neste dia<span class="muted">${dueT.length}</span></div>${dueT.map((t) => taskRow(t, true)).join('')}` : ''}
          ${doneT.length || dueT.length ? '' : '<p class="muted small day-none">Nenhuma tarefa neste dia.</p>'}
        </div>
      </div>
    </div>
  </section>`;
}

/* =========================================================
   Relatórios e Gestão
   ========================================================= */
function monthKeys() {
  const s = new Set([monthOf(todayStr())]);
  S.reports.forEach((r) => s.add(monthOf(r.month)));
  S.meetings.forEach((m) => s.add(monthOf(m.meeting_date)));
  S.diary.forEach((d) => s.add(monthOf(d.entry_date)));
  S.tasks.forEach((t) => { if (t.completed_at) s.add(monthOf(localDateOf(t.completed_at))); if (t.due_date) s.add(monthOf(t.due_date)); });
  return [...s].sort().reverse();
}
const reportOf = (key) => S.reports.find((r) => monthOf(r.month) === key);
function monthData(key) {
  const ms = S.meetings.filter((m) => m.status === 'Finalizada' && monthOf(m.meeting_date) === key).sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
  const doneT = S.tasks.filter((t) => isDone(t.status) && t.completed_at && monthOf(localDateOf(t.completed_at)) === key).sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  const open = S.tasks.filter((t) => !isDone(t.status)).sort(cmpDue);
  const late = open.filter((t) => t.due_date && t.due_date < todayStr());
  const diary = S.diary.filter((d) => monthOf(d.entry_date) === key && d.content.trim()).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  return { ms, doneT, open, late, diary };
}
function reportDraft(key) {
  const { ms, doneT, open, late, diary } = monthData(key);
  const L = [];
  L.push(`Resumo de ${monthLabel(key)}`, '');
  L.push('Visão geral');
  L.push(`- Reuniões realizadas: ${ms.length}`);
  L.push(`- Tarefas concluídas no mês: ${doneT.length}`);
  L.push(`- Tarefas em aberto hoje: ${open.length}${late.length ? ` (${late.length} com prazo vencido)` : ''}`, '');
  L.push('Reuniões e decisões');
  if (ms.length) ms.forEach((m) => L.push(`- ${fmtShort(m.meeting_date)} ${m.title} (${m.kind})${firstLine(m.decisions) ? `: ${firstLine(m.decisions)}` : ''}`)); else L.push('- Nenhuma reunião registrada.');
  L.push('', 'Entregas concluídas');
  if (doneT.length) doneT.forEach((t) => { const p = byId(S.projects, t.project_id); L.push(`- ${t.title}${p ? ` (${p.name})` : ''}, concluída em ${fmtShort(localDateOf(t.completed_at))}`); }); else L.push('- Nenhuma tarefa concluída.');
  L.push('', 'Pendências para o próximo período');
  if (open.length) open.slice(0, 15).forEach((t) => L.push(`- ${t.title}${t.due_date ? `, prazo ${fmtShort(t.due_date)}` : ', sem prazo'}`)); else L.push('- Nenhuma pendência.');
  if (diary.length) { L.push('', 'Atividades registradas no diário'); diary.forEach((d) => L.push(`- ${fmtShort(d.entry_date)}: ${firstLine(d.content)}`)); }
  return L.join('\n');
}

let reportDirty = false;
const reportSaver = debounce(async (key, title, content) => {
  try {
    const row = await call(sb.from('reports').upsert(
      { user_id: S.user.id, month: `${key}-01`, title, content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,month' }
    ).select().single());
    const i = S.reports.findIndex((r) => monthOf(r.month) === key);
    if (i >= 0) S.reports[i] = row; else S.reports.unshift(row);
    reportDirty = false;
    const el = $('#rep-state'); if (el) { el.textContent = `Salvo às ${nowHM()}`; el.classList.remove('err'); }
    const sm = $('.side-item.on small'); if (sm && S.repMonth === key) sm.textContent = 'Relatório salvo';
  } catch (e) {
    const el = $('#rep-state'); if (el) { el.textContent = 'Não foi possível salvar'; el.classList.add('err'); }
  }
}, 900);

function vRelatorios() {
  const keys = monthKeys();
  const key = S.repMonth && keys.includes(S.repMonth) ? S.repMonth : keys[0];
  S.repMonth = key;
  const rep = reportOf(key);
  return `<section class="page">
    <div class="page-head"><div><h1>Relatórios</h1><p class="page-sub">Um relatório por mês. Gere o rascunho a partir do que você registrou e ajuste o texto.</p></div></div>
    <div class="split">
      <nav class="side-list" aria-label="Meses">
        ${keys.map((k) => `<button class="side-item cap ${k === key ? 'on' : ''}" data-act="rep-select" data-key="${k}">${monthLabel(k)}<small>${reportOf(k) ? 'Relatório salvo' : 'Sem relatório'}</small></button>`).join('')}
      </nav>
      <div>
        <div class="editor-head">
          <input class="title-input" data-rep="title" value="${esc(rep?.title || `Relatório de ${monthLabel(key)}`)}" aria-label="Título do relatório" style="flex:1;min-width:240px">
          <span class="save-state" id="rep-state"></span>
        </div>
        <div class="head-actions no-print" style="margin-bottom:18px">
          <button class="btn" data-act="rep-generate">Gerar rascunho do mês</button>
          <button class="btn ghost" data-act="rep-open-gestao">${ico('chart')}Ver na Gestão</button>
        </div>
        <div class="pane"><textarea class="ruled report-area" data-rep="content" rows="16" placeholder="Escreva o relatório ou use Gerar rascunho do mês.">${esc(rep?.content || '')}</textarea></div>
      </div>
    </div>
  </section>`;
}

const safeUrl = (u) => {
  const t = String(u || '').trim();
  if (!t) return null;
  try { const x = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; }
};
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

function vGestao() {
  const tab = ['relatorio', 'timeline', 'links'].includes(S.gesTab) ? S.gesTab : 'relatorio';
  const tabs = [['relatorio', 'Relatório do mês'], ['timeline', 'Linha do tempo'], ['links', 'Links por projeto']];
  const keys = monthKeys();
  const key = S.gesMonth && keys.includes(S.gesMonth) ? S.gesMonth : monthOf(todayStr());
  S.gesMonth = key;
  const sub = { relatorio: 'Visão limpa para a supervisão. Exporte em PDF pelo botão ao lado.', timeline: 'Todas as reuniões em ordem. Clique em uma para ver as anotações.', links: 'Os principais links de cada projeto, num só lugar.' }[tab];
  const actions = tab === 'relatorio'
    ? `<select data-bind="ges-month" aria-label="Mês" style="width:auto">${keys.map((k) => `<option value="${k}" ${k === key ? 'selected' : ''}>${esc(cap(monthLabel(k)))}</option>`).join('')}</select>
       <button class="btn primary" data-act="ges-print">${ico('print')}Exportar PDF</button>`
    : tab === 'timeline'
      ? `<select data-bind="tl-project" aria-label="Filtrar por projeto" style="width:auto"><option value="">Todos os projetos</option>${S.projects.map((p) => `<option value="${p.id}" ${S.tlProject === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`
      : '';
  const body = tab === 'timeline' ? gesTimeline() : tab === 'links' ? gesLinks() : gesRelatorio(key);
  return `<section class="page">
    <div class="page-head no-print">
      <div><h1>Gestão</h1><p class="page-sub">${sub}</p></div>
      <div class="head-actions">${actions}</div>
    </div>
    <div class="tabs no-print" role="tablist" aria-label="Seções da Gestão">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" role="tab" aria-selected="${k === tab}" data-act="ges-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}
  </section>`;
}

function gesRelatorio(key) {
  const { ms, doneT, open, late } = monthData(key);
  const rep = reportOf(key);
  const t = todayStr();
  return `
    <article class="doc">
      <header class="doc-head">
        <div><h1>Relatório de gestão</h1><p class="sub">${esc(cap(monthLabel(key)))}</p></div>
        <p class="doc-by">Preparado por ${esc(CFG.OWNER_NAME)}<br>Emitido em ${fmtFull(t)}</p>
      </header>
      <div class="kpis">
        <div class="kpi"><b>${ms.length}</b><span>${ms.length === 1 ? 'reunião realizada' : 'reuniões realizadas'}</span></div>
        <div class="kpi"><b>${doneT.length}</b><span>${doneT.length === 1 ? 'entrega concluída' : 'entregas concluídas'}</span></div>
        <div class="kpi"><b>${open.length}</b><span>${open.length === 1 ? 'pendência em aberto' : 'pendências em aberto'}</span></div>
        <div class="kpi ${late.length ? 'warn' : ''}"><b>${late.length}</b><span>com prazo vencido</span></div>
      </div>
      <section>
        <h2>Projetos</h2>
        ${S.projects.length ? `<div class="t-row head"><span>Projeto</span><span>Status</span><span>Avanço</span><span>Tarefas</span></div>${S.projects.map((p) => {
          const st = projStats(p.id);
          return `<div class="t-row"><span>${esc(p.name)}</span>${pill(p.status)}<div class="bar"><i style="width:${st.pct}%"></i></div><span>${st.done}/${st.total}</span></div>`;
        }).join('')}` : '<p class="muted">Nenhum projeto cadastrado.</p>'}
      </section>
      <section>
        <h2>Reuniões do mês</h2>
        ${ms.length ? ms.map((m) => `<div class="item"><div class="item-top"><span class="dt">${fmtShort(m.meeting_date)}</span><span class="t">${esc(m.title)}</span><span class="st">${esc(m.kind)}</span></div>${firstLine(m.decisions) ? `<p>${esc(m.decisions.trim())}</p>` : ''}</div>`).join('') : '<p class="muted">Nenhuma reunião registrada neste mês.</p>'}
      </section>
      <section>
        <h2>Entregas concluídas no mês</h2>
        ${doneT.length ? doneT.map((x) => { const p = byId(S.projects, x.project_id); return `<div class="item"><div class="item-top has-pj"><span class="dt">${fmtShort(localDateOf(x.completed_at))}</span><span class="st">${pill(x.status)}</span><span class="t">${esc(x.title)}</span>${p ? `<span class="pj">${esc(p.name)}</span>` : ''}</div></div>`; }).join('') : '<p class="muted">Nenhuma tarefa concluída neste mês.</p>'}
      </section>
      <section>
        <h2>Pendências em aberto</h2>
        ${open.length ? open.slice(0, 25).map((x) => { const p = byId(S.projects, x.project_id); const lt = x.due_date && x.due_date < t; return `<div class="item"><div class="item-top"><span class="dt">${x.due_date ? fmtShort(x.due_date) : '--/--'}</span><span class="t">${esc(x.title)}</span><span class="st" style="${lt ? 'color:var(--danger)' : ''}">${lt ? 'Prazo vencido' : (x.due_date ? 'No prazo' : 'Sem prazo')} ${pill(x.status)}</span></div>${p ? `<p>${esc(p.name)}</p>` : ''}</div>`; }).join('') : '<p class="muted">Nenhuma pendência em aberto.</p>'}
      </section>
      ${gesLinksDoc()}
      ${rep && rep.content.trim() ? `<section><h2>Resumo do mês</h2><div class="prose">${esc(rep.content)}</div></section>` : ''}
    </article>`;
}

function gesLinksDoc() {
  const withLinks = S.projects.filter((p) => S.links.some((l) => l.project_id === p.id));
  if (!withLinks.length) return '';
  return `<section><h2>Links principais</h2>${withLinks.map((p) => `<div class="item"><div class="item-top"><span class="t">${esc(p.name)}</span></div>${S.links.filter((l) => l.project_id === p.id).map((l) => `<p class="lk-doc"><a href="${esc(safeUrl(l.url) || '#')}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a> <span class="lk-u">${esc(l.url)}</span></p>`).join('')}</div>`).join('')}</section>`;
}

/* ---------- Linha do tempo ---------- */
function tlDetail(m) {
  const fin = m.status === 'Finalizada';
  const acts = fin
    ? S.tasks.filter((t) => t.meeting_id === m.id).sort(cmpDue).map((t) => ({ title: t.title, due: t.due_date || '', owner: t.owner || '', status: t.status }))
    : (Array.isArray(m.actions) ? m.actions : []).filter((a) => (a.title || '').trim()).map((a) => ({ title: a.title, due: a.due || '', owner: a.owner || '' }));
  const part = (title, txt, numbered) => {
    let t = String(txt || '');
    if (numbered) t = t.split('\n').filter((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).join('\n');
    return t.trim() ? `<div class="tl-sec"><h4>${title}</h4><div class="prose">${esc(t.trim())}</div></div>` : '';
  };
  const body = [part('Pauta', m.agenda), part('Pontos principais', m.key_points, true), part('Observações', m.observations), part('Decisões', m.decisions)].join('');
  const actsHtml = acts.length ? `<div class="tl-sec"><h4>Ações</h4>${acts.map((a) => `<div class="tl-act"><span class="bullet"></span><span class="tl-at">${esc(a.title)}</span><span class="tl-ao">${esc(a.owner || 'a definir')}</span><span class="tl-ad">${a.due ? fmtShort(a.due) : 'sem prazo'}</span>${a.status ? pill(a.status) : ''}</div>`).join('')}</div>` : '';
  return `${body || actsHtml ? body + actsHtml : '<p class="muted">Esta reunião não tem anotações.</p>'}
    <div class="tl-btns"><button class="btn" data-act="open-meeting" data-id="${m.id}">Abrir caderno</button><button class="btn ghost" data-act="copy-ata-id" data-id="${m.id}">${ico('copy')}Copiar ata</button></div>`;
}
function tlItem(m) {
  const proj = byId(S.projects, m.project_id);
  const open = S.tlOpen === m.id;
  const n = m.status === 'Finalizada' ? S.tasks.filter((t) => t.meeting_id === m.id).length : (Array.isArray(m.actions) ? m.actions.filter((a) => (a.title || '').trim()).length : 0);
  return `<div class="tl-item ${open ? 'open' : ''}" data-id="${m.id}">
    <button class="tl-head" data-act="tl-toggle" data-id="${m.id}" aria-expanded="${open}">
      <span class="tl-dot"></span>
      <span class="tl-date">${fmtShort(m.meeting_date)}<small>${esc(hm(m.start_time))}</small></span>
      <span class="tl-main"><b>${esc(m.title || 'Reunião sem título')}</b><small>${esc(m.kind)}${proj ? ` · ${esc(proj.name)}` : ''}${n ? ` · ${pl(n, 'ação', 'ações')}` : ''}</small></span>
      ${m.status === 'Finalizada' ? '<span class="tag done">Registrada</span>' : '<span class="tag draft">Rascunho</span>'}
      <span class="tl-chev">${ico('chevR')}</span>
    </button>
    <div class="tl-detail">${open ? tlDetail(m) : ''}</div>
  </div>`;
}
function gesTimeline() {
  const ms = S.meetings.filter((m) => !S.tlProject || m.project_id === S.tlProject);
  if (!ms.length) return '<div class="empty">Nenhuma reunião por aqui ainda.</div>';
  let html = '', cur = '';
  ms.forEach((m) => {
    const k = monthOf(m.meeting_date);
    if (k !== cur) { if (cur) html += '</div>'; cur = k; html += `<div class="tl-month"><h2>${esc(cap(monthLabel(k)))}</h2>`; }
    html += tlItem(m);
  });
  return `<div class="tl">${html}</div></div>`.replace('<div class="tl">', '<div class="tl">');
}

/* ---------- Links por projeto ---------- */
function gesLinks() {
  if (!S.projects.length) return '<div class="empty">Cadastre um projeto para anexar links a ele.</div>';
  return `<div class="lk-wrap">${S.projects.map((p) => {
    const ls = S.links.filter((l) => l.project_id === p.id);
    return `<section class="lk-proj">
      <div class="lk-head"><h2>${esc(p.name)}</h2><span class="muted">${pl(ls.length, 'link', 'links')}</span></div>
      ${ls.map((l) => `<div class="lk-row"><a href="${esc(safeUrl(l.url) || '#')}" target="_blank" rel="noopener noreferrer">${ico('link')}<span class="lk-t">${esc(l.title)}</span><span class="lk-u">${esc(hostOf(l.url))}</span></a><button class="icon-btn" data-act="link-delete" data-id="${l.id}" aria-label="Remover link ${esc(l.title)}">${ico('x')}</button></div>`).join('')}
      <form class="lk-add" data-form="link" data-project="${p.id}"><input name="title" placeholder="Nome do link" required autocomplete="off" aria-label="Nome do link"><input name="url" placeholder="https://..." required inputmode="url" autocomplete="off" aria-label="Endereço do link"><button class="btn">Adicionar</button></form>
    </section>`;
  }).join('')}</div>`;
}

/* =========================================================
   Busca global
   ========================================================= */
const P = { kind: 'all', project: '', sel: 0, results: [], tokens: [] };
const KIND_LABEL = { reuniao: 'Reunião', tarefa: 'Tarefa', diario: 'Diário', relatorio: 'Relatório' };

function searchDocs() {
  const d = [];
  S.meetings.forEach((m) => d.push({ kind: 'reuniao', id: m.id, title: m.title || 'Reunião sem título', body: [m.agenda, m.key_points, m.observations, m.decisions, byId(S.projects, m.project_id)?.name, m.kind].filter(Boolean).join('\n'), date: m.meeting_date, project_id: m.project_id }));
  S.tasks.forEach((t) => d.push({ kind: 'tarefa', id: t.id, title: t.title, body: [t.notes, byId(S.projects, t.project_id)?.name].filter(Boolean).join('\n'), date: t.due_date, project_id: t.project_id }));
  S.diary.forEach((e) => { if (e.content.trim()) d.push({ kind: 'diario', id: e.entry_date, title: `Diário de ${fmtFull(e.entry_date)}`, body: e.content, date: e.entry_date }); });
  S.reports.forEach((r) => d.push({ kind: 'relatorio', id: monthOf(r.month), title: r.title, body: r.content, date: r.month }));
  return d;
}
function parseDateQuery(q) {
  let m;
  if ((m = q.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) { const s = `${m[3]}-${pad(m[2])}-${pad(m[1])}`; return (d) => d === s; }
  if ((m = q.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return (d) => d === q;
  if ((m = q.match(/^(\d{1,2})[\/.-](\d{1,2})$/))) { const s = `-${pad(m[2])}-${pad(m[1])}`; return (d) => d.slice(4, 10) === s; }
  if ((m = q.match(/^(\d{1,2})[\/.-](\d{4})$/))) { const s = `${m[2]}-${pad(m[1])}`; return (d) => d.slice(0, 7) === s; }
  return null;
}
function hl(text, tokens) {
  const nt = norm(text);
  if (nt.length !== text.length || !tokens.length) return esc(text);
  const mk = new Array(text.length).fill(false);
  tokens.forEach((tk) => { if (!tk) return; let i = nt.indexOf(tk); while (i >= 0) { for (let k = i; k < i + tk.length; k++) mk[k] = true; i = nt.indexOf(tk, i + tk.length); } });
  let out = '', open = false;
  for (let i = 0; i < text.length; i++) {
    if (mk[i] && !open) { out += '<mark>'; open = true; }
    if (!mk[i] && open) { out += '</mark>'; open = false; }
    out += esc(text[i]);
  }
  return open ? `${out}</mark>` : out;
}
function snippetOf(body, tokens) {
  const flat = String(body || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const nf = norm(flat);
  let idx = -1;
  tokens.forEach((tk) => { const i = nf.indexOf(tk); if (i >= 0 && (idx < 0 || i < idx)) idx = i; });
  if (nf.length !== flat.length) return esc(flat.slice(0, 150));
  const start = Math.max(0, (idx < 0 ? 0 : idx) - 45);
  const piece = flat.slice(start, start + 150);
  return `${start > 0 ? '...' : ''}${hl(piece, tokens)}`;
}
function runSearch(raw) {
  const q = raw.trim();
  const docs = searchDocs().filter((d) => (P.kind === 'all' || d.kind === P.kind) && (!P.project || d.project_id === P.project));
  if (!q) {
    P.tokens = [];
    return docs.filter((d) => d.kind === 'reuniao' || d.kind === 'tarefa').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8).map((d) => ({ ...d, snip: esc(firstLine(d.body, 110)) }));
  }
  const dq = parseDateQuery(q);
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  P.tokens = dq ? [] : tokens;
  const out = [];
  docs.forEach((d) => {
    let score = 0;
    if (dq) { if (!(d.date && dq(String(d.date)))) return; score = 50; }
    else {
      const nt = norm(d.title), nb = norm(d.body);
      if (!tokens.every((tk) => nt.includes(tk) || nb.includes(tk))) return;
      score = tokens.reduce((s, tk) => s + (nt.includes(tk) ? 10 : 1), 0);
    }
    out.push({ ...d, score, snip: dq ? esc(firstLine(d.body, 110)) : snippetOf(d.body, tokens) });
  });
  return out.sort((a, b) => b.score - a.score || (b.date || '').localeCompare(a.date || '')).slice(0, 40);
}
/* ---------- Registro central de comandos ---------- */
const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const MOD = isMac ? '⌘' : 'Ctrl';
function kbdLabel(s) { return s.replace('Ctrl', MOD).replace('Alt', isMac ? '⌥' : 'Alt'); }
{ const sk = $('.search-btn kbd'); if (sk) sk.textContent = `${MOD} K`; }
const RECENT_KEY = 'pandora-recent-cmds';
const recentCmds = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } };
const pushRecent = (id) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCmds().filter((x) => x !== id)].slice(0, 4))); } catch (e) { /* sem armazenamento */ } };
const NAV_KEYS = {
  hoje: 'inicio painel dia resumo', calendario: 'agenda mes eventos datas', reunioes: 'cadernos atas lista', tarefas: 'quadro kanban pendencias status',
  projetos: 'avanco andamento', diario: 'registro anotacoes dia', relatorios: 'mensal mes passado', gestao: 'supervisao pdf visao',
};
function getCommands() {
  const c = [
    { id: 'nb-ata', group: 'Caderno aberto', title: 'Copiar ata desta reunião', hint: 'Texto formatado com responsáveis e prazos', icon: 'copy', keys: 'ata copiar', when: () => !!NB, run: () => copyAta(NB.m) },
    { id: 'nb-finish', group: 'Caderno aberto', title: 'Finalizar reunião', hint: 'Registra no calendário e cria as tarefas', icon: 'check', keys: 'registrar encerrar', when: () => NB && NB.m.status !== 'Finalizada', run: () => nbFinish() },
    { id: 'nb-prev', group: 'Caderno aberto', title: 'Reunião anterior', hint: 'Folhear para trás', icon: 'chevL', keys: 'voltar folhear', when: () => !!NB, run: () => nbFlip(-1) },
    { id: 'nb-next', group: 'Caderno aberto', title: 'Próxima reunião', hint: 'Folhear para frente', icon: 'chevR', keys: 'avancar folhear', when: () => !!NB, run: () => nbFlip(1) },
    { id: 'new-meeting', group: 'Ações', title: 'Nova reunião', hint: 'Abre o caderno com a data de hoje', icon: 'note', keys: 'caderno ata criar abrir', kbd: 'Alt N', leaveNb: true, run: () => openNotebook(null) },
    { id: 'new-task', group: 'Ações', title: 'Nova tarefa', hint: 'Com status, prazo e responsável', icon: 'check', keys: 'criar pendencia atividade', run: () => openTask(null) },
    { id: 'quick', group: 'Ações', title: 'Captura rápida', hint: 'Anote algo em segundos', icon: 'bolt', keys: 'anotar lembrar rapido', kbd: 'Ctrl J', run: () => qcSet(true) },
    { id: 'diary-today', group: 'Ações', title: 'Escrever no diário de hoje', hint: 'Registre o que você fez', icon: 'book', keys: 'diario registro dia', leaveNb: true, run: () => { S.diarySel = todayStr(); go('diario'); } },
    { id: 'new-project', group: 'Ações', title: 'Novo projeto', icon: 'layers', keys: 'criar', more: true, run: () => openProject(null) },
    { id: 'templates', group: 'Ações', title: 'Modelos de reunião', hint: 'Pauta e ações pré-definidas', icon: 'file', keys: 'pauta preset', more: true, run: () => openTemplates() },
  ];
  Object.entries(VIEWS).forEach(([k, v]) => c.push({ id: `go-${k}`, group: 'Ir para', title: v.label, hint: k === currentRoute ? 'Você está aqui' : '', icon: v.icon, keys: `abrir tela pagina ${NAV_KEYS[k] || ''}`, leaveNb: true, run: () => go(k) }));
  c.push(
    { id: 'go-timeline', group: 'Ir para', title: 'Gestão: linha do tempo', hint: 'Reuniões em ordem, com anotações', icon: 'chart', keys: 'gestao reunioes historico', more: true, leaveNb: true, run: () => { S.gesTab = 'timeline'; go('gestao'); } },
    { id: 'go-links', group: 'Ir para', title: 'Gestão: links por projeto', hint: 'Links principais de cada projeto', icon: 'link', keys: 'gestao anexos', more: true, leaveNb: true, run: () => { S.gesTab = 'links'; go('gestao'); } },
    { id: 'print', group: 'Sistema', title: 'Exportar relatório de gestão (PDF)', icon: 'print', keys: 'imprimir pdf supervisao', more: true, leaveNb: true, run: () => { S.gesTab = 'relatorio'; go('gestao'); setTimeout(() => ACTIONS['ges-print'](), 450); } },
    { id: 'backup', group: 'Sistema', title: 'Baixar backup (JSON)', icon: 'download', keys: 'exportar dados', more: true, run: () => ACTIONS['export-backup']() },
    { id: 'theme', group: 'Sistema', title: 'Trocar a cor do tema', hint: `Agora: ${themeById(themeId).label}. Cada uso passa para a próxima`, icon: 'palette', keys: 'tema cor aparencia visual esmeralda rubi ouro prata vermelho dourado verde', more: true, run: () => nextTheme() },
    { id: 'motion', group: 'Sistema', title: motionOn ? 'Desligar o movimento do fundo' : 'Ligar o movimento do fundo', hint: 'Luzes suaves que percorrem as curvas do fundo', icon: 'waves', keys: 'movimento animacao animado fundo curvas luzes parar pausar ligar desligar', more: true, run: () => toggleMotion() },
    { id: 'account', group: 'Sistema', title: 'Conta e senha', icon: 'user', keys: 'trocar senha perfil', more: true, run: () => openAccount() },
    { id: 'logout', group: 'Sistema', title: 'Sair', icon: 'exit', keys: 'logout desconectar', more: true, run: () => ACTIONS.logout() },
  );
  return c.filter((x) => !x.when || x.when());
}

const DOC_ICON = { reuniao: 'note', tarefa: 'check', diario: 'book', relatorio: 'file' };
function buildPaletteItems(q) {
  const qn = q.trim();
  const cmds = getCommands();
  const cmdItem = (c, group) => ({ type: 'cmd', cmd: c, group, title: c.title, snip: esc(c.hint || ''), icon: c.icon, kbd: c.kbd });
  const showCmds = P.kind === 'all' || P.kind === 'cmd';
  const out = [];
  if (!qn) {
    P.tokens = [];
    if (showCmds) {
      const rec = recentCmds().map((id) => cmds.find((c) => c.id === id)).filter(Boolean).slice(0, 3);
      const used = new Set(rec.map((c) => c.id));
      rec.forEach((c) => out.push(cmdItem(c, 'Recentes')));
      ['Caderno aberto', 'Ações', 'Ir para'].forEach((g) => cmds.filter((c) => c.group === g && !used.has(c.id) && (!c.more || P.kind === 'cmd')).forEach((c) => out.push(cmdItem(c, g))));
      if (P.kind === 'cmd') cmds.filter((c) => c.group === 'Sistema').forEach((c) => out.push(cmdItem(c, 'Sistema')));
    }
    if (P.kind !== 'cmd') runSearch('').slice(0, P.kind === 'all' ? 4 : 8).forEach((r) => out.push({ ...r, type: 'doc', group: P.kind === 'all' ? 'Reuniões e tarefas recentes' : 'Recentes' }));
    return out;
  }
  const tokens = norm(qn).split(/\s+/).filter(Boolean);
  if (showCmds) {
    cmds.map((c) => {
      const nt = norm(c.title), nk = norm(`${c.title} ${c.keys || ''} ${c.group || ''}`);
      if (!tokens.every((tk) => nk.includes(tk))) return null;
      return { c, score: tokens.reduce((n, tk) => n + (nt.startsWith(tk) ? 20 : nt.includes(tk) ? 10 : 1), 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6).forEach((m) => out.push(cmdItem(m.c, 'Comandos')));
  }
  if (P.kind !== 'cmd') runSearch(qn).forEach((r) => out.push({ ...r, type: 'doc', group: 'Resultados' }));
  else P.tokens = tokens;
  return out;
}

function openPalette() {
  const p = $('#palette');
  P.kind = 'all'; P.project = ''; P.sel = 0;
  p.hidden = false;
  document.body.classList.add('pal-open');
  p.innerHTML = `<div class="pal-box" role="dialog" aria-modal="true" aria-label="Buscar e executar comandos">
    <div class="pal-input">${ico('search')}<input id="pal-q" placeholder="Buscar ou digitar um comando..." autocomplete="off" aria-label="Buscar ou digitar um comando" role="combobox" aria-expanded="true" aria-controls="pal-results" aria-autocomplete="list"><kbd>Esc</kbd></div>
    <div class="pal-filters">
      ${[['all', 'Tudo'], ['cmd', 'Comandos'], ['reuniao', 'Reuniões'], ['tarefa', 'Tarefas'], ['diario', 'Diário'], ['relatorio', 'Relatórios']].map(([k, l]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-act="pal-kind" data-kind="${k}">${l}</button>`).join('')}
      <select data-bind="pal-project" aria-label="Filtrar por projeto"><option value="">Todos os projetos</option>${S.projects.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
    </div>
    <div class="pal-results" id="pal-results" role="listbox" aria-label="Resultados"></div>
    <div class="pal-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
  </div>`;
  $('#pal-q').focus();
  paintPalette();
}
function closePalette() { $('#palette').hidden = true; $('#palette').innerHTML = ''; document.body.classList.remove('pal-open'); }
function palSync() {
  const items = $$('.pal-item');
  items.forEach((el, i) => { el.classList.toggle('active', i === P.sel); el.setAttribute('aria-selected', String(i === P.sel)); });
  const act = items[P.sel];
  const q = $('#pal-q');
  if (q) { if (act) q.setAttribute('aria-activedescendant', act.id); else q.removeAttribute('aria-activedescendant'); }
  act?.scrollIntoView({ block: 'nearest' });
}
function paintPalette() {
  const q = $('#pal-q')?.value || '';
  P.results = buildPaletteItems(q);
  P.sel = Math.min(P.sel, Math.max(0, P.results.length - 1));
  const box = $('#pal-results');
  if (!box) return;
  if (!P.results.length) {
    box.innerHTML = `<div class="pal-empty"><b>Nada encontrado${q ? ` para "${esc(q)}"` : ''}.</b><span>Tente outra palavra, uma data (20/10) ou o nome de um projeto.</span></div>`;
    $('#pal-q')?.removeAttribute('aria-activedescendant');
    return;
  }
  let last = '';
  box.innerHTML = P.results.map((r, i) => {
    const head = r.group !== last ? `<div class="pal-group" role="presentation">${esc(r.group)}</div>` : '';
    last = r.group;
    const right = r.type === 'cmd'
      ? (r.kbd ? `<span class="pal-right">${r.kbd.split(' ').map((k) => `<kbd>${esc(kbdLabel(k))}</kbd>`).join('')}</span>` : '<span class="pal-right"></span>')
      : `<span class="pal-right"><span class="pal-kind">${KIND_LABEL[r.kind]}</span><span class="pal-date">${r.date ? fmtFull(String(r.date).slice(0, 10)) : ''}</span></span>`;
    const icon = r.type === 'cmd' ? r.icon : DOC_ICON[r.kind];
    return `${head}<button class="pal-item" id="pal-opt-${i}" data-act="pal-open" data-i="${i}" role="option" aria-selected="false" tabindex="-1">
      <span class="pal-ic">${ico(icon)}</span>
      <span class="pal-main"><span class="pal-title">${hl(r.title, P.tokens)}</span>${r.snip ? `<span class="pal-snip">${r.snip}</span>` : ''}</span>${right}</button>`;
  }).join('');
  palSync();
}
async function openResult(i) {
  const r = P.results[i];
  if (!r) return;
  closePalette();
  if (r.type === 'cmd') {
    pushRecent(r.cmd.id);
    if (r.cmd.leaveNb && NB) { await nbSettle(); closeNotebook(); }
    await r.cmd.run();
    return;
  }
  if (NB) { await nbSettle(); closeNotebook(); }
  if (r.kind === 'reuniao') openNotebook(r.id);
  else if (r.kind === 'tarefa') openTask(r.id);
  else if (r.kind === 'diario') { S.diarySel = r.id; go('diario'); }
  else { S.repMonth = r.id; go('relatorios'); }
}

/* =========================================================
   Conta
   ========================================================= */
function openAccount() {
  openModal(`
    <h3 class="modal-title">Conta</h3>
    <p class="muted">${esc(S.user?.email || '')}</p>
    <form data-form="password">
      <label>Nova senha (mínimo 8 caracteres)<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
      <label>Repita a nova senha<input type="password" name="pw2" minlength="8" autocomplete="new-password" required></label>
      <p class="form-error" id="pw-error" hidden></p>
      <button class="btn primary">Alterar senha</button>
    </form>
    <div class="modal-actions" style="justify-content:space-between;border-top:1px solid var(--line-soft);padding-top:14px">
      <button class="btn" data-act="export-backup">Baixar backup (JSON)</button>
      <button class="btn danger" data-act="logout">Sair</button>
    </div>`);
}
function exportBackup() {
  const data = { exportado_em: new Date().toISOString(), projetos: S.projects, modelos: S.templates, reunioes: S.meetings, tarefas: S.tasks, diario: S.diary, relatorios: S.reports };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `pandora-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* =========================================================
   Ações (cliques)
   ========================================================= */
const ACTIONS = {
  'reload': () => location.reload(),
  'open-search': () => openPalette(),
  'goto': (el) => go(el.dataset.route),
  'fab-toggle': () => fabSet(!QC.menu),
  'fab-capture': () => { fabSet(false); qcSet(true); },
  'fab-new-meeting': async () => { fabSet(false); if (NB) { await nbSettle(); closeNotebook(); } openNotebook(null); },
  'fab-new-task': () => { fabSet(false); openTask(null); },
  'fab-theme': () => { nextTheme(); fabSet(false, { focus: true }); },
  'fab-motion': () => { toggleMotion(); fabSet(false, { focus: true }); },
  'new-meeting': (el) => { closeModal(); openNotebook(null, { date: el.dataset.date }); },
  'open-meeting': (el) => { closeModal(); if (NB) { nbSettle().then(() => { closeNotebook(); openNotebook(el.dataset.id); }); } else openNotebook(el.dataset.id); },
  'cal-prev': () => { const c = S.cal; const d = new Date(c.y, c.m - 1, 1); S.cal = { ...c, y: d.getFullYear(), m: d.getMonth() }; render(false); },
  'cal-next': () => { const c = S.cal; const d = new Date(c.y, c.m + 1, 1); S.cal = { ...c, y: d.getFullYear(), m: d.getMonth() }; render(false); },
  'cal-today': () => { const n = new Date(); S.cal = { y: n.getFullYear(), m: n.getMonth(), sel: todayStr() }; render(false); },
  'cal-select': (el) => { S.cal.sel = el.dataset.date; render(false); },
  'meet-filter': (el) => { S.meetFilter = el.dataset.kind; render(false); },
  'open-templates': () => openTemplates(),
  'tpl-select': (el) => openTemplates(el.dataset.id),
  'tpl-delete': async (el) => {
    const ok = await confirmDialog('Excluir este modelo? As reuniões já criadas não mudam.', 'Excluir', true);
    if (!ok) return;
    await call(sb.from('meeting_templates').delete().eq('id', el.dataset.id));
    await reload('templates'); openTemplates(); toast('Modelo excluído.');
  },
  'new-task': () => openTask(null),
  'open-task': (el) => openTask(el.dataset.id),
  'complete-task': (el) => { const t = byId(S.tasks, el.dataset.id); setTaskStatus(t.id, isDone(t.status) ? 'Pendente' : 'Feito'); },
  'task-delete': async (el) => {
    const ok = await confirmDialog('Excluir esta tarefa?', 'Excluir', true);
    if (!ok) return;
    await call(sb.from('tasks').delete().eq('id', el.dataset.id));
    await reload('tasks'); refreshUI(); toast('Tarefa excluída.');
  },
  'new-project': () => openProject(null),
  'open-project': (el) => openProject(el.dataset.id),
  'project-delete': async (el) => {
    const ok = await confirmDialog('Excluir este projeto? As tarefas e reuniões dele continuam, apenas sem projeto.', 'Excluir', true);
    if (!ok) return;
    await call(sb.from('projects').delete().eq('id', el.dataset.id));
    await reload('projects', 'tasks', 'meetings'); refreshUI(); toast('Projeto excluído.');
  },
  'diary-goto': (el) => { diarySaver.flush(); S.diarySel = el.dataset.date; closeModal(); go('diario'); },
  'rep-select': (el) => { reportSaver.flush(); S.repMonth = el.dataset.key; render(false); },
  'rep-generate': async () => {
    const ta = $('[data-rep="content"]');
    if (ta.value.trim() && !(await confirmDialog('Substituir o texto atual pelo rascunho gerado?', 'Substituir'))) return;
    ta.value = reportDraft(S.repMonth); autosize(ta); queueReport();
    toast('Rascunho gerado. Ajuste o texto como quiser.');
  },
  'rep-open-gestao': () => { reportSaver.flush(); S.gesMonth = S.repMonth; go('gestao'); },
  'ges-print': () => window.print(),
  'ges-tab': (el) => { S.gesTab = el.dataset.tab; render(false); },
  'tl-toggle': (el) => {
    const id = el.dataset.id, item = el.closest('.tl-item'), was = S.tlOpen === id;
    $$('.tl-item.open').forEach((i) => { i.classList.remove('open'); $('.tl-detail', i).innerHTML = ''; $('.tl-head', i).setAttribute('aria-expanded', 'false'); });
    S.tlOpen = was ? null : id;
    if (!was) { item.classList.add('open'); $('.tl-detail', item).innerHTML = tlDetail(byId(S.meetings, id)); el.setAttribute('aria-expanded', 'true'); }
  },
  'link-delete': async (el) => {
    const l = byId(S.links, el.dataset.id);
    const ok = await confirmDialog(`Remover o link "${l?.title || ''}"?`, 'Remover', true);
    if (!ok) return;
    await call(sb.from('project_links').delete().eq('id', el.dataset.id));
    await reload('links'); render(false); toast('Link removido.');
  },
  'qc-toggle': () => qcSet(!QC.open),
  'qc-due': (el) => { QC.due = el.dataset.v; $$('.qc-chips .chip').forEach((c) => c.classList.toggle('on', c === el)); $('#qc-title')?.focus(); },
  'open-account': () => openAccount(),
  'export-backup': () => exportBackup(),
  'logout': async () => { closeModal(); await sb.auth.signOut(); },
  'modal-cancel': () => closeModal(),
  'modal-ok': () => { const r = confirmResolve; confirmResolve = null; modalState.onClose = null; closeModal(); if (r) r(true); },
  'nb-close': () => nbClose(),
  'nb-finish': () => nbFinish(),
  'nb-delete': () => nbDelete(),
  'nb-flip': (el) => nbFlip(+el.dataset.dir),
  'copy-ata': () => copyAta(NB.m),
  'copy-ata-id': (el) => { const m = byId(S.meetings, el.dataset.id); if (m) copyAta(m); },
  'nb-add-action': () => { NB.m.actions.push({ title: '', due: '', owner: '' }); renderNbActions(); const ins = $$('#nb-actions input[data-af="title"]'); ins[ins.length - 1]?.focus(); nbDirty(); },
  'nb-del-action': (el) => { NB.m.actions.splice(+el.dataset.i, 1); renderNbActions(); nbDirty(); },
  'nb-add-task': async () => {
    const title = $('#na-title').value.trim();
    if (!title) { $('#na-title').focus(); return; }
    await call(sb.from('tasks').insert({ title, due_date: $('#na-due').value || null, owner: $('#na-owner').value.trim() || null, status: 'Pendente', meeting_id: NB.m.id, project_id: NB.m.project_id || null }));
    await reload('tasks'); renderNbActions(); toast('Ação adicionada.');
  },
  'pal-kind': (el) => { P.kind = el.dataset.kind; P.sel = 0; $$('.pal-filters .chip').forEach((c) => c.classList.toggle('on', c === el)); paintPalette(); $('#pal-q').focus(); },
  'pal-open': (el) => openResult(+el.dataset.i),
};
document.addEventListener('click', (e) => {
  if (QC.open && !e.target.closest('#qc')) qcSet(false);
  if (QC.menu && !e.target.closest('#qc')) fabSet(false);
  if (e.target === $('#overlay')) { closeModal(); return; }
  if (e.target === $('#palette')) { closePalette(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch((err) => console.error(err)); }
});

/* ---------- Captura rápida ---------- */
const QC = { open: false, menu: false, due: '', built: false };
function qcDue(v) {
  if (!v) return null;
  const d = new Date();
  if (v === 'amanha') d.setDate(d.getDate() + 1);
  if (v === 'semana') d.setDate(d.getDate() + 7);
  return ymd(d);
}
function qcBuild() {
  const el = $('#qc');
  if (QC.built) return;
  QC.built = true;
  el.innerHTML = `<div class="qc-pop" id="qc-pop" role="dialog" aria-label="Captura rápida" hidden>
      <form data-form="qc" autocomplete="off">
        <label class="qc-l">Captura rápida<input name="title" id="qc-title" placeholder="O que não pode ser esquecido?" required></label>
        <div class="qc-chips">${[['', 'Sem prazo'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Em 7 dias']].map(([v, l]) => `<button type="button" class="chip ${v === '' ? 'on' : ''}" data-act="qc-due" data-v="${v}">${l}</button>`).join('')}</div>
        <div class="qc-row"><input name="owner" list="owners" placeholder="Responsável (opcional)" aria-label="Responsável"><button class="btn primary">Salvar</button></div>
      </form>
    </div>
    <div class="qc-menu" id="qc-menu" role="menu" aria-label="Ações rápidas" hidden>
      <button type="button" class="fab-item" role="menuitem" data-act="fab-capture">${ico('bolt')}<span class="fab-l">Captura rápida</span></button>
      <button type="button" class="fab-item" role="menuitem" data-act="fab-new-meeting">${ico('note')}<span class="fab-l">Nova reunião</span></button>
      <button type="button" class="fab-item" role="menuitem" data-act="fab-new-task">${ico('check')}<span class="fab-l">Nova tarefa</span></button>
      <button type="button" class="fab-item" id="theme-btn" role="menuitem" data-act="fab-theme">${ico('palette')}<span class="fab-l">Cor do tema</span><span class="fab-val" id="theme-val"></span><i class="theme-dot" aria-hidden="true"></i></button>
      <button type="button" class="fab-item" id="motion-btn" role="menuitemcheckbox" aria-checked="true" data-act="fab-motion">${ico('waves')}<span class="fab-l">Animação do fundo</span><span class="fab-val" id="motion-val"></span></button>
    </div>
    <button class="qc-fab" id="qc-fab" data-act="fab-toggle" aria-haspopup="menu" aria-expanded="false" aria-controls="qc-menu" aria-label="Abrir ações rápidas" title="Ações rápidas">${ico('plus')}</button>`;
  $('#qc-menu').addEventListener('keydown', (e) => {
    const items = $$('.fab-item', e.currentTarget), i = items.indexOf(document.activeElement);
    const to = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); items[to].focus(); }
  });
  syncFab();
}
// estado atual (cor e animação) mostrado dentro do menu, também para leitores de tela
function syncFab() {
  const menu = document.getElementById('qc-menu');
  if (!menu) return;
  const th = themeById(themeId) || THEMES[0];
  const tb = document.getElementById('theme-btn'), mb = document.getElementById('motion-btn');
  document.getElementById('theme-val').textContent = th.label;
  tb.setAttribute('aria-label', `Cor do tema: ${th.label}. Toque para trocar`);
  document.getElementById('motion-val').textContent = motionOn ? 'Ligada' : 'Parada';
  mb.setAttribute('aria-checked', String(motionOn));
  mb.setAttribute('aria-label', `Animação do fundo: ${motionOn ? 'ligada. Toque para parar' : 'parada. Toque para retomar'}`);
}
function fabSet(open, { focus = false } = {}) {
  const menu = $('#qc-menu'), fab = $('#qc-fab');
  if (!menu) return;
  if (open && QC.open) qcSet(false);
  QC.menu = open;
  menu.hidden = !open;
  fab.classList.toggle('on', open || QC.open);
  fab.setAttribute('aria-expanded', String(open));
  if (open) setTimeout(() => $('.fab-item', menu)?.focus(), 30);
  else if (focus) fab.focus();
}
function qcSet(open) {
  QC.open = open;
  const pop = $('#qc-pop'), fab = $('#qc-fab');
  if (!pop) return;
  pop.hidden = !open;
  if (open && QC.menu) fabSet(false);
  fab.classList.toggle('on', open || QC.menu);
  if (open) { setTimeout(() => $('#qc-title').focus(), 30); }
  else { const f = $('form', pop); f.reset(); QC.due = ''; $$('.qc-chips .chip', pop).forEach((c, i) => c.classList.toggle('on', i === 0)); }
}

/* ---------- formulários ---------- */
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id === 'login-form') { e.preventDefault(); return doLogin(); }
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const btn = $('button:not([type=button])', form);
  if (btn) btn.disabled = true;
  try {
    const f = new FormData(form);
    if (kind === 'task') await submitTask(form);
    else if (kind === 'link') {
      const url = safeUrl(f.get('url'));
      if (!url) { toast('Endereço inválido. Use um link http ou https.', 'error'); return; }
      await call(sb.from('project_links').insert({ project_id: form.dataset.project, title: String(f.get('title')).trim(), url }));
      await reload('links'); render(false); toast('Link adicionado.');
    } else if (kind === 'qc') {
      const title = String(f.get('title')).trim();
      if (!title) return;
      await call(sb.from('tasks').insert({ title, due_date: qcDue(QC.due), owner: String(f.get('owner') || '').trim() || null, status: 'Pendente' }));
      await reload('tasks'); refreshUI(); qcSet(false); toast('Anotado em Tarefas.');
    }
    else if (kind === 'project') {
      const id = form.dataset.id;
      const row = { name: String(f.get('name')).trim(), status: f.get('status'), description: String(f.get('description')).trim() || null };
      if (id) await call(sb.from('projects').update(row).eq('id', id)); else await call(sb.from('projects').insert(row));
      await reload('projects'); closeModal(); refreshUI(); toast('Projeto salvo.');
    } else if (kind === 'template') {
      const id = form.dataset.id;
      const row = {
        name: String(f.get('name')).trim(), agenda: String(f.get('agenda')),
        key_points: String(f.get('key_points')) || KEY_POINTS_DEFAULT,
        default_tasks: String(f.get('default_tasks')).split('\n').map((s) => s.trim()).filter(Boolean),
      };
      let savedId = id;
      if (id) await call(sb.from('meeting_templates').update(row).eq('id', id));
      else { const r = await call(sb.from('meeting_templates').insert(row).select().single()); savedId = r.id; }
      await reload('templates'); openTemplates(savedId); toast('Modelo salvo.');
    } else if (kind === 'password') {
      const pw = f.get('pw'), pw2 = f.get('pw2'), err = $('#pw-error');
      if (pw !== pw2) { err.textContent = 'As senhas não são iguais.'; err.hidden = false; return; }
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) { err.textContent = error.message; err.hidden = false; return; }
      closeModal(); toast('Senha alterada.');
    }
  } catch (err) { /* já exibido por call() */ }
  finally { if (btn) btn.disabled = false; }
});

/* ---------- campos ---------- */
function queueReport() {
  reportDirty = true;
  const el = $('#rep-state'); if (el) { el.textContent = 'Salvando...'; el.classList.remove('err'); }
  reportSaver(S.repMonth, $('[data-rep="title"]').value, $('[data-rep="content"]').value);
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.nb && NB) {
    const f = t.dataset.nb;
    if (f === 'kind') applyKind(t.value); else NB.m[f] = t.value;
    if (t.tagName === 'TEXTAREA') autosize(t);
    if (f === 'meeting_date' && t.value) $('#nb-date-long').textContent = `${fmtLong(t.value)} de ${t.value.slice(0, 4)}`;
    nbDirty();
  } else if (t.dataset.ai !== undefined && NB) {
    const a = NB.m.actions[+t.dataset.ai];
    if (t.dataset.af === 'title') a.title = t.value; else if (t.dataset.af === 'owner') a.owner = t.value; else { a.due = t.value; t.classList.toggle('nodue', !t.value); }
    nbDirty();
  } else if (t.dataset.diary) {
    const date = t.dataset.diary;
    setDiaryLocal(date, t.value); autosize(t); diaryDirty = true;
    $$('.diary-state').forEach((el) => { el.textContent = 'Salvando...'; el.classList.remove('err'); });
    diarySaver(date, t.value);
  } else if (t.dataset.rep) {
    if (t.tagName === 'TEXTAREA') autosize(t);
    queueReport();
  } else if (t.id === 'pal-q') { P.sel = 0; paintPalette(); }
});
document.addEventListener('change', (e) => {
  const b = e.target.dataset.bind;
  if (!b) return;
  const v = e.target.value;
  if (b === 'board-project') { S.boardProject = v; render(false); }
  else if (b === 'diary-date') { diarySaver.flush(); S.diarySel = v || todayStr(); render(false); }
  else if (b === 'ges-month') { S.gesMonth = v; render(false); }
  else if (b === 'tl-project') { S.tlProject = v; S.tlOpen = null; render(false); }
  else if (b === 'pal-project') { P.project = v; P.sel = 0; paintPalette(); }
});

/* ---------- teclado ---------- */
document.addEventListener('keydown', (e) => {
  const t = e.target;
  // lista numerada nos pontos principais
  if (t.matches?.('textarea[data-nb="key_points"]') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    const v = t.value, pos = t.selectionStart;
    if (pos === t.selectionEnd) {
      const ls = v.lastIndexOf('\n', pos - 1) + 1;
      const mm = v.slice(ls, pos).match(/^(\s*)(\d+)([.)])\s?(.*)$/);
      if (mm) {
        e.preventDefault();
        if (!mm[4].trim()) { t.value = v.slice(0, ls) + v.slice(pos); t.setSelectionRange(ls, ls); }
        else { const ins = `\n${mm[1]}${+mm[2] + 1}${mm[3]} `; t.value = v.slice(0, pos) + ins + v.slice(pos); t.setSelectionRange(pos + ins.length, pos + ins.length); }
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    return;
  }
  // Enter/Espaço em elementos clicáveis
  if ((e.key === 'Enter' || e.key === ' ') && t.matches?.('[data-act][tabindex]') && t === e.target && !t.matches('input,textarea,select')) { e.preventDefault(); t.click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if ($('#app').hidden && $('#notebook').hidden) return; $('#palette').hidden ? openPalette() : closePalette(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); if ($('#app').hidden && $('#notebook').hidden) return; if (!$('#palette').hidden || !$('#overlay').hidden) return; qcSet(!QC.open); return; }
  if (e.altKey && e.key.toLowerCase() === 'n' && !$('#app').hidden) { e.preventDefault(); if (!NB) openNotebook(null); return; }
  if (!$('#palette').hidden) {
    if (e.key === 'Escape') { closePalette(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      P.sel = Math.max(0, Math.min(P.results.length - 1, P.sel + (e.key === 'ArrowDown' ? 1 : -1)));
      palSync();
    } else if (e.key === 'Home' || e.key === 'End') {
      if (t.id === 'pal-q') { e.preventDefault(); P.sel = e.key === 'Home' ? 0 : Math.max(0, P.results.length - 1); palSync(); }
    } else if (e.key === 'Enter' && t.id === 'pal-q') { e.preventDefault(); openResult(P.sel); }
    return;
  }
  if (e.key === 'Escape' && !$('#overlay').hidden) { closeModal(); return; }
  if (e.key === 'Escape' && QC.menu) fabSet(false, { focus: true });
  else if (e.key === 'Escape' && QC.open) qcSet(false);
});

/* ---------- arrastar e soltar no quadro ---------- */
document.addEventListener('dragstart', (e) => {
  const c = e.target.closest?.('.card[data-id]');
  if (!c) return;
  e.dataTransfer.setData('text/plain', c.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  c.classList.add('dragging');
});
document.addEventListener('dragend', (e) => { e.target.closest?.('.card')?.classList.remove('dragging'); $$('.lane.over').forEach((l) => l.classList.remove('over')); });
document.addEventListener('dragover', (e) => {
  const lane = e.target.closest?.('.lane');
  if (!lane) return;
  e.preventDefault();
  $$('.lane.over').forEach((l) => l !== lane && l.classList.remove('over'));
  lane.classList.add('over');
});
document.addEventListener('drop', (e) => {
  const lane = e.target.closest?.('.lane');
  if (!lane) return;
  e.preventDefault();
  lane.classList.remove('over');
  const id = e.dataTransfer.getData('text/plain');
  const t = byId(S.tasks, id);
  if (t && t.status !== lane.dataset.status) setTaskStatus(id, lane.dataset.status);
});

window.addEventListener('beforeunload', (e) => {
  if ((NB && (NB.dirty || NB.saving)) || diaryDirty || reportDirty) { e.preventDefault(); e.returnValue = ''; }
});

/* =========================================================
   Login e inicialização
   ========================================================= */
const bootEl = $('#boot');
const hideBoot = () => { bootEl.classList.add('gone'); setTimeout(() => (bootEl.hidden = true), 350); };
function showLogin() {
  $('#app').hidden = true; $('#notebook').hidden = true;
  $('#qc').hidden = true; qcSet(false); fabSet(false);
  $('#login').hidden = false;
  hideBoot();
  setTimeout(() => $('#login-email').focus(), 50);
}
async function doLogin() {
  const btn = $('#login-btn'), err = $('#login-error');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Entrando...';
  const { data, error } = await sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pass').value });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) {
    err.textContent = /invalid|credentials/i.test(error.message) ? 'E-mail ou senha incorretos.' : friendly(error);
    err.hidden = false;
    return;
  }
  $('#login-pass').value = '';
  await enter(data.user);
}
async function enter(user) {
  S.user = user;
  themeSync = true;
  const remoteTheme = user?.user_metadata?.theme;
  if (themeById(remoteTheme)) { if (remoteTheme !== themeId) applyTheme(remoteTheme, { remote: false }); }
  else if (themeId !== THEMES[0].id) saveThemeRemote(themeId);
  const remoteMotion = user?.user_metadata?.motion;
  if (remoteMotion === 'on' || remoteMotion === 'off') { if ((remoteMotion === 'on') !== motionOn) applyMotion(remoteMotion === 'on', { remote: false }); }
  else if (motionChosen) saveMotionRemote(motionOn);
  try { await reload(); }
  catch (e) {
    console.error(e);
    $('#login').hidden = true;
    $('#view').innerHTML = `<section class="page"><div class="empty">Não foi possível carregar seus dados (${esc(friendly(e))}).<br>Se o projeto do Supabase estiver pausado, reative-o no painel. <br><button class="btn" data-act="reload">Tentar de novo</button></div></section>`;
    $('#app').hidden = false; hideBoot();
    return;
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  qcBuild(); $('#qc').hidden = false;
  render(true);
  hideBoot();
}
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') { S.user = null; NB = null; closePalette(); showLogin(); }
});
(async function boot() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await enter(session.user); else showLogin();
  } catch (e) { console.error(e); showLogin(); }
})();

})();
