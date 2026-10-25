import { firebaseConfig } from './assets/firebase-config.js';

const VERSION = '1.0.0';
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

/* ---------- קבועים ---------- */
const INCOME_CATS = ["לק ג'ל", 'מילוי', 'בניית ציפורניים', 'הסרה', 'רגליים', 'עיצובים וקישוטים', 'טיפ', 'מכירת מוצרים', 'אחר'];
const EXPENSE_CATS = ["ג'לים ולקים", 'כלים וציוד', 'חד-פעמי וחיטוי', 'שכירות', 'חשמל ומים', 'פרסום ואינסטגרם', 'קורסים', 'נסיעות', 'מס וביטוח לאומי', 'אחר'];
const NOT_TREATMENT = ['טיפ', 'מכירת מוצרים', 'אחר'];
const METHODS = [
  { id: 'cash', label: 'מזומן', icon: '💵' },
  { id: 'bit', label: 'ביט', icon: '📱' },
  { id: 'paybox', label: 'פייבוקס', icon: '📲' },
  { id: 'transfer', label: 'העברה', icon: '🏦' },
  { id: 'card', label: 'אשראי', icon: '💳' },
];
const CAT_ICON = {
  "לק ג'ל": '💅', 'מילוי': '✨', 'בניית ציפורניים': '💎', 'הסרה': '🧴', 'רגליים': '🦶', 'עיצובים וקישוטים': '🌸',
  'טיפ': '💗', 'מכירת מוצרים': '🛍️', "ג'לים ולקים": '🧪', 'כלים וציוד': '🛠️', 'חד-פעמי וחיטוי': '🧤', 'שכירות': '🏠',
  'חשמל ומים': '💡', 'פרסום ואינסטגרם': '📸', 'קורסים': '🎓', 'נסיעות': '🚗', 'מס וביטוח לאומי': '🧾', 'אחר': '•',
};
const DEFAULT_SETTINGS = {
  goal: 8000,
  services: [
    { name: "לק ג'ל ידיים", price: 120, cat: "לק ג'ל" },
    { name: 'מילוי', price: 150, cat: 'מילוי' },
    { name: 'בנייה', price: 250, cat: 'בניית ציפורניים' },
    { name: "לק ג'ל רגליים", price: 130, cat: 'רגליים' },
    { name: 'הסרה', price: 50, cat: 'הסרה' },
  ],
};
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/* ---------- עזרים ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n < 0 ? '-' : '') + '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL');
const pad = (n) => String(n).padStart(2, '0');
const ymKey = (y, m) => `${y}-${pad(m + 1)}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const method = (id) => METHODS.find((m) => m.id === id) || { label: id || '—', icon: '•' };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* מצב פרטי */ } },
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- מצב ---------- */
const now = new Date();
const state = {
  txs: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  y: now.getFullYear(),
  m: now.getMonth(),
  tab: 'month',
  form: null,
  editing: null,
};
let backend = null;
let unsub = null;

/* ---------- אחסון: מקומי (בלי Firebase) ---------- */
function localBackend() {
  const K = 'nogagel-tx', S = 'nogagel-settings';
  let cb = () => {};
  const read = () => ls.get(K, []);
  const write = (a) => { ls.set(K, a); cb(read()); };
  return {
    mode: 'local',
    subscribe(f) { cb = f; f(read()); return () => {}; },
    async add(tx) { write([...read(), { ...tx, id: uid() }]); },
    async update(id, tx) { write(read().map((t) => (t.id === id ? { ...tx, id } : t))); },
    async remove(id) { write(read().filter((t) => t.id !== id)); },
    async loadSettings() { return ls.get(S, null); },
    async saveSettings(s) { ls.set(S, s); },
  };
}

/* ---------- אחסון: Firebase ---------- */
function firebaseBackend(user, fs, db) {
  const col = fs.collection(db, 'users', user.uid, 'tx');
  const sref = fs.doc(db, 'users', user.uid, 'meta', 'settings');
  return {
    mode: 'cloud',
    subscribe(f) {
      return fs.onSnapshot(col,
        (snap) => f(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
        (err) => toast('שגיאה בטעינה: ' + err.code));
    },
    add: (tx) => fs.addDoc(col, { ...tx, created: Date.now() }),
    update: (id, tx) => fs.setDoc(fs.doc(col, id), tx),
    remove: (id) => fs.deleteDoc(fs.doc(col, id)),
    async loadSettings() { const s = await fs.getDoc(sref); return s.exists() ? s.data() : null; },
    saveSettings: (s) => fs.setDoc(sref, s),
  };
}

async function start(b) {
  backend = b;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#modeBadge').textContent = b.mode === 'cloud' ? '☁️ מסונכרן' : '📱 שמור בטלפון';
  try {
    const s = await b.loadSettings();
    if (s) state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...s };
  } catch { /* נשארים עם ברירת מחדל */ }
  if (unsub) unsub();
  unsub = b.subscribe((txs) => { state.txs = txs; render(); });
  render();
}

async function boot() {
  $('#version').textContent = 'v' + VERSION;
  if (!firebaseConfig || !firebaseConfig.apiKey) { start(localBackend()); return; }

  const [{ initializeApp }, A, fs] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() }); }
  catch { db = fs.getFirestore(app); }

  A.onAuthStateChanged(auth, (user) => {
    if (unsub) { unsub(); unsub = null; }
    if (!user) {
      $('#app').classList.add('hidden');
      $('#login').classList.remove('hidden');
      return;
    }
    start(firebaseBackend(user, fs, db));
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try { await A.signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#pass').value); }
    catch { $('#loginErr').textContent = 'מייל או סיסמה לא נכונים'; }
  });
  $('#forgot').addEventListener('click', async () => {
    const email = $('#email').value.trim();
    if (!email) { $('#loginErr').textContent = 'קודם לכתוב את המייל למעלה'; return; }
    try { await A.sendPasswordResetEmail(auth, email); toast('נשלח מייל לאיפוס סיסמה 💌'); }
    catch { $('#loginErr').textContent = 'לא הצלחתי לשלוח מייל'; }
  });
  window.__logout = () => A.signOut(auth);
}

/* ---------- חישובים ---------- */
const monthTxs = (y, m) => { const k = ymKey(y, m); return state.txs.filter((t) => (t.date || '').startsWith(k)); };
function sums(list) {
  let inc = 0, exp = 0;
  for (const t of list) { if (t.type === 'income') inc += +t.amount || 0; else exp += +t.amount || 0; }
  return { inc, exp, net: inc - exp };
}
function groupSum(list, key) {
  const o = {};
  for (const t of list) { const k = t[key] || 'אחר'; o[k] = (o[k] || 0) + (+t.amount || 0); }
  return Object.entries(o).sort((a, b) => b[1] - a[1]);
}
function bars(entries, cls, labeler = (k) => `${CAT_ICON[k] || ''} ${k}`) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return entries.map(([k, v]) => `
    <div class="bar-row">
      <span class="bar-label">${esc(labeler(k))}</span>
      <div class="bar"><i class="${cls}" style="width:${total ? (v / total) * 100 : 0}%"></i></div>
      <span class="bar-val">${money(v)}</span>
    </div>`).join('');
}

/* ---------- תצוגה ---------- */
function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('.fab').classList.toggle('hidden', state.tab === 'settings');
  const v = $('#view');
  if (state.tab === 'month') v.innerHTML = monthView();
  else if (state.tab === 'year') v.innerHTML = yearView();
  else v.innerHTML = settingsView();
}

function monthView() {
  const { y, m } = state;
  const list = monthTxs(y, m);
  const s = sums(list);
  const pm = m === 0 ? [y - 1, 11] : [y, m - 1];
  const ps = sums(monthTxs(...pm));
  const isCurrent = y === now.getFullYear() && m === now.getMonth();
  const isFuture = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());

  const income = list.filter((t) => t.type === 'income');
  const expense = list.filter((t) => t.type === 'expense');
  const treatments = income.filter((t) => !NOT_TREATMENT.includes(t.cat));
  const treatSum = treatments.reduce((a, t) => a + (+t.amount || 0), 0);
  const tips = income.filter((t) => t.cat === 'טיפ').reduce((a, t) => a + (+t.amount || 0), 0);
  const cashIn = income.filter((t) => t.method === 'cash').reduce((a, t) => a + (+t.amount || 0), 0);

  const clients = {};
  for (const t of income) if (t.client) clients[t.client.trim()] = (clients[t.client.trim()] || 0) + 1;
  const topClient = Object.entries(clients).sort((a, b) => b[1] - a[1])[0];

  let delta = '';
  if (ps.inc > 0) {
    const pct = Math.round(((s.inc - ps.inc) / ps.inc) * 100);
    delta = `<div class="delta">${pct >= 0 ? '📈' : '📉'} ההכנסות ${pct >= 0 ? 'גבוהות' : 'נמוכות'} ב-${Math.abs(pct)}% מ${MONTHS[pm[1]]}</div>`;
  }

  const goal = +state.settings.goal || 0;
  const goalPct = goal ? Math.min(100, (s.inc / goal) * 100) : 0;
  let goalMsg = '';
  if (goal) {
    if (s.inc >= goal) goalMsg = 'הגעת ליעד! מלכה 👑';
    else if (isCurrent) {
      const daysLeft = new Date(y, m + 1, 0).getDate() - now.getDate() + 1;
      goalMsg = `עוד ${money(goal - s.inc)} ליעד · ${daysLeft} ימים נשארו`;
    } else goalMsg = `חסרו ${money(goal - s.inc)} ליעד`;
  }

  const quick = state.settings.services.map((sv, i) =>
    `<button class="qbtn" data-act="quick" data-i="${i}"><b>${esc(sv.name)}</b><span>${money(sv.price)}</span></button>`).join('');

  return `
    <div class="month-nav">
      <button class="navbtn" data-act="prev" aria-label="חודש קודם">›</button>
      <h2>${MONTHS[m]} ${y}</h2>
      <button class="navbtn" data-act="next" aria-label="חודש הבא" ${isFuture ? 'disabled' : ''}>‹</button>
    </div>

    <div class="card hero">
      <div class="lbl">רווח נקי החודש</div>
      <div class="big">${money(s.net)}</div>
      <div class="row">
        <div class="pill">הכנסות<b>${money(s.inc)}</b></div>
        <div class="pill">הוצאות<b>${money(s.exp)}</b></div>
      </div>
      ${delta}
    </div>

    ${goal ? `
    <div class="card">
      <h3>🎯 יעד הכנסות: ${money(goal)}</h3>
      <div class="goal-bar ${s.inc >= goal ? 'done' : ''}"><i style="width:${goalPct}%"></i></div>
      <div class="small muted">${Math.round(goalPct)}% · ${goalMsg}</div>
    </div>` : ''}

    ${state.settings.services.length ? `
    <div class="card">
      <h3>⚡ הוספה מהירה</h3>
      <div class="quick">${quick}</div>
    </div>` : ''}

    ${list.length ? `
    <div class="card">
      <h3>💖 החודש במספרים</h3>
      <div class="stats">
        <div class="stat"><div class="v">${treatments.length}</div><div class="k">טיפולים</div></div>
        <div class="stat"><div class="v">${treatments.length ? money(treatSum / treatments.length) : '—'}</div><div class="k">ממוצע לטיפול</div></div>
        <div class="stat"><div class="v">${money(tips)}</div><div class="k">טיפים</div></div>
        <div class="stat"><div class="v">${money(cashIn)}</div><div class="k">נכנס במזומן</div></div>
        ${topClient ? `<div class="stat" style="grid-column:1/-1"><div class="v">${esc(topClient[0])}</div><div class="k">הלקוחה הכי קבועה החודש (${topClient[1]} ביקורים)</div></div>` : ''}
      </div>
    </div>` : ''}

    ${income.length ? `
    <div class="card">
      <h3>💳 איך שילמו לי</h3>
      ${bars(groupSum(income, 'method'), 'met', (k) => `${method(k).icon} ${method(k).label}`)}
    </div>
    <div class="card">
      <h3>💅 מאיפה הכסף הגיע</h3>
      ${bars(groupSum(income, 'cat'), 'inc')}
    </div>` : ''}

    ${expense.length ? `
    <div class="card">
      <h3>🛒 על מה הוצאתי</h3>
      ${bars(groupSum(expense, 'cat'), 'exp')}
    </div>` : ''}

    <div class="card">
      <h3>🧾 תנועות החודש</h3>
      ${list.length ? txList(list) : `
        <div class="empty"><div class="e">💅</div>עוד אין תנועות ב${MONTHS[m]}.<br>לוחצים על ה־+ למטה או על הוספה מהירה.</div>`}
    </div>`;
}

function txList(list) {
  const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0));
  let out = '', last = '';
  for (const t of sorted) {
    if (t.date !== last) {
      last = t.date;
      const d = new Date(t.date + 'T12:00:00');
      out += `<div class="day">יום ${DAYS[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]}</div>`;
    }
    const inc = t.type === 'income';
    const sub = [method(t.method).icon + ' ' + method(t.method).label, t.client, t.note].filter(Boolean).map(esc).join(' · ');
    out += `
      <button class="tx" data-act="edit" data-id="${esc(t.id)}">
        <div class="ic ${inc ? 'inc' : 'exp'}">${CAT_ICON[t.cat] || (inc ? '💗' : '🛒')}</div>
        <div class="mid"><b>${esc(t.cat)}</b><span>${sub}</span></div>
        <div class="amt ${inc ? 'inc' : 'exp'}">${inc ? '+' : '-'}${money(+t.amount)}</div>
      </button>`;
  }
  return out;
}

function yearView() {
  const y = state.y;
  const rows = MONTHS.map((name, m) => ({ name, m, ...sums(monthTxs(y, m)) }));
  const tot = rows.reduce((a, r) => ({ inc: a.inc + r.inc, exp: a.exp + r.exp, net: a.net + r.net }), { inc: 0, exp: 0, net: 0 });
  const active = rows.filter((r) => r.inc || r.exp);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.inc, r.exp)));
  const best = active.length ? active.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const yearTx = state.txs.filter((t) => (t.date || '').startsWith(y + '-'));
  const yearIncome = yearTx.filter((t) => t.type === 'income');
  const yearExpense = yearTx.filter((t) => t.type === 'expense');

  const chart = rows.map((r) => `
    <button class="ycol ${r.m === now.getMonth() && y === now.getFullYear() ? 'cur' : ''}" data-act="gomonth" data-m="${r.m}">
      <div class="pair">
        <i class="inc" style="height:${(r.inc / max) * 100}%"></i>
        <i class="exp" style="height:${(r.exp / max) * 100}%"></i>
      </div>
      <small>${r.name.slice(0, 3)}</small>
    </button>`).join('');

  const table = rows.filter((r) => r.inc || r.exp).map((r) => `
    <tr class="click" data-act="gomonth" data-m="${r.m}">
      <td>${r.name}</td><td>${money(r.inc)}</td><td>${money(r.exp)}</td>
      <td class="${r.net >= 0 ? 'pos' : 'neg'}"><b>${money(r.net)}</b></td>
    </tr>`).join('');

  return `
    <div class="month-nav">
      <button class="navbtn" data-act="yprev" aria-label="שנה קודמת">›</button>
      <h2>שנת ${y}</h2>
      <button class="navbtn" data-act="ynext" aria-label="שנה הבאה" ${y >= now.getFullYear() ? 'disabled' : ''}>‹</button>
    </div>

    <div class="card hero">
      <div class="lbl">רווח נקי בשנה</div>
      <div class="big">${money(tot.net)}</div>
      <div class="row">
        <div class="pill">הכנסות<b>${money(tot.inc)}</b></div>
        <div class="pill">הוצאות<b>${money(tot.exp)}</b></div>
      </div>
      ${active.length ? `<div class="delta">ממוצע רווח לחודש: ${money(tot.net / active.length)}${best ? ` · החודש הכי טוב: ${best.name} 🏆` : ''}</div>` : ''}
    </div>

    <div class="card">
      <h3>📊 חודש אחרי חודש</h3>
      <div class="ychart">${chart}</div>
      <div class="legend"><span><i style="background:var(--p500)"></i>הכנסות</span><span><i style="background:var(--red)"></i>הוצאות</span><span>לחיצה על חודש פותחת אותו</span></div>
    </div>

    ${table ? `
    <div class="card">
      <table class="ytab">
        <tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>רווח</th></tr>
        ${table}
      </table>
    </div>` : `<div class="card empty"><div class="e">📊</div>אין עדיין נתונים לשנה הזו</div>`}

    ${yearIncome.length ? `<div class="card"><h3>💳 איך שילמו לי השנה</h3>${bars(groupSum(yearIncome, 'method'), 'met', (k) => `${method(k).icon} ${method(k).label}`)}</div>` : ''}
    ${yearExpense.length ? `<div class="card"><h3>🛒 הוצאות השנה לפי קטגוריה</h3>${bars(groupSum(yearExpense, 'cat'), 'exp')}</div>` : ''}

    <div class="card">
      <button class="btn block" data-act="csvyear">⬇️ ייצוא שנת ${y} לאקסל (לרואה חשבון)</button>
    </div>`;
}

function settingsView() {
  const s = state.settings;
  const svc = s.services.map((sv, i) => `
    <div class="svc">
      <input data-svc="${i}" data-k="name" value="${esc(sv.name)}" placeholder="שם">
      <input data-svc="${i}" data-k="price" type="number" inputmode="decimal" value="${esc(sv.price)}" placeholder="מחיר">
      <select data-svc="${i}" data-k="cat">${INCOME_CATS.map((c) => `<option ${c === sv.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <button class="del" data-act="delsvc" data-i="${i}" aria-label="מחיקה">✕</button>
    </div>`).join('');

  return `
    <div class="card">
      <h3>🎯 יעד הכנסות חודשי</h3>
      <div class="field"><input id="goalIn" type="number" inputmode="decimal" value="${esc(s.goal)}" placeholder="למשל 8000 (0 = בלי יעד)"></div>
    </div>

    <div class="card">
      <h3>⚡ טיפולים להוספה מהירה</h3>
      <p class="small muted" style="margin-top:-6px">המחירים הקבועים שלך. לחיצה על טיפול במסך החודש פותחת אותו מוכן לשמירה.</p>
      ${svc}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn" data-act="addsvc">+ טיפול</button>
        <button class="btn primary" data-act="savesettings">שמירה</button>
      </div>
    </div>

    <div class="card">
      <h3>⬇️ ייצוא וגיבוי</h3>
      <div class="btn-row">
        <button class="btn" data-act="csvmonth">אקסל: ${MONTHS[state.m]}</button>
        <button class="btn" data-act="csvall">אקסל: הכל</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn" data-act="backup">גיבוי (קובץ)</button>
        <button class="btn" data-act="restore">שחזור מגיבוי</button>
      </div>
      <input id="restoreFile" type="file" accept="application/json" class="hidden">
    </div>

    ${backend?.mode === 'cloud' ? `<div class="card"><button class="btn danger block" data-act="logout">יציאה מהחשבון</button></div>` : `
    <div class="card small muted">📱 כרגע הנתונים נשמרים רק בטלפון הזה. כדאי לעשות גיבוי מדי פעם.</div>`}`;
}

/* ---------- טופס הוספה / עריכה ---------- */
function defaultDate() {
  return state.y === now.getFullYear() && state.m === now.getMonth() ? today() : `${ymKey(state.y, state.m)}-01`;
}
function openForm(tx, preset = {}) {
  state.editing = tx?.id || null;
  state.form = tx
    ? { ...tx }
    : { type: 'income', amount: '', date: defaultDate(), cat: INCOME_CATS[0], method: ls.get('nogagel-lastMethod', 'cash'), client: '', note: '', ...preset };
  drawForm();
  $('#modal').classList.add('open');
  if (!tx && !preset.amount) setTimeout(() => $('#fAmount')?.focus(), 250);
}
function closeForm() { $('#modal').classList.remove('open'); state.form = null; state.editing = null; }

function drawForm() {
  const f = state.form;
  const inc = f.type === 'income';
  const cats = inc ? INCOME_CATS : EXPENSE_CATS;
  $('#sheet').innerHTML = `
    <h2>${state.editing ? 'עריכת תנועה' : 'תנועה חדשה'} <button class="x" data-act="close" aria-label="סגירה">✕</button></h2>
    <div class="seg">
      <button class="inc ${inc ? 'on' : ''}" data-set="type" data-v="income">💗 הכנסה</button>
      <button class="exp ${!inc ? 'on' : ''}" data-set="type" data-v="expense">🛒 הוצאה</button>
    </div>
    <div class="field"><label>סכום (₪)</label>
      <input id="fAmount" class="amount-in" type="number" inputmode="decimal" min="0" step="any" value="${esc(f.amount)}" data-in="amount" placeholder="0"></div>
    <div class="field"><label>${inc ? 'איך שילמו' : 'איך שילמתי'}</label>
      <div class="chips">${METHODS.map((m) => `<button class="chip ${f.method === m.id ? 'on' : ''}" data-set="method" data-v="${m.id}">${m.icon} ${m.label}</button>`).join('')}</div></div>
    <div class="field"><label>קטגוריה</label>
      <div class="chips">${cats.map((c) => `<button class="chip ${f.cat === c ? 'on' : ''}" data-set="cat" data-v="${esc(c)}">${CAT_ICON[c] || ''} ${esc(c)}</button>`).join('')}</div></div>
    <div class="field"><label>תאריך</label><input type="date" value="${esc(f.date)}" data-in="date"></div>
    ${inc ? `<div class="field"><label>שם הלקוחה (לא חובה)</label><input value="${esc(f.client)}" data-in="client" list="clientList" placeholder="למשל: מאיה">
      <datalist id="clientList">${clientNames().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>` : ''}
    <div class="field"><label>הערה (לא חובה)</label><input value="${esc(f.note)}" data-in="note" placeholder="${inc ? 'למשל: עיצוב פרנץ׳' : 'למשל: 3 גוונים חדשים'}"></div>
    <button class="btn primary block" data-act="save">שמירה</button>
    ${state.editing ? `<button class="btn danger block" style="margin-top:8px" data-act="delete">מחיקה</button>` : ''}`;
}
function clientNames() {
  return [...new Set(state.txs.filter((t) => t.client).map((t) => t.client.trim()))].sort((a, b) => a.localeCompare(b, 'he'));
}

async function saveForm() {
  const f = state.form;
  const amount = parseFloat(f.amount);
  if (!(amount > 0)) { toast('צריך לכתוב סכום'); $('#fAmount')?.focus(); return; }
  if (!f.date) { toast('צריך לבחור תאריך'); return; }
  const tx = { type: f.type, amount, date: f.date, cat: f.cat, method: f.method, client: f.type === 'income' ? (f.client || '').trim() : '', note: (f.note || '').trim() };
  if (f.created) tx.created = f.created;
  ls.set('nogagel-lastMethod', f.method);
  const editing = state.editing;
  closeForm();
  try {
    if (editing) await backend.update(editing, tx); else await backend.add(tx);
    toast(editing ? 'עודכן ✨' : (tx.type === 'income' ? 'נוסף! 💸💅' : 'ההוצאה נשמרה'));
    // אם נשמר לחודש אחר - קופצים אליו
    const [yy, mm] = tx.date.split('-').map(Number);
    if (yy !== state.y || mm - 1 !== state.m) { state.y = yy; state.m = mm - 1; render(); }
  } catch (e) { toast('שגיאה בשמירה'); console.error(e); }
}

/* ---------- ייצוא ---------- */
function download(content, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCSV(list, name) {
  if (!list.length) { toast('אין מה לייצא'); return; }
  const rows = [['תאריך', 'סוג', 'סכום', 'קטגוריה', 'אמצעי תשלום', 'לקוחה', 'הערה'],
    ...[...list].sort((a, b) => a.date.localeCompare(b.date)).map((t) =>
      [t.date, t.type === 'income' ? 'הכנסה' : 'הוצאה', t.amount, t.cat, method(t.method).label, t.client || '', t.note || ''])];
  const s = sums(list);
  rows.push([], ['', 'סה"כ הכנסות', s.inc], ['', 'סה"כ הוצאות', s.exp], ['', 'רווח נקי', s.net]);
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(csv, name, 'text/csv;charset=utf-8');
}

/* ---------- אירועים ---------- */
document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }

  const set = e.target.closest('[data-set]');
  if (set && state.form) {
    const k = set.dataset.set, v = set.dataset.v;
    if (k === 'type' && state.form.type !== v) state.form.cat = (v === 'income' ? INCOME_CATS : EXPENSE_CATS)[0];
    state.form[k] = v;
    drawForm();
    return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.id === 'modal') closeForm(); return; }
  const act = el.dataset.act;

  switch (act) {
    case 'add': openForm(null); break;
    case 'quick': {
      const sv = state.settings.services[+el.dataset.i];
      openForm(null, { type: 'income', amount: sv.price, cat: sv.cat });
      break;
    }
    case 'edit': openForm(state.txs.find((t) => t.id === el.dataset.id)); break;
    case 'close': closeForm(); break;
    case 'save': saveForm(); break;
    case 'delete':
      if (confirm('למחוק את התנועה?')) {
        const id = state.editing; closeForm();
        try { await backend.remove(id); toast('נמחק'); } catch { toast('שגיאה במחיקה'); }
      }
      break;
    case 'prev': if (state.m === 0) { state.m = 11; state.y--; } else state.m--; render(); break;
    case 'next': if (state.m === 11) { state.m = 0; state.y++; } else state.m++; render(); break;
    case 'yprev': state.y--; render(); break;
    case 'ynext': state.y++; render(); break;
    case 'gomonth': state.m = +el.dataset.m; state.tab = 'month'; render(); window.scrollTo(0, 0); break;
    case 'addsvc': state.settings.services.push({ name: '', price: 0, cat: INCOME_CATS[0] }); render(); break;
    case 'delsvc': state.settings.services.splice(+el.dataset.i, 1); render(); break;
    case 'savesettings': {
      state.settings.goal = parseFloat($('#goalIn').value) || 0;
      state.settings.services = state.settings.services.filter((s) => s.name.trim()).map((s) => ({ ...s, price: parseFloat(s.price) || 0 }));
      try { await backend.saveSettings(state.settings); toast('נשמר 💗'); } catch { toast('שגיאה בשמירה'); }
      render();
      break;
    }
    case 'csvmonth': exportCSV(monthTxs(state.y, state.m), `NogaGel-${ymKey(state.y, state.m)}.csv`); break;
    case 'csvyear': exportCSV(state.txs.filter((t) => (t.date || '').startsWith(state.y + '-')), `NogaGel-${state.y}.csv`); break;
    case 'csvall': exportCSV(state.txs, 'NogaGel-all.csv'); break;
    case 'backup':
      download(JSON.stringify({ app: 'NogaGel', version: VERSION, exported: new Date().toISOString(), settings: state.settings, txs: state.txs }, null, 1),
        `NogaGel-backup-${today()}.json`, 'application/json');
      break;
    case 'restore': $('#restoreFile').click(); break;
    case 'logout': if (confirm('לצאת מהחשבון?')) window.__logout?.(); break;
  }
});

document.addEventListener('input', (e) => {
  const k = e.target.dataset.in;
  if (k && state.form) { state.form[k] = e.target.value; return; }
  const i = e.target.dataset.svc;
  if (i !== undefined) state.settings.services[+i][e.target.dataset.k] = e.target.value;
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'restoreFile' && e.target.files[0]) {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.txs)) throw new Error('bad');
      const existing = new Set(state.txs.map((t) => `${t.date}|${t.amount}|${t.cat}|${t.type}|${t.client}|${t.note}`));
      const fresh = data.txs.filter((t) => !existing.has(`${t.date}|${t.amount}|${t.cat}|${t.type}|${t.client}|${t.note}`));
      if (!confirm(`לשחזר ${fresh.length} תנועות מהגיבוי? (כפולות מדולגות)`)) return;
      for (const t of fresh) { const { id, ...rest } = t; await backend.add(rest); }
      if (data.settings) { state.settings = { ...state.settings, ...data.settings }; await backend.saveSettings(state.settings); }
      toast(`שוחזרו ${fresh.length} תנועות`);
      render();
    } catch { toast('הקובץ לא תקין'); }
    e.target.value = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.form) closeForm();
  if (e.key === 'Enter' && state.form && e.target.tagName === 'INPUT') { e.preventDefault(); saveForm(); }
});

boot().catch((e) => { console.error(e); toast('בעיה בחיבור, עובדים במצב מקומי'); start(localBackend()); });
