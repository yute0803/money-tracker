/* ================= 資料層 ================= */
const APP_VERSION = 'v16';
const STORE_ENTRIES = 'mt.entries';
const STORE_CATS = 'mt.categories';

const DEFAULT_CATS = {
  expense: ['餐飲', '交通', '購物', '娛樂', '居住', '醫療', '教育', '其他'],
  income: ['薪水', '獎金', '投資', '其他'],
};

let entries = load(STORE_ENTRIES, []);
let categories = load(STORE_CATS, JSON.parse(JSON.stringify(DEFAULT_CATS)));

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveEntries() { localStorage.setItem(STORE_ENTRIES, JSON.stringify(entries)); }
function saveCats() { localStorage.setItem(STORE_CATS, JSON.stringify(categories)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ================= 共用工具 ================= */
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.round(n).toLocaleString('zh-Hant-TW');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(dateStr) { return dateStr.slice(0, 7); } // YYYY-MM
function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${y} 年 ${Number(m)} 月`;
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

let toastTimer;
function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function setupTypeToggle(containerId, onChange) {
  const box = document.getElementById(containerId);
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    box.querySelectorAll('.type-btn').forEach((b) => b.classList.toggle('active', b === btn));
    onChange(btn.dataset.type);
  });
}
function setToggleValue(containerId, type) {
  document.getElementById(containerId).querySelectorAll('.type-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.type === type));
}

const CHART_COLORS = ['#107a69', '#d9483b', '#e8a33d', '#4a7fd4', '#9b59b6', '#2e9e5b', '#d46a9e', '#7f8c8d', '#c0632b', '#5dade2'];

/* ================= 分頁切換 ================= */
const PAGE_TITLES = { add: '記帳', list: '明細', stats: '統計', settings: '設定' };
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    const page = tab.dataset.page;
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
    $('#header-title').textContent = PAGE_TITLES[page];
    if (page === 'list') renderList();
    if (page === 'stats') renderStats();
    if (page === 'settings') renderSettings();
  });
});

/* ================= 記帳頁 ================= */
let addType = 'expense';
let addCategory = null;

function renderAddCats() {
  const box = $('#add-categories');
  box.innerHTML = '';
  const cats = categories[addType];
  if (!cats.includes(addCategory)) addCategory = cats[0] || null;
  cats.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'cat-chip' + (c === addCategory ? ' active' : '');
    b.textContent = c;
    b.addEventListener('click', () => { addCategory = c; renderAddCats(); });
    box.appendChild(b);
  });
}

setupTypeToggle('add-type-toggle', (t) => { addType = t; renderAddCats(); });
$('#add-date').value = todayStr();
renderAddCats();

$('#add-save').addEventListener('click', () => {
  const amount = parseFloat(String($('#add-amount').value).replace(/,/g, ''));
  if (!amount || amount <= 0) { toast('請輸入有效金額'); return; }
  if (!$('#add-date').value) { toast('請選擇日期'); return; }
  if (!addCategory) { toast('請先在設定頁新增分類'); return; }
  addEntryData({
    id: uid(),
    date: $('#add-date').value,
    type: addType,
    category: addCategory,
    amount,
    note: $('#add-note').value.trim(),
  });
  $('#add-amount').value = '';
  $('#add-note').value = '';
  toast(`已記一筆${addType === 'expense' ? '支出' : '收入'} NT$ ${fmt(amount)}`);
});

/* ---- 貼上銀行通知,自動填入 ---- */
// 依商店名稱推分類(比一般關鍵字規則更準,優先套用)
const MERCHANT_RULES = [
  [/加油|中油|台亞/, '加油'],
  [/悠遊|一卡通|捷運|台鐵|高鐵|客運|公車|uber|計程|停車|遠通|etc/i, '交通'],
  [/壽司|麥當勞|肯德基|摩斯|漢堡|必勝客|達美樂|星巴克|路易莎|85度|咖啡|手搖|飲料|茶|餐|食|麵|飯|鍋|燒|烤|炸|便當|早午|豆漿|披薩|丼|冰|甜|7-11|7-ELEVEN|統一超商|全家|familymart|萊爾富|OK超商|超商/i, '餐飲'],
  [/電影|威秀|秀泰|ktv|錢櫃|好樂迪|netflix|spotify|steam|nintendo|playstation|遊戲/i, '娛樂'],
  [/全聯|家樂福|大潤發|愛買|好市多|costco|蝦皮|momo|pchome|淘寶|露天|uniqlo|ikea|寶雅|屈臣氏|康是美|誠品|百貨/i, '購物'],
  [/藥局|診所|醫院|牙醫|藥妝/, '醫療'],
  [/中華電信|台灣大|遠傳|台電|自來水|瓦斯|電費|水費|房租/, '居住'],
];
function merchantCategory(name) {
  if (!name) return null;
  for (const [re, cat] of MERCHANT_RULES) if (re.test(name)) return cat;
  return null;
}

/** 解析銀行通知文字(LINE/簡訊/App 推播),抓出金額、日期、商店、收支別 */
function parseBankNotification(text) {
  const t = String(text);
  const out = { type: 'expense', amount: null, date: null, merchant: '' };
  if (/退款|退刷|入帳|轉入|存入|薪資|匯入/.test(t)) out.type = 'income';
  const amt = t.match(/(?:NT\$|NTD|新臺幣|新台幣)\s*([\d,]+(?:\.\d+)?)/i) || t.match(/(?:金額|消費|扣款)[^\d]{0,6}([\d,]+(?:\.\d+)?)/) || t.match(/([\d,]+(?:\.\d+)?)\s*元/);
  if (amt) out.amount = parseFloat(amt[1].replace(/,/g, ''));
  let m = t.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) {
    out.date = validDate(+m[1], +m[2], +m[3]);
  } else if ((m = t.match(/(\d{1,2})[\/月](\d{1,2})/))) {
    // 沒有年份:先當今年,若變成未來日期則視為去年
    const y = new Date().getFullYear();
    let d = validDate(y, +m[1], +m[2]);
    if (d && d > todayStr()) d = validDate(y - 1, +m[1], +m[2]);
    out.date = d;
  }
  m = t.match(/(?:商店名稱|消費商店|商店|特店|店名)[::\s]*([^\n◆♦・,,。;;!!??]+)/);
  if (m) {
    out.merchant = m[1]
      .replace(/\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}.*$/, '') // 去掉尾端跟著的日期
      .trim();
  }
  return out;
}

function applyParsedBank(p) {
  if (!p.amount || p.amount <= 0) return false;
  addType = p.type;
  setToggleValue('add-type-toggle', addType);
  let cat = merchantCategory(p.merchant) || (p.merchant ? guessCategory(p.merchant, addType === 'income') : '其他');
  if (!categories[addType].includes(cat)) cat = '其他';
  addCategory = cat;
  renderAddCats();
  $('#add-amount').value = p.amount;
  $('#add-date').value = p.date || todayStr();
  $('#add-note').value = p.merchant || '';
  toast('已自動填入,確認內容後按「儲存」', 3500);
  return true;
}

$('#btn-paste-bank').addEventListener('click', async () => {
  // 先試著直接讀剪貼簿(需要使用者同意);不行就開手動貼上視窗
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* 無權限或不支援 */ }
  if (text && applyParsedBank(parseBankNotification(text))) return;
  $('#paste-text').value = '';
  $('#paste-overlay').classList.remove('hidden');
});
$('#paste-cancel').addEventListener('click', () => $('#paste-overlay').classList.add('hidden'));
$('#paste-parse').addEventListener('click', () => {
  const p = parseBankNotification($('#paste-text').value);
  if (!p.amount || p.amount <= 0) { toast('找不到金額,請確認貼上的內容有包含金額'); return; }
  $('#paste-overlay').classList.add('hidden');
  applyParsedBank(p);
});

// iPhone 捷徑等外部來源可用 ?add=<通知文字> 直接帶入
(function () {
  const t = new URLSearchParams(location.search).get('add');
  if (!t) return;
  history.replaceState(null, '', location.pathname); // 清掉網址參數,避免重新整理重複帶入
  if (!applyParsedBank(parseBankNotification(t))) {
    $('#paste-text').value = t;
    $('#paste-overlay').classList.remove('hidden');
  }
})();

/* ================= 明細頁 ================= */
let listMonth = monthKey(todayStr());

document.querySelectorAll('#page-list .month-arrow').forEach((b) =>
  b.addEventListener('click', () => { listMonth = shiftMonth(listMonth, Number(b.dataset.nav)); renderList(); }));

// 點月份 → 直接選年月
function openMonthPicker(pickId, current) {
  const p = document.getElementById(pickId);
  p.value = current;
  if (p.showPicker) { try { p.showPicker(); } catch { p.focus(); } } else p.focus();
}
$('#list-month-label').addEventListener('click', () => openMonthPicker('list-month-pick', listMonth));
$('#list-month-pick').addEventListener('change', (e) => {
  if (e.target.value) { listMonth = e.target.value; renderList(); }
});

function monthEntries(key) {
  return entries.filter((e) => monthKey(e.date) === key);
}

function renderList() {
  $('#list-month-label').textContent = monthLabel(listMonth);
  const items = monthEntries(listMonth).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  let income = 0, expense = 0;
  items.forEach((e) => (e.type === 'income' ? (income += e.amount) : (expense += e.amount)));
  $('#list-income').textContent = fmt(income);
  $('#list-expense').textContent = fmt(expense);
  $('#list-balance').textContent = fmt(income - expense);

  const box = $('#entry-list');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<div class="empty-hint">這個月還沒有紀錄</div>';
    return;
  }
  // 依日期分組
  const groups = new Map();
  items.forEach((e) => {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  });
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  groups.forEach((list, date) => {
    const g = document.createElement('div');
    g.className = 'day-group';
    const dayTotal = list.reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
    const d = new Date(date + 'T00:00:00');
    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML = `<span>${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} 週${WEEK[d.getDay()]}</span><span>${dayTotal >= 0 ? '+' : '-'}${fmt(Math.abs(dayTotal))}</span>`;
    const card = document.createElement('div');
    card.className = 'day-card';
    list.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'entry-row';
      row.innerHTML = `
        <span class="entry-cat">${escapeHtml(e.category)}</span>
        <span class="entry-note">${escapeHtml(e.note || '')}</span>
        <span class="entry-amount ${e.type === 'income' ? 'income-text' : 'expense-text'}">${e.type === 'income' ? '+' : '-'}${fmt(e.amount)}</span>`;
      row.addEventListener('click', () => openEdit(e.id));
      card.appendChild(row);
    });
    g.appendChild(head);
    g.appendChild(card);
    box.appendChild(g);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= 編輯彈窗 ================= */
let editId = null;
let editType = 'expense';

setupTypeToggle('edit-type-toggle', (t) => { editType = t; fillEditCats(); });

function fillEditCats(selected) {
  const sel = $('#edit-category');
  sel.innerHTML = '';
  const cats = [...categories[editType]];
  if (selected && !cats.includes(selected)) cats.unshift(selected);
  cats.forEach((c) => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  if (selected) sel.value = selected;
}

function openEdit(id) {
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  editId = id;
  editType = e.type;
  setToggleValue('edit-type-toggle', e.type);
  $('#edit-amount').value = e.amount;
  $('#edit-date').value = e.date;
  fillEditCats(e.category);
  $('#edit-note').value = e.note || '';
  $('#edit-overlay').classList.remove('hidden');
}
$('#edit-cancel').addEventListener('click', () => $('#edit-overlay').classList.add('hidden'));
$('#edit-delete').addEventListener('click', () => {
  if (!confirm('確定要刪除這筆紀錄嗎?')) return;
  removeEntryData(editId);
  $('#edit-overlay').classList.add('hidden');
  renderList();
  toast('已刪除');
});
$('#edit-save').addEventListener('click', () => {
  const e = entries.find((x) => x.id === editId);
  if (!e) return;
  const amount = parseFloat(String($('#edit-amount').value).replace(/,/g, ''));
  if (!amount || amount <= 0) { toast('請輸入有效金額'); return; }
  if (!$('#edit-date').value) { toast('請選擇日期'); return; }
  e.amount = amount;
  e.date = $('#edit-date').value;
  e.type = editType;
  e.category = $('#edit-category').value;
  e.note = $('#edit-note').value.trim();
  updateEntryData(e);
  $('#edit-overlay').classList.add('hidden');
  renderList();
  toast('已更新');
});

/* ================= 統計頁 ================= */
let statsMonth = monthKey(todayStr());
let statsType = 'expense';

document.querySelectorAll('#page-stats .month-arrow').forEach((b) =>
  b.addEventListener('click', () => { statsMonth = shiftMonth(statsMonth, Number(b.dataset.nav)); renderStats(); }));
setupTypeToggle('stats-type-toggle', (t) => { statsType = t; renderStats(); });
$('#stats-month-label').addEventListener('click', () => openMonthPicker('stats-month-pick', statsMonth));
$('#stats-month-pick').addEventListener('change', (e) => {
  if (e.target.value) { statsMonth = e.target.value; renderStats(); }
});

function renderStats() {
  // 全部總覽(不分月份)
  let tInc = 0, tExp = 0;
  entries.forEach((e) => (e.type === 'income' ? (tInc += e.amount) : (tExp += e.amount)));
  $('#total-income').textContent = fmt(tInc);
  $('#total-expense').textContent = fmt(tExp);
  $('#total-balance').textContent = fmt(tInc - tExp);

  $('#stats-month-label').textContent = monthLabel(statsMonth);
  const items = monthEntries(statsMonth).filter((e) => e.type === statsType);
  const byCat = new Map();
  let total = 0;
  items.forEach((e) => {
    byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);
    total += e.amount;
  });
  const ranked = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  // 圓餅圖
  const donutBox = $('#stats-donut');
  if (!ranked.length) {
    donutBox.innerHTML = `<div class="empty-hint">這個月沒有${statsType === 'expense' ? '支出' : '收入'}紀錄</div>`;
  } else {
    donutBox.innerHTML = donutSvg(ranked, total);
  }

  // 分類排行
  const rankBox = $('#stats-cats');
  rankBox.innerHTML = '';
  ranked.forEach(([cat, amt], i) => {
    const pct = total ? (amt / total) * 100 : 0;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const row = document.createElement('div');
    row.className = 'rank-row';
    row.innerHTML = `
      <div class="rank-top">
        <span>${escapeHtml(cat)}<span class="rank-pct">${pct.toFixed(1)}%</span></span>
        <span>NT$ ${fmt(amt)}</span>
      </div>
      <div class="rank-bar-bg"><div class="rank-bar" style="width:${pct}%;background:${color}"></div></div>`;
    rankBox.appendChild(row);
  });

  // 近 6 個月趨勢
  $('#stats-trend').innerHTML = trendSvg();
}

function donutSvg(ranked, total) {
  const cx = 90, cy = 90, r = 70, stroke = 30;
  const C = 2 * Math.PI * r;
  let offset = 0;
  let segs = '';
  ranked.forEach(([, amt], i) => {
    const frac = amt / total;
    const len = frac * C;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${Math.max(len - 1.5, 0.5)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
  });
  const label = statsType === 'expense' ? '總支出' : '總收入';
  return `<svg viewBox="0 0 180 180" style="max-width:230px;margin:0 auto" role="img" aria-label="${label}分類圓餅圖">
    ${segs}
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="12" fill="var(--text-dim)">${label}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="17" font-weight="600" fill="var(--text)">${fmt(total)}</text>
  </svg>`;
}

function trendSvg() {
  // 以統計頁目前月份為最後一個月,往前推 6 個月
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(statsMonth, -i));
  const data = months.map((m) => {
    let inc = 0, exp = 0;
    monthEntries(m).forEach((e) => (e.type === 'income' ? (inc += e.amount) : (exp += e.amount)));
    return { m, inc, exp };
  });
  const maxV = Math.max(1, ...data.map((d) => Math.max(d.inc, d.exp)));
  const W = 560, H = 200, padB = 26, padT = 14;
  const groupW = W / 6;
  const barW = Math.min(26, groupW / 3);
  let bars = '', labels = '';
  data.forEach((d, i) => {
    const gx = i * groupW + groupW / 2;
    const hInc = ((H - padB - padT) * d.inc) / maxV;
    const hExp = ((H - padB - padT) * d.exp) / maxV;
    bars += `<rect x="${gx - barW - 2}" y="${H - padB - hInc}" width="${barW}" height="${Math.max(hInc, d.inc ? 2 : 0)}" rx="3" fill="var(--income)"/>`;
    bars += `<rect x="${gx + 2}" y="${H - padB - hExp}" width="${barW}" height="${Math.max(hExp, d.exp ? 2 : 0)}" rx="3" fill="var(--expense)"/>`;
    labels += `<text x="${gx}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--text-dim)">${Number(d.m.slice(5))}月</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近六個月收支趨勢圖">
    <line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="var(--border)"/>
    ${bars}${labels}
    <g font-size="12">
      <rect x="8" y="6" width="11" height="11" rx="2" fill="var(--income)"/><text x="24" y="16" fill="var(--text-dim)">收入</text>
      <rect x="64" y="6" width="11" height="11" rx="2" fill="var(--expense)"/><text x="80" y="16" fill="var(--text-dim)">支出</text>
    </g>
  </svg>`;
}

/* ================= 設定頁 ================= */
let catManageType = 'expense';
setupTypeToggle('cat-type-toggle', (t) => { catManageType = t; renderSettings(); });

function renderSettings() {
  // 帳號狀態
  const acc = $('#account-status');
  const loginBtn = $('#btn-login');
  const logoutBtn = $('#btn-logout');
  const syncBtn = $('#btn-sync');
  const dedupeBtn = $('#btn-dedupe');
  const forceUploadBtn = $('#btn-force-upload');
  const forceDownloadBtn = $('#btn-force-download');
  [syncBtn, dedupeBtn, forceUploadBtn, forceDownloadBtn, logoutBtn].forEach((btn) => { if (btn) btn.disabled = !!syncBusy; });
  if (typeof cloudEnabled === 'undefined' || !cloudEnabled) {
    acc.textContent = '雲端同步尚未設定,資料只保存在此裝置。';
    loginBtn.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    syncBtn.classList.add('hidden');
    dedupeBtn.classList.add('hidden');
    forceUploadBtn.classList.add('hidden');
    forceDownloadBtn.classList.add('hidden');
  } else if (cloudUser) {
    const cloudText = cloudEntryCount === null ? '正在讀取雲端資料…' : `雲端目前 ${fmt(cloudEntryCount)} 筆`;
    const syncText = syncBusy ? (syncStatusText || '同步中…') : (lastSyncAt ? `上次同步 ${lastSyncAt.toLocaleTimeString('zh-Hant-TW', { hour: '2-digit', minute: '2-digit' })}` : '等待同步');
    acc.textContent = `已登入:${cloudUser.email}。${cloudText},${syncText}。`;
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    syncBtn.classList.remove('hidden');
    dedupeBtn.classList.remove('hidden');
    forceUploadBtn.classList.remove('hidden');
    forceDownloadBtn.classList.remove('hidden');
  } else {
    acc.textContent = '未登入:資料只保存在此裝置。使用 Google 登入後,資料會同步到你的帳號,換裝置也能接續使用。';
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    syncBtn.classList.add('hidden');
    dedupeBtn.classList.add('hidden');
    forceUploadBtn.classList.add('hidden');
    forceDownloadBtn.classList.add('hidden');
  }
  $('#app-version').textContent = `App 版本:${APP_VERSION}`;
  const store = (typeof cloudUser !== 'undefined' && cloudUser)
    ? `本機 ${fmt(entries.length)} 筆、雲端 ${cloudEntryCount === null ? '讀取中' : fmt(cloudEntryCount) + ' 筆'}`
    : `目前共 ${fmt(entries.length)} 筆紀錄,保存在此裝置的瀏覽器中`;
  $('#data-count').textContent = `${store},建議定期匯出備份。`;
  const box = $('#cat-manage');
  box.innerHTML = '';
  categories[catManageType].forEach((c) => {
    const chip = document.createElement('button');
    chip.className = 'cat-chip';
    chip.innerHTML = `${escapeHtml(c)}<span class="x">✕</span>`;
    chip.addEventListener('click', () => {
      const used = entries.some((e) => e.type === catManageType && e.category === c);
      if (used && !confirm(`「${c}」已有紀錄在使用,刪除分類不會刪除紀錄,確定移除嗎?`)) return;
      categories[catManageType] = categories[catManageType].filter((x) => x !== c);
      persistCats();
      renderSettings();
      renderAddCats();
    });
    box.appendChild(chip);
  });
}

$('#cat-add-btn').addEventListener('click', () => {
  const name = $('#cat-new-name').value.trim();
  if (!name) return;
  if (categories[catManageType].includes(name)) { toast('分類已存在'); return; }
  categories[catManageType].push(name);
  persistCats();
  $('#cat-new-name').value = '';
  renderSettings();
  renderAddCats();
});

$('#btn-update').addEventListener('click', async () => {
  toast('清除快取並更新中…');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    if (window.caches) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
  } catch (e) { console.error(e); }
  location.href = location.pathname + '?u=' + Date.now();
});

$('#btn-clear').addEventListener('click', async () => {
  const scope = cloudUser ? '(含雲端資料)' : '';
  if (!confirm(`確定要清除全部 ${entries.length} 筆紀錄嗎${scope}?此動作無法復原,建議先匯出備份。`)) return;
  await clearAllEntries();
  renderSettings();
  toast('已清除全部資料');
});

/* ================= 匯出 ================= */
function exportRows() {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      日期: e.date,
      類型: e.type === 'income' ? '收入' : '支出',
      分類: e.category,
      金額: e.amount,
      備註: e.note || '',
    }));
}
$('#btn-export-xlsx').addEventListener('click', () => {
  if (!entries.length) { toast('沒有資料可匯出'); return; }
  const ws = XLSX.utils.json_to_sheet(exportRows());
  ws['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '收支記錄');
  XLSX.writeFile(wb, `收支記錄_${todayStr()}.xlsx`);
});
$('#btn-export-csv').addEventListener('click', () => {
  if (!entries.length) { toast('沒有資料可匯出'); return; }
  const ws = XLSX.utils.json_to_sheet(exportRows());
  const csv = '﻿' + XLSX.utils.sheet_to_csv(ws);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `收支記錄_${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ================= 匯入 ================= */
let importWb = null;
let importGrid = []; // 目前工作表的二維陣列,第一列為標題

$('#btn-import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    importWb = XLSX.read(buf, { cellDates: true });
  } catch (err) {
    console.error(err);
    toast('無法讀取這個檔案');
    return;
  }
  const sheetSel = $('#import-sheet');
  sheetSel.innerHTML = '';
  importWb.SheetNames.forEach((n) => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    sheetSel.appendChild(o);
  });
  $('#import-sheet-row').classList.toggle('hidden', importWb.SheetNames.length <= 1);
  $('#import-all-sheets').checked = importWb.SheetNames.length > 1; // 多工作表預設全部匯入
  loadSheet(importWb.SheetNames[0]);
  $('#import-overlay').classList.remove('hidden');
});

$('#import-sheet').addEventListener('change', (e) => loadSheet(e.target.value));

function sheetGrid(name) {
  return XLSX.utils.sheet_to_json(importWb.Sheets[name], { header: 1, defval: '' })
    .filter((row) => row.some((c) => String(c).trim() !== ''));
}

function loadSheet(name) {
  importGrid = sheetGrid(name);
  buildMappingUI();
}

const GUESS = {
  date: ['日期', '时间', '時間', 'date', '交易日', '消費日'],
  amount: ['金額', '金额', 'amount', '價格', '价格', 'money', '花費', '费用', '費用'],
  type: ['類型', '类型', 'type', '收支', '收/支', '收支別'],
  category: ['分類', '分类', 'category', '類別', '类别', '項目', '项目', '科目'],
  note: ['備註', '备注', 'note', '說明', '说明', '描述', '內容', '内容', '名稱', '名称', 'memo'],
};

function guessCol(headers, keys) {
  for (const kw of keys) {
    const idx = headers.findIndex((h) => String(h).toLowerCase().includes(kw.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** 在前 8 列中找同時含「日期」與「金額」的標題列 */
function findHeaderRow(grid) {
  for (let i = 0; i < Math.min(8, grid.length); i++) {
    const cells = grid[i].map((c) => String(c));
    if (cells.some((c) => c.includes('日期')) && cells.some((c) => c.includes('金額'))) return i;
  }
  return 0;
}

/** 偵測「收入/支出分列」格式:收入欄與支出欄後面各跟一個金額欄 */
function detectDual(headers) {
  const iInc = headers.findIndex((c) => String(c).includes('收入'));
  const iExp = headers.findIndex((c) => String(c).includes('支出'));
  if (iInc !== -1 && iExp !== -1 &&
      String(headers[iInc + 1] || '').includes('金額') &&
      String(headers[iExp + 1] || '').includes('金額')) {
    return { iInc, iExp };
  }
  return null;
}

// 結轉/統計列,不是真實收支
const SKIP_NAMES = /累計|餘額|合計|小計|結餘|上月|月份$/;
const CLAIM_PENDING = '待請款';
const CLAIM_PAID = '已還款';

// 名稱 → 分類的推斷規則(名稱會保留在備註)
const CAT_RULES = [
  [/早餐/, '早餐'], [/中餐|午餐/, '中餐'], [/晚餐/, '晚餐'],
  [/宵夜|點心|飲料|手搖|咖啡|甜點|冰|零食|麵包/, '餐飲'],
  [/加油|油錢/, '加油'], [/計程車|uber|taxi/i, '計程車'],
  [/公車|捷運|火車|高鐵|客運|停車|過路|機車|汽車|輪胎|保養/, '交通'],
  [/衣|褲|鞋|襪|帽/, '衣服'], [/醫|藥|診所|牙|眼科/, '醫療'],
  [/股|證券|基金|債/, '投資'],
  [/房租|租金|水費|電費|瓦斯|網路|電信|電話費|管理費/, '居住'],
  [/電影|遊|ktv|唱歌|門票|球|泳/i, '娛樂'],
];
const INC_RULES = [
  [/薪|加班/, '薪水'], [/獎金|年終|紅包/, '獎金'], [/股利|配息|利息|股息|^a\d/, '投資'],
];
function guessCategory(name, isIncome) {
  for (const [re, cat] of (isIncome ? INC_RULES : CAT_RULES)) if (re.test(name)) return cat;
  return '其他';
}

function fillColSelect(sel, headers, optional) {
  sel.innerHTML = '';
  if (optional) {
    const o = document.createElement('option');
    o.value = '-1'; o.textContent = '(不使用)';
    sel.appendChild(o);
  }
  headers.forEach((h, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${colName(i)}: ${String(h).slice(0, 14) || '(空白)'}`;
    sel.appendChild(o);
  });
}

function setFormatVisibility() {
  const dual = $('#map-format').value === 'dual';
  document.querySelectorAll('.single-only').forEach((el) => el.classList.toggle('hidden', dual));
  document.querySelectorAll('.dual-only').forEach((el) => el.classList.toggle('hidden', !dual));
}

function buildMappingUI() {
  const headerRow = findHeaderRow(importGrid);
  const headers = importGrid[headerRow] || [];
  const dual = detectDual(headers);
  $('#map-format').value = dual ? 'dual' : 'single';

  const fields = [
    ['map-date', false], ['map-amount', false], ['map-type', true],
    ['map-category', true], ['map-note', true],
    ['map-inc-name', true], ['map-inc-amt', false],
    ['map-exp-name', true], ['map-exp-amt', false],
  ];
  fields.forEach(([selId, optional]) => {
    const sel = document.getElementById(selId);
    fillColSelect(sel, headers, optional);
    sel.onchange = renderImportPreview;
  });

  const g = (key) => guessCol(headers, GUESS[key]);
  const pick = (selId, idx, fallback) => { $('#' + selId).value = String(idx !== -1 ? idx : fallback); };
  pick('map-date', g('date'), 0);
  pick('map-amount', g('amount'), 0);
  pick('map-type', g('type'), -1);
  pick('map-category', g('category'), -1);
  pick('map-note', g('note'), -1);
  if (dual) {
    pick('map-inc-name', dual.iInc, 0);
    pick('map-inc-amt', dual.iInc + 1, 0);
    pick('map-exp-name', dual.iExp, 0);
    pick('map-exp-amt', dual.iExp + 1, 0);
    $('#map-note').value = '-1'; // 雙欄格式的名稱會自動放進備註
  }

  $('#all-sheets-row').classList.toggle('hidden', importWb.SheetNames.length <= 1);
  ['map-format', 'map-fallback'].forEach((id) => { document.getElementById(id).onchange = () => { setFormatVisibility(); renderImportPreview(); }; });
  ['import-all-sheets', 'import-carry', 'import-fixfuture'].forEach((id) => { document.getElementById(id).onchange = renderImportPreview; });
  setFormatVisibility();
  renderImportPreview();
}

function colName(i) {
  let s = '';
  i++;
  while (i > 0) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

/** 解析各種日期格式,回傳 YYYY-MM-DD 或 null */
function parseDateVal(v) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel 序號日期
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[年月.]/g, '/').replace(/日/g, '').replace(/-/g, '/');
  let m = s.match(/^(\d{2,4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    let y = Number(m[1]);
    if (y < 200) y += 1911;           // 民國年
    else if (y < 100) y += 2000;
    return validDate(y, Number(m[2]), Number(m[3]));
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); // 20260705
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function validDate(y, mo, d) {
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseAmountVal(v) {
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[,\s]/g, '').replace(/^(NT\$|NTD|TWD|\$|＄|元)?/i, '').replace(/元$/, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const INCOME_WORDS = ['收入', '收', '入帳', '入账', 'income', 'in', '+'];

/** 依目前選項解析單一工作表的資料列 */
function mappedRowsForGrid(grid) {
  const dual = $('#map-format').value === 'dual';
  const carry = $('#import-carry').checked;
  const fixFuture = $('#import-fixfuture').checked;
  const today = todayStr();
  const iDate = Number($('#map-date').value);
  const iNote = Number($('#map-note').value);
  const headerRow = findHeaderRow(grid);

  const out = [];
  let lastDate = null;
  const resolveDate = (row) => {
    let date = parseDateVal(row[iDate]);
    if (date) lastDate = date;
    else if (carry && lastDate) date = lastDate;
    if (date && fixFuture && date > today) date = (Number(date.slice(0, 4)) - 1) + date.slice(4);
    return date;
  };

  if (dual) {
    const iIncN = Number($('#map-inc-name').value);
    const iIncA = Number($('#map-inc-amt').value);
    const iExpN = Number($('#map-exp-name').value);
    const iExpA = Number($('#map-exp-amt').value);
    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r];
      const date = resolveDate(row);
      if (!date) continue;
      const incName = iIncN >= 0 ? String(row[iIncN]).trim() : '';
      const incAmount = parseAmountVal(row[iIncA]);
      const expName = iExpN >= 0 ? String(row[iExpN]).trim() : '';
      const expAmount = parseAmountVal(row[iExpA]);
      const extraNote = iNote >= 0 ? String(row[iNote]).trim() : '';
      const hasExpenseSide = !!expName || (expAmount !== null && expAmount > 0);

      if (incAmount !== null && incAmount > 0 && !SKIP_NAMES.test(incName)) {
        const isClaimPaid = hasExpenseSide;
        const note = [incName, isClaimPaid ? expName : '', extraNote, isClaimPaid ? CLAIM_PAID : ''].filter(Boolean).join(' ');
        out.push({
          date,
          type: 'income',
          category: isClaimPaid ? '還款' : guessCategory(incName || extraNote, true),
          amount: incAmount,
          note,
          valid: true,
        });
      }

      if (expAmount !== null && expAmount > 0 && !SKIP_NAMES.test(expName)) {
        const claimNote = incAmount === 0 ? CLAIM_PENDING : (incAmount !== null && incAmount > 0 ? CLAIM_PAID : '');
        const note = [expName, extraNote, claimNote].filter(Boolean).join(' ');
        out.push({
          date,
          type: 'expense',
          category: guessCategory(expName || extraNote, false),
          amount: expAmount,
          note,
          valid: true,
        });
      }
    }
  } else {
    const iAmt = Number($('#map-amount').value);
    const iType = Number($('#map-type').value);
    const iCat = Number($('#map-category').value);
    const fallback = $('#map-fallback').value;
    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r];
      const date = resolveDate(row);
      let amount = parseAmountVal(row[iAmt]);
      if (date === null && amount === null) continue; // 整列無效,略過
      let type = null;
      if (iType >= 0) {
        const t = String(row[iType]).trim().toLowerCase();
        if (t) type = INCOME_WORDS.some((w) => t.includes(w)) ? 'income' : 'expense';
      }
      if (type === null) {
        if (fallback === 'sign') type = amount !== null && amount < 0 ? 'expense' : 'income';
        else type = fallback;
      }
      if (amount !== null) amount = Math.abs(amount);
      const note = iNote >= 0 ? String(row[iNote]).trim() : '';
      const category = iCat >= 0 && String(row[iCat]).trim()
        ? String(row[iCat]).trim()
        : (note ? guessCategory(note, type === 'income') : '其他');
      out.push({ date, type, category, amount, note, valid: !!date && amount !== null && amount > 0 });
    }
  }
  return out;
}

/** 依「全部工作表」選項收集所有要匯入的列 */
function collectImportRows() {
  if ($('#import-all-sheets').checked) {
    return importWb.SheetNames.flatMap((n) => mappedRowsForGrid(sheetGrid(n)));
  }
  return mappedRowsForGrid(importGrid);
}

function renderImportPreview() {
  const rows = collectImportRows();
  const ok = rows.filter((r) => r.valid).length;
  let html = '<table><tr><th>日期</th><th>類型</th><th>分類</th><th>金額</th><th>備註</th></tr>';
  rows.slice(0, 5).forEach((r) => {
    html += `<tr>
      <td class="${r.date ? '' : 'bad'}">${r.date || '無法解析'}</td>
      <td>${r.type === 'income' ? '收入' : '支出'}</td>
      <td>${escapeHtml(r.category)}</td>
      <td class="${r.valid ? '' : 'bad'}">${r.amount !== null ? fmt(r.amount) : '無法解析'}</td>
      <td>${escapeHtml(r.note.slice(0, 12))}</td></tr>`;
  });
  html += `</table>`;
  $('#import-preview').innerHTML = html;
  $('#import-confirm').textContent = `匯入 ${ok} 筆`;
  $('#import-confirm').disabled = ok === 0;
}

$('#import-cancel').addEventListener('click', () => $('#import-overlay').classList.add('hidden'));
$('#import-confirm').addEventListener('click', async () => {
  const rows = collectImportRows().filter((r) => r.valid);
  if (!rows.length) { toast('沒有可匯入的資料'); return; }
  const btn = $('#import-confirm');
  btn.disabled = true;
  btn.textContent = '匯入中…';
  try {
    const newEntries = rows.map((r) => ({ id: uid(), date: r.date, type: r.type, category: r.category, amount: r.amount, note: r.note }));
    // 重複匯入偵測:若大部分內容和現有紀錄相同,先警告(勾了「先清空」則不需檢查)
    if (!$('#import-replace').checked && entries.length) {
      const existing = new Map();
      entries.forEach((e) => { const k = contentKey(e); existing.set(k, (existing.get(k) || 0) + 1); });
      let dup = 0;
      for (const e of newEntries) {
        const k = contentKey(e);
        const c = existing.get(k) || 0;
        if (c > 0) { dup++; existing.set(k, c - 1); }
      }
      if (dup > newEntries.length * 0.5) {
        const go = confirm(`⚠️ 這份資料看起來已經匯入過了:${fmt(dup)}/${fmt(newEntries.length)} 筆與現有紀錄內容相同。\n\n繼續匯入會變成重複資料。\n\n(若是想重新匯入,請取消後勾選「匯入前先清空現有資料」)\n\n仍要繼續嗎?`);
        if (!go) { renderImportPreview(); return; }
      }
    }
    rows.forEach((r) => {
      if (!categories[r.type].includes(r.category)) categories[r.type].push(r.category);
    });
    await bulkAddEntries(newEntries, $('#import-replace').checked);
    persistCats();
    renderAddCats();
    renderSettings();
    $('#import-overlay').classList.add('hidden');
    $('#import-replace').checked = false;
    toast(`成功匯入 ${rows.length} 筆紀錄`);
    // 跳到最新一筆資料的月份,立刻看得到匯入成果
    const latest = newEntries.reduce((m, e) => (e.date > m ? e.date : m), newEntries[0].date);
    listMonth = monthKey(latest);
    document.querySelector('.tab[data-page="list"]').click();
  } catch (err) {
    console.error(err);
    toast('匯入失敗:' + (err.code || err.message));
  } finally {
    btn.disabled = false;
  }
});

/* ================= 雲端同步 (Firebase) ================= */
const cloudEnabled = !!window.FIREBASE_CONFIG && typeof firebase !== 'undefined';
let fbAuth = null, fbDb = null, cloudUser = null;
let unsubEntries = null, unsubCats = null;
let cloudEntryCount = null;
let syncBusy = false;
let lastSyncAt = null;
let syncStatusText = '';

if (cloudEnabled) {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  fbAuth = firebase.auth();
  fbDb = firebase.firestore();
  fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  fbAuth.getRedirectResult().catch((e) => {
    if (e.code !== 'auth/no-auth-event') toast('登入失敗:' + (e.code || e.message));
  });
  fbAuth.onAuthStateChanged((u) => {
    cloudUser = u;
    if (u) startSync(u).catch((e) => { console.error(e); toast('同步啟動失敗:' + (e.code || e.message)); });
    else stopSync();
    renderSettings();
  });
}

function entriesCol() { return fbDb.collection('users').doc(cloudUser.uid).collection('entries'); }
function metaDoc() { return fbDb.collection('users').doc(cloudUser.uid).collection('meta').doc('config'); }

async function startSync(u) {
  cloudEntryCount = null;
  renderSettings();
  // 本機既有資料屬於這個帳號(或從未登入過)才併入雲端,避免混到別人的帳號
  const lastUid = localStorage.getItem('mt.lastUid');
  localStorage.setItem('mt.lastUid', u.uid);
  if (localStorage.getItem('mt.replaceCloud') === '1' && entries.length) {
    // 上次「以本機覆蓋雲端」沒完成(例如額度用盡):自動續傳
    await reconcileCloudToLocal();
  } else if (!lastUid || lastUid === u.uid) {
    try { await runFullSync('登入同步中…'); }
    catch (err) { console.error(err); }
    try {
      const catSnap = await metaDoc().get();
      if (!catSnap.exists) await metaDoc().set({ categories });
    } catch (err) { console.error(err); }
  }
  unsubEntries = entriesCol().onSnapshot((snap) => {
    cloudEntryCount = snap.size;
    // 「以本機覆蓋雲端」未完成前,雲端內容不可靠,不能反過來蓋掉本機
    if (localStorage.getItem('mt.replaceCloud') === '1') {
      renderSettings();
      return;
    }
    if (syncBusy && snap.size < entries.length) {
      renderSettings();
      return;
    }
    entries = snap.docs.map((d) => d.data());
    saveEntries();
    refreshUI();
  }, (err) => { console.error(err); toast('同步發生錯誤,請稍後再試'); });
  unsubCats = metaDoc().onSnapshot((d) => {
    const data = d.data();
    if (data && data.categories) { categories = data.categories; saveCats(); renderAddCats(); }
  });
}

function stopSync() {
  if (unsubEntries) { unsubEntries(); unsubEntries = null; }
  if (unsubCats) { unsubCats(); unsubCats = null; }
  cloudEntryCount = null;
  syncBusy = false;
}

/** 比對本機與雲端:回傳雲端缺少的本機紀錄(含內容去重,避免兩台裝置各匯同份 Excel 變兩份) */
async function computeMissing() {
  const snap = await entriesCol().get({ source: 'server' });
  const cloudIds = new Set(snap.docs.map((d) => d.id));
  const cloudCount = new Map();
  snap.docs.forEach((d) => { const k = contentKey(d.data()); cloudCount.set(k, (cloudCount.get(k) || 0) + 1); });
  const missing = [];
  for (const e of entries) {
    if (cloudIds.has(e.id)) continue;
    const k = contentKey(e);
    const c = cloudCount.get(k) || 0;
    if (c > 0) { cloudCount.set(k, c - 1); continue; }
    missing.push(e);
  }
  return { missing, cloudSize: snap.size, cloudEntries: snap.docs.map((d) => d.data()) };
}

function contentKey(e) {
  return [e.date, e.type, e.category, e.amount, e.note].join('|');
}

async function runFullSync(label = '同步中…') {
  if (!cloudUser || syncBusy) return { uploaded: 0, downloaded: 0, cloudSize: cloudEntryCount || 0 };
  syncBusy = true;
  lastFullSyncAt = Date.now();
  setSyncStatus(label);
  try {
    const { missing, cloudSize, cloudEntries } = await computeMissing();
    const localIds = new Set(entries.map((e) => e.id));
    const localCount = new Map();
    entries.forEach((e) => localCount.set(contentKey(e), (localCount.get(contentKey(e)) || 0) + 1));
    const download = [];
    cloudEntries.forEach((e) => {
      if (localIds.has(e.id)) return;
      const k = contentKey(e);
      const n = localCount.get(k) || 0;
      if (n > 0) { localCount.set(k, n - 1); return; }
      download.push(e);
    });
    if (missing.length) {
      await uploadEntries(missing, (done, total) => toast(`補傳中… ${fmt(done)}/${fmt(total)} 筆`));
    }
    if (download.length) {
      entries = entries.concat(download);
      saveEntries();
      refreshUI();
    }
    cloudEntryCount = cloudSize + missing.length;
    lastSyncAt = new Date();
    toast(missing.length || download.length
      ? `✅ 同步完成:上傳 ${fmt(missing.length)} 筆、下載 ${fmt(download.length)} 筆`
      : `✅ 已是最新:雲端 ${fmt(cloudEntryCount)} 筆、本機 ${fmt(entries.length)} 筆`);
    renderSettings();
    return { uploaded: missing.length, downloaded: download.length, cloudSize: cloudEntryCount };
  } catch (err) {
    console.error(err);
    toast(cloudErrHint(err));
    throw err;
  } finally {
    syncBusy = false;
    syncStatusText = '';
    renderSettings();
  }
}

function setSyncStatus(text) {
  syncStatusText = text;
  toast(text);
  renderSettings();
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}逾時,請確認網路後再試一次`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function uploadEntries(list, onProgress) {
  const chunks = [];
  for (let i = 0; i < list.length; i += 450) chunks.push(list.slice(i, i + 450));
  let done = 0;
  for (const chunk of chunks) {
    const batch = fbDb.batch();
    chunk.forEach((e) => batch.set(entriesCol().doc(e.id), e));
    await withTimeout(batch.commit(), 90000, '雲端上傳');
    done += chunk.length;
    if (onProgress) onProgress(done, list.length);
  }
}

async function deleteCloudDocs(docs, onProgress) {
  let deleted = 0;
  for (let i = 0; i < docs.length; i += 450) {
    const chunk = docs.slice(i, i + 450);
    const batch = fbDb.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await withTimeout(batch.commit(), 90000, '清空雲端');
    deleted += chunk.length;
    if (onProgress) onProgress(deleted);
  }
  return deleted;
}

async function fetchCloudDocs() {
  const snap = await withTimeout(entriesCol().get({ source: 'server' }), 90000, '讀取雲端資料');
  return snap.docs;
}

async function fetchCloudEntries() {
  const docs = await fetchCloudDocs();
  return docs.map((d) => d.data());
}

function cloudErrHint(err) {
  const code = String(err.code || '');
  if (code.includes('resource-exhausted')) return '今日雲端免費額度已用完(每天下午 3 點左右重置),資料仍安全保存在本機';
  if (code.includes('permission')) return '雲端寫入被拒(請到 Firebase 主控台確認 Firestore 安全規則已發布)';
  return '雲端同步失敗:' + (err.code || err.message);
}

/** 背景上傳:不擋 UI,顯示進度,失敗時提示(資料已在本機) */
function uploadInBackground(list) {
  uploadEntries(list, (done, total) => toast(`雲端同步中… ${fmt(done)}/${fmt(total)} 筆`))
    .then(() => toast('✅ 雲端同步完成'))
    .catch((err) => { console.error(err); toast(cloudErrHint(err)); });
}

/* ---- 資料寫入(登入時同步寫雲端) ---- */
function addEntryData(e) {
  entries.push(e);
  saveEntries();
  if (cloudUser) entriesCol().doc(e.id).set(e).catch(console.error);
}
function updateEntryData(e) {
  saveEntries();
  if (cloudUser) entriesCol().doc(e.id).set(e).catch(console.error);
}
function removeEntryData(id) {
  entries = entries.filter((x) => x.id !== id);
  saveEntries();
  if (cloudUser) entriesCol().doc(id).delete().catch(console.error);
}
async function bulkAddEntries(list, replace) {
  if (replace) {
    // 「清空重匯」:本機立刻完成,雲端用「以本機覆蓋」方式在背景對齊;
    // 額度不足時保留旗標,下次開啟 App 自動續傳
    entries = list.slice();
    saveEntries();
    if (cloudUser) {
      localStorage.setItem('mt.replaceCloud', '1');
      await reconcileCloudToLocal();
    }
    return;
  }
  entries = entries.concat(list);
  saveEntries();
  if (cloudUser) {
    syncBusy = true;
    renderSettings();
    try {
      await uploadEntries(list, (done, total) => toast(`雲端上傳中… ${fmt(done)}/${fmt(total)} 筆`));
      cloudEntryCount = (cloudEntryCount || 0) + list.length;
      lastSyncAt = new Date();
      toast('✅ 雲端上傳完成');
    } catch (err) {
      // 雲端失敗不影響本機匯入結果;之後手動或自動同步會補傳
      console.error(err);
      toast(cloudErrHint(err) + '。之後按「🔄 立即重新同步」即可補傳', 6000);
    } finally {
      syncBusy = false;
      renderSettings();
    }
  }
}

/** 以本機為準對齊雲端:刪掉雲端多餘的、上傳本機全部。完成才移除旗標,失敗會在下次開啟時自動重試 */
async function reconcileCloudToLocal() {
  if (!cloudUser || syncBusy) return;
  syncBusy = true;
  renderSettings();
  try {
    setSyncStatus('正在讀取雲端現有資料…');
    const cloudDocs = await fetchCloudDocs();
    const localIds = new Set(entries.map((e) => e.id));
    const docsToDelete = cloudDocs.filter((d) => !localIds.has(d.id));
    if (docsToDelete.length) {
      await deleteCloudDocs(docsToDelete, (done) => setSyncStatus(`移除雲端舊資料… ${fmt(done)}/${fmt(docsToDelete.length)} 筆`));
    }
    await uploadEntries(entries, (done, total) => setSyncStatus(`上傳中… ${fmt(done)}/${fmt(total)} 筆`));
    await metaDoc().set({ categories }, { merge: true });
    localStorage.removeItem('mt.replaceCloud');
    cloudEntryCount = entries.length;
    lastSyncAt = new Date();
    toast(`✅ 雲端已更新為 ${fmt(entries.length)} 筆`);
  } catch (err) {
    console.error(err);
    toast(cloudErrHint(err) + '。本機資料已完成,下次開啟 App 會自動把雲端補齊', 7000);
  } finally {
    syncBusy = false;
    syncStatusText = '';
    renderSettings();
  }
}
async function clearAllEntries() {
  const old = entries;
  entries = [];
  saveEntries();
  if (cloudUser) {
    try {
      for (let i = 0; i < old.length; i += 450) {
        const batch = fbDb.batch();
        old.slice(i, i + 450).forEach((e) => batch.delete(entriesCol().doc(e.id)));
        await withTimeout(batch.commit(), 90000, '清除雲端資料');
      }
      cloudEntryCount = 0;
    } catch (err) {
      console.error(err);
      toast(cloudErrHint(err), 6000);
    }
  }
}
function persistCats() {
  saveCats();
  if (cloudUser) metaDoc().set({ categories }, { merge: true }).catch(console.error);
}

function refreshUI() {
  renderAddCats();
  const active = document.querySelector('.page.active').id;
  if (active === 'page-list') renderList();
  else if (active === 'page-stats') renderStats();
  else if (active === 'page-settings') renderSettings();
}

/* ---- 登入 / 登出 ---- */
$('#btn-login').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  try {
    await fbAuth.signInWithPopup(provider);
    toast('登入成功!');
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    // 主畫面 App 或不支援彈窗的環境:改用整頁跳轉
    if (standalone || err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      if (!standalone && err.code === 'auth/popup-blocked') {
        alert('登入視窗被瀏覽器擋住了。\n\n請允許此網站的「彈出式視窗」後再按一次登入:\n・電腦 Chrome:網址列右側會出現「已封鎖彈出式視窗」圖示,點它 → 一律允許');
        return;
      }
      try { await fbAuth.signInWithRedirect(provider); } catch (e2) { toast('登入失敗:' + (e2.code || e2.message)); }
      return;
    }
    toast('登入失敗:' + (err.code || err.message));
  }
});

$('#btn-sync').addEventListener('click', async () => {
  if (!cloudUser) return;
  try { await runFullSync('雙向檢查同步狀態中…'); }
  catch (err) { console.error(err); }
});

$('#btn-dedupe').addEventListener('click', async () => {
  if (syncBusy) return;
  // 先計算,經使用者確認後才動資料
  const seen = new Set();
  const removed = [];
  const clean = [];
  for (const e of entries) {
    const k = contentKey(e);
    if (seen.has(k)) { removed.push(e); continue; }
    seen.add(k);
    clean.push(e);
  }
  if (!removed.length) { toast('沒有找到內容完全相同的資料'); return; }
  const msg = `找到 ${fmt(removed.length)} 筆內容完全相同的紀錄(同日期、同分類、同金額、同備註)。\n\n⚠️ 注意:如果你真的在同一天記過兩筆一模一樣的帳(例如兩趟同價錢的計程車),第二筆也會被當成重複移除。\n\n建議先「匯出成 Excel」備份再執行。確定要移除嗎?`;
  if (!confirm(msg)) return;
  entries = clean;
  saveEntries();
  refreshUI();
  if (cloudUser) {
    syncBusy = true;
    renderSettings();
    try {
      for (let i = 0; i < removed.length; i += 450) {
        const batch = fbDb.batch();
        removed.slice(i, i + 450).forEach((e) => batch.delete(entriesCol().doc(e.id)));
        await withTimeout(batch.commit(), 90000, '清除雲端重複');
      }
      cloudEntryCount = entries.length;
      lastSyncAt = new Date();
      toast(`✅ 已移除 ${fmt(removed.length)} 筆重複(本機與雲端)`);
    } catch (err) {
      console.error(err);
      toast(cloudErrHint(err));
    } finally {
      syncBusy = false;
      syncStatusText = '';
      renderSettings();
    }
  } else {
    toast(`已移除 ${fmt(removed.length)} 筆重複`);
  }
});

$('#btn-force-upload').addEventListener('click', async () => {
  if (!cloudUser || syncBusy) return;
  const msg = `這會用本機 ${fmt(entries.length)} 筆資料覆蓋雲端資料(雲端多出來的會被刪除)。\n\n確定要繼續嗎?`;
  if (!confirm(msg)) return;
  localStorage.setItem('mt.replaceCloud', '1');
  await reconcileCloudToLocal();
});

$('#btn-force-download').addEventListener('click', async () => {
  if (!cloudUser || syncBusy) return;
  if (!confirm('這會用雲端資料取代此裝置的本機資料。本機尚未上傳的資料可能會消失,確定要繼續嗎?')) return;
  syncBusy = true;
  renderSettings();
  try {
    setSyncStatus('正在從雲端下載…');
    const cloudEntries = await fetchCloudEntries();
    entries = cloudEntries;
    saveEntries();
    const catSnap = await metaDoc().get({ source: 'server' });
    const data = catSnap.data();
    if (data && data.categories) {
      categories = data.categories;
      saveCats();
    }
    cloudEntryCount = entries.length;
    lastSyncAt = new Date();
    refreshUI();
    toast(`✅ 已從雲端下載 ${fmt(entries.length)} 筆`);
  } catch (err) {
    console.error(err);
    toast(cloudErrHint(err));
  } finally {
    syncBusy = false;
    syncStatusText = '';
    renderSettings();
  }
});

// 自動同步節流:15 分鐘內不重複觸發,避免每次切回畫面都全量讀取雲端(免費額度有限)
const AUTO_SYNC_MIN_INTERVAL = 15 * 60 * 1000;
let lastFullSyncAt = 0;
function scheduleForegroundSync() {
  if (!cloudUser || syncBusy) return;
  if (Date.now() - lastFullSyncAt < AUTO_SYNC_MIN_INTERVAL) return;
  runFullSync('自動同步中…').catch(() => {});
}
window.addEventListener('online', scheduleForegroundSync);
window.addEventListener('focus', scheduleForegroundSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleForegroundSync();
});
$('#btn-logout').addEventListener('click', async () => {
  if (!confirm('確定要登出嗎?登出後這台裝置上的資料會清空(雲端資料不受影響,重新登入即可取回)。')) return;
  stopSync();
  await fbAuth.signOut();
  entries = [];
  categories = JSON.parse(JSON.stringify(DEFAULT_CATS));
  saveEntries();
  saveCats();
  localStorage.removeItem('mt.lastUid');
  localStorage.removeItem('mt.replaceCloud');
  refreshUI();
  toast('已登出');
});

/* ================= Service Worker ================= */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

