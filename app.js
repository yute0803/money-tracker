/* ================= 資料層 ================= */
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
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
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
  if (typeof cloudEnabled === 'undefined' || !cloudEnabled) {
    acc.textContent = '雲端同步尚未設定,資料只保存在此裝置。';
    loginBtn.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  } else if (cloudUser) {
    acc.textContent = `已登入:${cloudUser.email}。資料會自動同步到雲端,離線記帳也會在連線後補同步。`;
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    acc.textContent = '未登入:資料只保存在此裝置。使用 Google 登入後,資料會同步到你的帳號,換裝置也能接續使用。';
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
  }
  const store = (typeof cloudUser !== 'undefined' && cloudUser) ? '已同步至雲端' : '保存在此裝置的瀏覽器中';
  $('#data-count').textContent = `目前共 ${entries.length} 筆紀錄,${store},建議定期匯出備份。`;
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
  btn.textContent = cloudUser ? '匯入並同步中…' : '匯入中…';
  try {
    const newEntries = rows.map((r) => ({ id: uid(), date: r.date, type: r.type, category: r.category, amount: r.amount, note: r.note }));
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
  // 本機既有資料屬於這個帳號(或從未登入過)才併入雲端,避免混到別人的帳號
  const lastUid = localStorage.getItem('mt.lastUid');
  localStorage.setItem('mt.lastUid', u.uid);
  if (entries.length && (!lastUid || lastUid === u.uid)) {
    const snap = await entriesCol().get();
    const cloudIds = new Set(snap.docs.map((d) => d.id));
    const missing = entries.filter((e) => !cloudIds.has(e.id));
    if (missing.length) {
      toast(`正在把本機 ${missing.length} 筆資料同步到雲端…`);
      await uploadEntries(missing);
    }
    const catSnap = await metaDoc().get();
    if (!catSnap.exists) await metaDoc().set({ categories });
  }
  unsubEntries = entriesCol().onSnapshot((snap) => {
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
}

async function uploadEntries(list) {
  for (let i = 0; i < list.length; i += 450) {
    const batch = fbDb.batch();
    list.slice(i, i + 450).forEach((e) => batch.set(entriesCol().doc(e.id), e));
    await batch.commit();
  }
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
  if (replace) await clearAllEntries();
  entries = entries.concat(list);
  saveEntries();
  if (cloudUser) {
    try {
      await uploadEntries(list);
    } catch (err) {
      console.error(err);
      const hint = String(err.code || '').includes('permission')
        ? '雲端寫入被拒(請到 Firebase 主控台確認 Firestore 安全規則已發布)'
        : '雲端同步失敗:' + (err.code || err.message);
      toast(hint);
    }
  }
}
async function clearAllEntries() {
  const old = entries;
  entries = [];
  saveEntries();
  if (cloudUser) {
    for (let i = 0; i < old.length; i += 450) {
      const batch = fbDb.batch();
      old.slice(i, i + 450).forEach((e) => batch.delete(entriesCol().doc(e.id)));
      await batch.commit();
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
  try {
    await fbAuth.signInWithPopup(provider);
    toast('登入成功!');
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    if (err.code === 'auth/popup-blocked') {
      alert('登入視窗被瀏覽器擋住了。\n\n請允許此網站的「彈出式視窗」後再按一次登入:\n・電腦 Chrome:網址列右側會出現「已封鎖彈出式視窗」圖示,點它 → 一律允許\n・iPhone Safari:設定 App → Safari →「阻擋彈出式視窗」關閉');
      return;
    }
    // 少數環境不支援彈出視窗(某些 App 內建瀏覽器),改用整頁跳轉
    if (err.code === 'auth/operation-not-supported-in-this-environment') {
      try { await fbAuth.signInWithRedirect(provider); } catch (e2) { toast('登入失敗:' + (e2.code || e2.message)); }
      return;
    }
    toast('登入失敗:' + (err.code || err.message));
  }
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
  refreshUI();
  toast('已登出');
});

/* ================= Service Worker ================= */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
