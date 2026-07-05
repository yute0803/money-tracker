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
  entries.push({
    id: uid(),
    date: $('#add-date').value,
    type: addType,
    category: addCategory,
    amount,
    note: $('#add-note').value.trim(),
  });
  saveEntries();
  $('#add-amount').value = '';
  $('#add-note').value = '';
  toast(`已記一筆${addType === 'expense' ? '支出' : '收入'} NT$ ${fmt(amount)}`);
});

/* ================= 明細頁 ================= */
let listMonth = monthKey(todayStr());

document.querySelectorAll('#page-list .month-arrow').forEach((b) =>
  b.addEventListener('click', () => { listMonth = shiftMonth(listMonth, Number(b.dataset.nav)); renderList(); }));

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
  entries = entries.filter((x) => x.id !== editId);
  saveEntries();
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
  saveEntries();
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

function renderStats() {
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
  $('#data-count').textContent = `目前共 ${entries.length} 筆紀錄,資料保存在此裝置的瀏覽器中,建議定期匯出備份。`;
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
      saveCats();
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
  saveCats();
  $('#cat-new-name').value = '';
  renderSettings();
  renderAddCats();
});

$('#btn-clear').addEventListener('click', () => {
  if (!confirm(`確定要清除全部 ${entries.length} 筆紀錄嗎?此動作無法復原,建議先匯出備份。`)) return;
  entries = [];
  saveEntries();
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
  loadSheet(importWb.SheetNames[0]);
  $('#import-overlay').classList.remove('hidden');
});

$('#import-sheet').addEventListener('change', (e) => loadSheet(e.target.value));

function loadSheet(name) {
  const ws = importWb.Sheets[name];
  importGrid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // 去掉全空列
  importGrid = importGrid.filter((row) => row.some((c) => String(c).trim() !== ''));
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

function buildMappingUI() {
  const headers = importGrid[0] || [];
  const fields = [
    ['map-date', 'date', true],
    ['map-amount', 'amount', true],
    ['map-type', 'type', false],
    ['map-category', 'category', false],
    ['map-note', 'note', false],
  ];
  fields.forEach(([selId, key, required]) => {
    const sel = document.getElementById(selId);
    sel.innerHTML = '';
    if (!required) {
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
    const g = guessCol(headers, GUESS[key]);
    sel.value = String(g !== -1 ? g : (required ? 0 : -1));
    sel.onchange = renderImportPreview;
  });
  $('#map-fallback').onchange = renderImportPreview;
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
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); // 20260705
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseAmountVal(v) {
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[,\s]/g, '').replace(/^(NT\$|NTD|TWD|\$|＄|元)?/i, '').replace(/元$/, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const INCOME_WORDS = ['收入', '收', '入帳', '入账', 'income', 'in', '+'];

function mappedRows() {
  const iDate = Number($('#map-date').value);
  const iAmt = Number($('#map-amount').value);
  const iType = Number($('#map-type').value);
  const iCat = Number($('#map-category').value);
  const iNote = Number($('#map-note').value);
  const fallback = $('#map-fallback').value;

  const out = [];
  for (let r = 1; r < importGrid.length; r++) {
    const row = importGrid[r];
    const date = parseDateVal(row[iDate]);
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
    const category = iCat >= 0 && String(row[iCat]).trim() ? String(row[iCat]).trim() : '其他';
    const note = iNote >= 0 ? String(row[iNote]).trim() : '';
    out.push({ date, type, category, amount, note, valid: date !== null && amount !== null && amount > 0 });
  }
  return out;
}

function renderImportPreview() {
  const rows = mappedRows();
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
$('#import-confirm').addEventListener('click', () => {
  const rows = mappedRows().filter((r) => r.valid);
  if (!rows.length) { toast('沒有可匯入的資料'); return; }
  if ($('#import-replace').checked) entries = [];
  rows.forEach((r) => {
    entries.push({ id: uid(), date: r.date, type: r.type, category: r.category, amount: r.amount, note: r.note });
    if (!categories[r.type].includes(r.category)) categories[r.type].push(r.category);
  });
  saveEntries();
  saveCats();
  renderAddCats();
  renderSettings();
  $('#import-overlay').classList.add('hidden');
  $('#import-replace').checked = false;
  toast(`成功匯入 ${rows.length} 筆紀錄`);
});

/* ================= Service Worker ================= */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
