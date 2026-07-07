/* ============================================================
   جدول النشر — monthly publish scheduler (Firebase RTDB)
   Data lives under `publishSchedule/` — never touches other keys.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- constants ---------- */
  const ROOT = 'publishSchedule';
  const PASSWORD = '1445';

  const DEFAULT_TAGS = {
    'd-clip':  { name: 'مقطع',   color: '#e54b2a' },
    'd-post':  { name: 'منشور',  color: '#0b6eb9' },
    'd-story': { name: 'ستوري',  color: '#f3c02b' },
    'd-event': { name: 'فعالية', color: '#41b9a6' }
  };

  const MEMBERS = [
    'ابو مزاحم','الشعيرة','أبو بندر','جمانة','خالد حسن','خالد','رجب','سحاب',
    'سراج','سعيد','شارد','شفق','طه','عاصم','علي مجدي','عمر','فرات','مايتو',
    'محمد سمير','مصطفى','ملك','منة','مورو','نجود','نواف','ورقاء','يوسف'
  ];
  const avatarUrl = (name) => 'MdwnhMembers/' + encodeURIComponent(name) + '.png';

  const WEEKDAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  const fmtMonth   = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' });
  const fmtHijriDay  = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', { day: 'numeric' });
  const fmtHijriMY   = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', { month: 'long', year: 'numeric' });
  const fmtFull    = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtHijriFull = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', { day: 'numeric', month: 'long' });

  const mqMobile = window.matchMedia('(max-width:640px)');

  /* ---------- state ---------- */
  const today = new Date();
  let view = { y: today.getFullYear(), m: today.getMonth() };
  let customTags = {};
  let tasks = {};
  let prevTasks = null;                  // for new-task notification diffing
  let isAdmin = sessionStorage.getItem('psAdmin') === '1';
  let notifyMe = localStorage.getItem('psNotifyMe') || null;
  let notifySel = null;
  let db = null, fb = null, fbStarted = false;
  let sheetDate = null;                  // date key of the open day sheet
  let editing = null;                    // { id, date, tags:Set, members:Set, photos:[] }
  let crop = null;                       // active image-transform session

  const allTags = () => Object.assign({}, DEFAULT_TAGS, customTags);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // normalize Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to ASCII
  const normDigits = (s) => String(s == null ? '' : s)
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0);

  const dateKey = (y, m, d) =>
    y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const keyToDate = (k) => {
    const p = k.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function tasksByDate() {
    const map = {};
    Object.keys(tasks).forEach((id) => {
      const t = tasks[id];
      if (!t || !t.date) return;
      (map[t.date] = map[t.date] || []).push(Object.assign({ id }, t));
    });
    Object.values(map).forEach((l) => l.sort((a, b) => (a.created || 0) - (b.created || 0)));
    return map;
  }

  function tagColor(tagId) {
    const t = allTags()[tagId];
    return t ? t.color : '#b3a998';
  }
  function tagName(tagId) {
    const t = allTags()[tagId];
    return t ? t.name : '؟';
  }

  /* soft gradient built from every tag color present on the day */
  function cellTint(colors) {
    const u = [...new Set(colors)].slice(0, 4);
    if (!u.length) return '';
    if (u.length === 1) return 'linear-gradient(155deg,' + u[0] + '40,' + u[0] + '12)';
    const stops = u.map((c, i) => c + '38 ' + Math.round((i / (u.length - 1)) * 100) + '%');
    return 'linear-gradient(135deg,' + stops.join(',') + ')';
  }

  /* ---------- markup ---------- */
  const root = document.createElement('div');
  root.id = 'psRoot';
  root.innerHTML = `
  <div class="ps-overlay" id="psCal" role="dialog" aria-modal="true" aria-label="جدول النشر">
    <div class="ps-panel">
      <div class="ps-head">
        <div class="ps-title">
          <span class="ps-emoji">🗓️</span>
          <div>
            <h2>جدول النشر</h2>
            <span class="ps-hijri-span" id="psHijriSpan"></span>
          </div>
        </div>
        <div class="ps-nav">
          <button class="ps-icon-btn" id="psPrev" aria-label="الشهر السابق">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <span class="ps-month" id="psMonth"></span>
          <button class="ps-icon-btn" id="psNext" aria-label="الشهر التالي">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button class="ps-today-btn" id="psToday">اليوم</button>
          <button class="ps-close" data-close="psCal" aria-label="إغلاق">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="ps-weekdays" id="psWeekdays"></div>
      <div class="ps-grid" id="psGrid"></div>
      <div class="ps-foot">
        <button class="ps-leader-btn" id="psLeaderBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          خيارات القائد
        </button>
        <span class="ps-admin-chip">✦ وضع القائد مفعّل <button id="psLogout">خروج</button></span>
        <button class="ps-notify-btn" id="psNotifyBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          <span id="psNotifyLabel">تفعيل الإشعارات</span>
        </button>
      </div>
    </div>
  </div>

  <div class="ps-overlay" id="psPass" role="dialog" aria-modal="true" aria-label="كلمة مرور القائد">
    <div class="ps-sub">
      <div class="ps-lockart">🔑</div>
      <div class="ps-sub-body">
        <h3 style="margin-bottom:4px">خيارات القائد</h3>
        <p>أدخل كلمة المرور لفتح إدارة الجدول</p>
        <div class="ps-pin" id="psPin" dir="ltr">
          <input class="ps-pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="الرقم الأول" />
          <input class="ps-pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="الرقم الثاني" />
          <input class="ps-pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="الرقم الثالث" />
          <input class="ps-pin-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="الرقم الرابع" />
        </div>
      </div>
      <div class="ps-sub-foot">
        <button class="ps-btn ghost" data-close="psPass">إلغاء</button>
        <button class="ps-btn primary" id="psPassGo">دخول</button>
      </div>
    </div>
  </div>

  <div class="ps-overlay" id="psSheet" role="dialog" aria-modal="true">
    <div class="ps-sub">
      <div class="ps-sub-head">
        <h3 id="psSheetTitle"></h3>
        <button class="ps-close" data-close="psSheet" aria-label="إغلاق">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="ps-sub-body" id="psSheetBody"></div>
      <div class="ps-sub-foot" id="psSheetFoot"></div>
    </div>
  </div>

  <div class="ps-overlay" id="psEditor" role="dialog" aria-modal="true">
    <div class="ps-sub">
      <div class="ps-sub-head">
        <h3 id="psEdTitle">مهمة جديدة<span class="ps-sub-date" id="psEdDate"></span></h3>
        <button class="ps-close" data-close="psEditor" aria-label="إغلاق">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="ps-sub-body">
        <div class="ps-field">
          <label>اسم المهمة <span class="req">*</span></label>
          <input class="ps-input" id="psEdName" type="text" placeholder="مثال: مقطع عن غزوة بدر" maxlength="80" />
        </div>
        <div class="ps-field">
          <label>الوسوم <span class="req">*</span> <span style="font-weight:600;color:#a49c90">(واحد على الأقل)</span></label>
          <div class="ps-chips" id="psEdTags"></div>
          <div class="ps-newtag" id="psNewTag">
            <input class="ps-input" id="psNewTagName" type="text" placeholder="اسم الوسم الجديد" maxlength="20" />
            <input class="ps-color" id="psNewTagColor" type="color" value="#a26bf2" title="اختر اللون" />
            <button class="ps-mini-btn" id="psNewTagAdd">إضافة</button>
          </div>
        </div>
        <div class="ps-field">
          <label>الأعضاء المكلَّفون <span class="req">*</span></label>
          <button class="ps-mempreview" id="psEdMembers" type="button"></button>
        </div>
        <div class="ps-field">
          <label>الصور <span style="font-weight:600;color:#a49c90">(اختياري · بحدّ أقصى صورتين)</span></label>
          <div class="ps-photoslots" id="psEdPhotos"></div>
        </div>
      </div>
      <div class="ps-sub-foot">
        <button class="ps-btn danger" id="psEdDelete" style="display:none">حذف</button>
        <button class="ps-btn ghost" data-close="psEditor">إلغاء</button>
        <button class="ps-btn primary" id="psEdSave">حفظ المهمة</button>
      </div>
    </div>
  </div>

  <div class="ps-overlay" id="psCrop" role="dialog" aria-modal="true" aria-label="ضبط الصورة">
    <div class="ps-sub">
      <div class="ps-sub-head">
        <h3>ضبط الصورة</h3>
        <button class="ps-close" data-close="psCrop" aria-label="إغلاق">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="ps-sub-body">
        <div class="ps-cropframe" id="psCropFrame">
          <img class="ps-cropimg" id="psCropImg" alt="" draggable="false" />
        </div>
        <div class="ps-cropctrl">
          <span class="zi">﹣</span>
          <input class="ps-cropslider" id="psCropSlider" type="range" min="1" max="3" step="0.01" value="1" aria-label="تكبير" />
          <span class="za">＋</span>
        </div>
        <p class="ps-crophint">اسحب الصورة لتحريكها · استخدم الشريط للتكبير والتصغير</p>
      </div>
      <div class="ps-sub-foot">
        <button class="ps-btn ghost" data-close="psCrop">إلغاء</button>
        <button class="ps-btn primary" id="psCropDone">إضافة الصورة</button>
      </div>
    </div>
  </div>

  <div class="ps-overlay" id="psMembers" role="dialog" aria-modal="true" aria-label="اختيار الأعضاء">
    <div class="ps-sub">
      <div class="ps-sub-head">
        <h3>اختر الأعضاء</h3>
        <button class="ps-close" data-close="psMembers" aria-label="إغلاق">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="ps-sub-body"><div class="ps-memgrid" id="psMemGrid"></div></div>
      <div class="ps-sub-foot">
        <button class="ps-btn primary" data-close="psMembers">تم ✓</button>
      </div>
    </div>
  </div>

  <div class="ps-overlay" id="psNotify" role="dialog" aria-modal="true" aria-label="إشعاراتي">
    <div class="ps-sub">
      <div class="ps-sub-head">
        <h3>إشعاراتي 🔔</h3>
        <button class="ps-close" data-close="psNotify" aria-label="إغلاق">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="ps-sub-body">
        <p class="ps-notify-lead">اختر اسمك — وستصلك إشعارات عند إسناد مهمة جديدة إليك، وعند حلول موعد مهمة اليوم.</p>
        <div class="ps-memgrid" id="psNotifyGrid"></div>
      </div>
      <div class="ps-sub-foot">
        <button class="ps-btn ghost" data-close="psNotify">إلغاء</button>
        <button class="ps-btn primary" id="psNotifyGo">تفعيل ✓</button>
      </div>
    </div>
  </div>

  <div class="ps-toast" id="psToast"></div>`;
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  $('psWeekdays').innerHTML = WEEKDAYS.map((w) => '<span>' + w + '</span>').join('');

  /* ---------- overlay helpers ---------- */
  function openLayer(id) {
    $(id).classList.add('open');
    document.body.classList.add('ps-lock');
  }
  function closeLayer(id) {
    $(id).classList.remove('open');
    if (!document.querySelector('.ps-overlay.open')) document.body.classList.remove('ps-lock');
  }
  root.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => closeLayer(b.dataset.close)));
  root.querySelectorAll('.ps-overlay').forEach((ov) =>
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeLayer(ov.id); }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.ps-overlay.open')];
    if (open.length) closeLayer(open[open.length - 1].id);
  });

  let toastT = null;
  function toast(msg) {
    const t = $('psToast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- firebase (lazy) ---------- */
  async function startFirebase() {
    if (fbStarted) return;
    fbStarted = true;
    try {
      const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      fb = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
      const app = appMod.initializeApp({
        apiKey: 'AIzaSyB8h_iwg1NZi-2Znccq1dWNX61SPo3alUA',
        authDomain: 'nawafdatabase.firebaseapp.com',
        databaseURL: 'https://nawafdatabase-default-rtdb.firebaseio.com',
        projectId: 'nawafdatabase',
        storageBucket: 'nawafdatabase.firebasestorage.app',
        messagingSenderId: '427694018752',
        appId: '1:427694018752:web:27563f2652d156172a9d25'
      });
      db = fb.getDatabase(app);
      fb.onValue(fb.ref(db, ROOT), (snap) => {
        const v = snap.val() || {};
        customTags = v.customTags || {};
        const nextTasks = v.tasks || {};
        runNotify(nextTasks);
        tasks = nextTasks;
        renderCalendar();
        if (sheetDate && $('psSheet').classList.contains('open')) renderSheet(sheetDate);
        if (editing && $('psEditor').classList.contains('open')) renderEdTags();
      }, () => toast('تعذّر الاتصال بقاعدة البيانات'));
    } catch (err) {
      fbStarted = false;
      toast('تعذّر تحميل الجدول — تحقق من الاتصال');
    }
  }

  /* ---------- calendar ---------- */
  function dayCellHTML(d, out, mobile, byDate) {
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    const dayTasks = byDate[key] || [];
    const isToday = sameDay(d, today);

    const colors = [];
    dayTasks.forEach((t) => (t.tags || []).forEach((tg) => colors.push(tagColor(tg))));
    const tint = cellTint(colors);

    const maxPills = mobile ? 3 : 2;
    const pills = dayTasks.slice(0, maxPills).map((t) =>
      '<span class="ps-pill" style="--pc:' + tagColor((t.tags || [])[0]) + '"><b>' +
      esc(t.name) + '</b></span>').join('') +
      (dayTasks.length > maxPills
        ? '<span class="ps-pill more">+' + (dayTasks.length - maxPills).toLocaleString('ar-EG') + ' أخرى</span>' : '');

    const photos = [];
    dayTasks.forEach((t) => (t.photos || []).forEach((p) => photos.push(p)));
    const phHtml = photos.slice(0, 2).map((p) =>
      '<span class="ps-ph"><img src="' + esc(p) + '" alt="" loading="lazy" /></span>').join('');

    const mems = [...new Set([].concat(...dayTasks.map((t) => t.members || [])))];
    const avHtml = mems.length
      ? '<span class="ps-avs">' +
        mems.slice(0, 5).map((n, i) =>
          '<img style="--i:' + i + '" src="' + avatarUrl(n) + '" alt="' + esc(n) + '" title="' + esc(n) + '" loading="lazy" />').join('') +
        (mems.length > 5 ? '<span class="plus" style="--i:5">+' + (mems.length - 5) + '</span>' : '') +
        '</span>'
      : '';

    const clickable = !out && (isAdmin || dayTasks.length);
    return '<div class="ps-cell' + (out ? ' out' : '') + (isToday ? ' today' : '') +
      (clickable ? ' clickable' : '') + '" data-date="' + key + '"' +
      (tint ? ' style="background:' + tint + ',#fff"' : '') + '>' +
      '<div class="ps-cellhead"><span class="wd">' + WEEKDAYS[d.getDay()] + '</span><span class="gd">' +
      d.getDate().toLocaleString('ar-EG') + '</span><span class="hj">' + fmtHijriDay.format(d) + '</span></div>' +
      '<div class="ps-pills">' + pills + '</div>' +
      '<div class="ps-mid">' + phHtml + '</div>' +
      avHtml +
      '</div>';
  }

  function renderCalendar() {
    const { y, m } = view;
    $('psMonth').textContent = fmtMonth.format(new Date(y, m, 15));
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const h1 = fmtHijriMY.format(first), h2 = fmtHijriMY.format(last);
    $('psHijriSpan').textContent = h1 === h2 ? h1 : h1 + ' — ' + h2;

    const byDate = tasksByDate();
    const mobile = mqMobile.matches;
    $('psWeekdays').style.display = mobile ? 'none' : 'grid';
    const grid = $('psGrid');
    grid.classList.toggle('mobile', mobile);

    const cells = [];
    if (mobile) {
      const daysIn = last.getDate();
      for (let dn = 1; dn <= daysIn; dn++)
        cells.push(dayCellHTML(new Date(y, m, dn), false, true, byDate));
    } else {
      const startOffset = first.getDay(); // 0 = Sunday, first column
      const daysIn = last.getDate();
      const totalCells = Math.ceil((startOffset + daysIn) / 7) * 7;
      for (let i = 0; i < totalCells; i++) {
        const d = new Date(y, m, i - startOffset + 1);
        cells.push(dayCellHTML(d, d.getMonth() !== m, false, byDate));
      }
    }
    grid.innerHTML = cells.join('');
  }

  if (mqMobile.addEventListener) {
    mqMobile.addEventListener('change', () => {
      if ($('psCal').classList.contains('open')) renderCalendar();
    });
  }

  $('psGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('.ps-cell.clickable');
    if (cell) openSheet(cell.dataset.date);
  });
  $('psPrev').addEventListener('click', () => { shiftMonth(-1); });
  $('psNext').addEventListener('click', () => { shiftMonth(1); });
  $('psToday').addEventListener('click', () => {
    view = { y: today.getFullYear(), m: today.getMonth() };
    renderCalendar();
  });
  function shiftMonth(dir) {
    const d = new Date(view.y, view.m + dir, 1);
    view = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
  }

  /* ---------- day sheet ---------- */
  function openSheet(key) {
    sheetDate = key;
    renderSheet(key);
    openLayer('psSheet');
  }
  function renderSheet(key) {
    const d = keyToDate(key);
    $('psSheetTitle').innerHTML = esc(fmtFull.format(d)) +
      '<span class="ps-sub-date">' + esc(fmtHijriFull.format(d)) + ' هـ</span>';
    const list = tasksByDate()[key] || [];
    const body = $('psSheetBody');

    if (!list.length) {
      body.innerHTML = '<div class="ps-empty"><span class="big">🌙</span>لا توجد مهام في هذا اليوم' +
        (isAdmin ? '<br>أضف أول مهمة من الزر بالأسفل!' : '') + '</div>';
    } else {
      body.innerHTML = list.map((t) => {
        const tags = (t.tags || []).map((tg) =>
          '<span class="ps-tag" style="background:' + tagColor(tg) + '">' + esc(tagName(tg)) + '</span>').join('');
        const mems = (t.members || []).map((n) =>
          '<span class="ps-mem"><img src="' + avatarUrl(n) + '" alt="" loading="lazy" />' + esc(n) + '</span>').join('');
        const phs = (t.photos || []).length
          ? '<div class="ps-phrow">' + t.photos.map((p) => '<img src="' + esc(p) + '" alt="" />').join('') + '</div>'
          : '';
        const btns = isAdmin
          ? '<div class="ps-cardbtns"><button class="ps-mini-btn" data-edit="' + t.id + '">✏️ تعديل</button>' +
            '<button class="ps-mini-btn del" data-del="' + t.id + '">🗑 حذف</button></div>'
          : '';
        return '<div class="ps-taskcard" style="--tc:' + tagColor((t.tags || [])[0]) + '">' +
          '<h4>' + esc(t.name) + '</h4>' +
          '<div class="ps-tagrow">' + tags + '</div>' +
          '<div class="ps-memrow">' + mems + '</div>' + phs + btns + '</div>';
      }).join('');
    }
    $('psSheetFoot').innerHTML = isAdmin
      ? '<button class="ps-btn primary" id="psSheetAdd">＋ مهمة جديدة</button>'
      : '<button class="ps-btn ghost" data-close="psSheet">إغلاق</button>';
    const addBtn = $('psSheetAdd');
    if (addBtn) addBtn.addEventListener('click', () => openEditor(key, null));
    $('psSheetFoot').querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => closeLayer('psSheet')));
    body.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openEditor(key, b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return;
        fb.remove(fb.ref(db, ROOT + '/tasks/' + b.dataset.del))
          .then(() => toast('حُذفت المهمة'))
          .catch(() => toast('تعذّر الحذف — حاول مجددًا'));
      }));
  }

  /* ---------- editor ---------- */
  function openEditor(key, taskId) {
    if (!isAdmin) return;
    const t = taskId ? tasks[taskId] : null;
    editing = {
      id: taskId || null,
      date: key,
      tags: new Set(t && t.tags ? t.tags : []),
      members: new Set(t && t.members ? t.members : []),
      photos: t && t.photos ? t.photos.slice(0, 2) : []
    };
    $('psEdName').value = t ? t.name : '';
    const d = keyToDate(key);
    $('psEdTitle').childNodes[0].textContent = taskId ? 'تعديل المهمة' : 'مهمة جديدة';
    $('psEdDate').textContent = fmtFull.format(d) + ' · ' + fmtHijriFull.format(d) + ' هـ';
    $('psEdDelete').style.display = taskId ? '' : 'none';
    $('psNewTag').classList.remove('open');
    $('psNewTagName').value = '';
    renderEdTags();
    renderEdMembers();
    renderEdPhotos();
    openLayer('psEditor');
    setTimeout(() => $('psEdName').focus(), 80);
  }

  function renderEdTags() {
    if (!editing) return;
    const tags = allTags();
    const html = Object.keys(tags).map((id) => {
      const t = tags[id];
      const chip = '<button type="button" class="ps-chip' + (editing.tags.has(id) ? ' sel' : '') +
        '" style="--cc:' + t.color + '" data-tag="' + esc(id) + '"><i></i>' + esc(t.name) + '</button>';
      // custom tags get a removable × in the corner
      return DEFAULT_TAGS[id]
        ? chip
        : '<span class="ps-chip-c">' + chip +
          '<button type="button" class="ps-chip-x" data-rmtag="' + esc(id) + '" title="حذف الوسم" aria-label="حذف الوسم">✕</button></span>';
    }).join('') + '<button type="button" class="ps-chip add" id="psTagPlus">＋ وسم جديد</button>';
    $('psEdTags').innerHTML = html;

    $('psEdTags').querySelectorAll('[data-tag]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.tag;
        editing.tags.has(id) ? editing.tags.delete(id) : editing.tags.add(id);
        renderEdTags();
      }));
    $('psEdTags').querySelectorAll('[data-rmtag]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!fb || !db) { toast('لحظة… يتم الاتصال بقاعدة البيانات'); return; }
        const id = b.dataset.rmtag;
        if (!confirm('حذف هذا الوسم؟ لن يؤثر على المهام السابقة.')) return;
        editing.tags.delete(id);
        delete customTags[id];
        renderEdTags();
        fb.remove(fb.ref(db, ROOT + '/customTags/' + id))
          .then(() => toast('حُذف الوسم'))
          .catch(() => toast('تعذّر حذف الوسم'));
      }));
    $('psTagPlus').addEventListener('click', () => {
      $('psNewTag').classList.toggle('open');
      if ($('psNewTag').classList.contains('open')) $('psNewTagName').focus();
    });
  }

  $('psNewTagAdd').addEventListener('click', () => {
    if (!fb || !db) { toast('لحظة… يتم الاتصال بقاعدة البيانات'); return; }
    const name = $('psNewTagName').value.trim();
    if (!name) { toast('اكتب اسم الوسم أولًا'); return; }
    const color = $('psNewTagColor').value;
    const r = fb.push(fb.ref(db, ROOT + '/customTags'));
    fb.set(r, { name, color })
      .then(() => {
        customTags[r.key] = { name, color };   // optimistic — onValue will confirm
        if (editing) editing.tags.add(r.key);
        $('psNewTagName').value = '';
        $('psNewTag').classList.remove('open');
        renderEdTags();
        toast('أُضيف الوسم «' + name + '»');
      })
      .catch(() => toast('تعذّر حفظ الوسم'));
  });

  function renderEdMembers() {
    if (!editing) return;
    const sel = [...editing.members];
    $('psEdMembers').innerHTML = sel.length
      ? sel.slice(0, 8).map((n) => '<img src="' + avatarUrl(n) + '" alt="' + esc(n) + '" title="' + esc(n) + '" />').join('') +
        '<span class="hint">' + sel.length.toLocaleString('ar-EG') + ' — اضغط للتعديل</span>'
      : '<span class="hint">👥 اضغط لاختيار الأعضاء…</span>';
  }
  $('psEdMembers').addEventListener('click', () => {
    renderMemberGrid();
    openLayer('psMembers');
  });
  function renderMemberGrid() {
    $('psMemGrid').innerHTML = MEMBERS.map((n) =>
      '<button type="button" class="ps-memcard' + (editing.members.has(n) ? ' sel' : '') +
      '" data-mem="' + esc(n) + '"><span class="tick">✓</span><img src="' + avatarUrl(n) +
      '" alt="" loading="lazy" /><span>' + esc(n) + '</span></button>').join('');
    $('psMemGrid').querySelectorAll('[data-mem]').forEach((b) =>
      b.addEventListener('click', () => {
        const n = b.dataset.mem;
        editing.members.has(n) ? editing.members.delete(n) : editing.members.add(n);
        b.classList.toggle('sel');
        renderEdMembers();
      }));
  }

  function renderEdPhotos() {
    if (!editing) return;
    $('psEdPhotos').innerHTML = [0, 1].map((i) => {
      const p = editing.photos[i];
      return p
        ? '<div class="ps-slot filled"><img src="' + esc(p) + '" alt="" /><button type="button" class="rm" data-rm="' + i + '">✕</button></div>'
        : '<label class="ps-slot"><span class="lbl"><span>📸</span>أضف صورة</span><input type="file" accept="image/*" data-add="' + i + '" /></label>';
    }).join('');
    $('psEdPhotos').querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        editing.photos.splice(Number(b.dataset.rm), 1);
        renderEdPhotos();
      }));
    $('psEdPhotos').querySelectorAll('[data-add]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const file = inp.files && inp.files[0];
        inp.value = '';
        if (!file) return;
        if (editing.photos.length >= 2) { toast('بحدّ أقصى صورتان لكل مهمة'); return; }
        openCrop(file);
      }));
  }

  /* ---------- image transform (drag + scale) ---------- */
  function openCrop(file) {
    const fr = new FileReader();
    fr.onerror = () => toast('تعذّر قراءة الصورة');
    fr.onload = () => {
      const probe = new Image();
      probe.onerror = () => toast('تعذّر قراءة الصورة');
      probe.onload = () => {
        crop = { iw: probe.naturalWidth, ih: probe.naturalHeight, scale: 1, panX: 0, panY: 0 };
        $('psCropImg').src = fr.result;
        $('psCropSlider').value = 1;
        openLayer('psCrop');
        requestAnimationFrame(() => { measureCrop(); layoutCrop(); });
      };
      probe.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function measureCrop() {
    const r = $('psCropFrame').getBoundingClientRect();
    crop.FW = r.width;
    crop.FH = r.height;
    crop.base = Math.max(crop.FW / crop.iw, crop.FH / crop.ih);
  }
  function layoutCrop() {
    if (!crop || !crop.FW) return;
    const dispW = crop.iw * crop.base * crop.scale;
    const dispH = crop.ih * crop.base * crop.scale;
    let left = (crop.FW - dispW) / 2 + crop.panX;
    let top = (crop.FH - dispH) / 2 + crop.panY;
    left = Math.min(0, Math.max(crop.FW - dispW, left));
    top = Math.min(0, Math.max(crop.FH - dispH, top));
    crop.panX = left - (crop.FW - dispW) / 2;
    crop.panY = top - (crop.FH - dispH) / 2;
    crop.left = left; crop.top = top; crop.dispW = dispW; crop.dispH = dispH;
    const el = $('psCropImg');
    el.style.width = dispW + 'px';
    el.style.height = dispH + 'px';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }
  (function bindCropDrag() {
    const frame = $('psCropFrame');
    let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;
    frame.addEventListener('pointerdown', (e) => {
      if (!crop) return;
      dragging = true; sx = e.clientX; sy = e.clientY; spx = crop.panX; spy = crop.panY;
      frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener('pointermove', (e) => {
      if (!dragging || !crop) return;
      crop.panX = spx + (e.clientX - sx);
      crop.panY = spy + (e.clientY - sy);
      layoutCrop();
    });
    const end = (e) => { dragging = false; try { frame.releasePointerCapture(e.pointerId); } catch (_) {} };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
  })();
  $('psCropSlider').addEventListener('input', () => {
    if (!crop) return;
    crop.scale = parseFloat($('psCropSlider').value);
    layoutCrop();
  });
  $('psCropDone').addEventListener('click', () => {
    if (!crop || !crop.FW) { closeLayer('psCrop'); return; }
    const OW = 800, OH = Math.round(OW * crop.FH / crop.FW);
    const ratio = OW / crop.FW;
    const c = document.createElement('canvas');
    c.width = OW; c.height = OH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, OW, OH);
    ctx.drawImage($('psCropImg'), crop.left * ratio, crop.top * ratio, crop.dispW * ratio, crop.dispH * ratio);
    const url = c.toDataURL('image/jpeg', 0.75);
    if (editing && editing.photos.length < 2) {
      editing.photos.push(url);
      renderEdPhotos();
    }
    crop = null;
    closeLayer('psCrop');
  });

  /* ---------- save / delete task ---------- */
  $('psEdSave').addEventListener('click', () => {
    if (!editing) return;
    if (!fb || !db) { toast('لحظة… يتم الاتصال بقاعدة البيانات'); return; }
    const name = $('psEdName').value.trim();
    if (!name) { toast('اكتب اسم المهمة'); $('psEdName').focus(); return; }
    if (!editing.tags.size) { toast('اختر وسمًا واحدًا على الأقل'); return; }
    if (!editing.members.size) { toast('كلّف عضوًا واحدًا على الأقل'); return; }

    const data = {
      name,
      date: editing.date,
      tags: [...editing.tags],
      members: [...editing.members],
      photos: editing.photos.slice(0, 2),
      created: editing.id && tasks[editing.id] ? (tasks[editing.id].created || Date.now()) : Date.now(),
      updated: Date.now()
    };
    const target = editing.id
      ? fb.ref(db, ROOT + '/tasks/' + editing.id)
      : fb.push(fb.ref(db, ROOT + '/tasks'));
    const btn = $('psEdSave');
    btn.disabled = true;
    fb.set(target, data)
      .then(() => {
        btn.disabled = false;
        closeLayer('psEditor');
        toast(editing.id ? 'تم تحديث المهمة ✓' : 'أُضيفت المهمة ✓');
        editing = null;
      })
      .catch(() => { btn.disabled = false; toast('تعذّر الحفظ — حاول مجددًا'); });
  });

  $('psEdDelete').addEventListener('click', () => {
    if (!editing || !editing.id) return;
    if (!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return;
    fb.remove(fb.ref(db, ROOT + '/tasks/' + editing.id))
      .then(() => { closeLayer('psEditor'); toast('حُذفت المهمة'); editing = null; })
      .catch(() => toast('تعذّر الحذف'));
  });

  /* ---------- admin auth ---------- */
  function applyAdmin() {
    document.body.classList.toggle('ps-admin', isAdmin);
    renderCalendar();
  }
  const pinBoxes = () => [...document.querySelectorAll('#psPin .ps-pin-box')];
  const readPin = () => normDigits(pinBoxes().map((b) => b.value).join(''));
  function clearPin() { pinBoxes().forEach((b) => { b.value = ''; b.classList.remove('err'); }); }
  function focusFirstPin() { const f = pinBoxes()[0]; if (f) f.focus(); }

  pinBoxes().forEach((box, i, arr) => {
    box.addEventListener('input', () => {
      box.value = normDigits(box.value).replace(/\D/g, '').slice(-1);
      if (box.value && i < arr.length - 1) arr[i + 1].focus();
      if (arr.every((b) => b.value)) tryPass();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) { arr[i - 1].focus(); }
      else if (e.key === 'Enter') { tryPass(); }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const src = (e.clipboardData || window.clipboardData).getData('text');
      const digits = normDigits(src).replace(/\D/g, '').slice(0, arr.length);
      arr.forEach((b, j) => { b.value = digits[j] || ''; });
      arr[Math.min(digits.length, arr.length - 1)].focus();
      if (arr.every((b) => b.value)) tryPass();
    });
  });

  $('psLeaderBtn').addEventListener('click', () => {
    clearPin();
    openLayer('psPass');
    setTimeout(focusFirstPin, 80);
  });
  function tryPass() {
    if (readPin() === PASSWORD) {
      isAdmin = true;
      sessionStorage.setItem('psAdmin', '1');
      closeLayer('psPass');
      clearPin();
      applyAdmin();
      toast('أهلًا أيها القائد ✦ اضغط أي يوم لإضافة مهمة');
    } else if (pinBoxes().every((b) => b.value)) {
      pinBoxes().forEach((b) => b.classList.add('err'));
      setTimeout(() => { clearPin(); focusFirstPin(); }, 450);
    }
  }
  $('psPassGo').addEventListener('click', tryPass);
  $('psLogout').addEventListener('click', () => {
    isAdmin = false;
    sessionStorage.removeItem('psAdmin');
    applyAdmin();
    toast('خرجت من وضع القائد');
  });

  /* ---------- notifications ---------- */
  function updateNotifyUI() {
    const btn = $('psNotifyBtn');
    const label = $('psNotifyLabel');
    if (notifyMe) {
      btn.classList.add('active');
      label.textContent = 'إشعارات: ' + notifyMe;
    } else {
      btn.classList.remove('active');
      label.textContent = 'تفعيل الإشعارات';
    }
  }
  $('psNotifyBtn').addEventListener('click', () => {
    if (notifyMe) {
      if (confirm('هل تريد إيقاف الإشعارات وإعادة الضبط؟')) {
        notifyMe = null;
        localStorage.removeItem('psNotifyMe');
        updateNotifyUI();
        toast('أُوقفت الإشعارات');
      }
    } else {
      openNotifyPicker();
    }
  });
  function openNotifyPicker() {
    notifySel = notifyMe || null;
    renderNotifyGrid();
    openLayer('psNotify');
  }
  function renderNotifyGrid() {
    $('psNotifyGrid').innerHTML = MEMBERS.map((n) =>
      '<button type="button" class="ps-memcard' + (notifySel === n ? ' sel' : '') +
      '" data-nmem="' + esc(n) + '"><span class="tick">✓</span><img src="' + avatarUrl(n) +
      '" alt="" loading="lazy" /><span>' + esc(n) + '</span></button>').join('');
    $('psNotifyGrid').querySelectorAll('[data-nmem]').forEach((b) =>
      b.addEventListener('click', () => { notifySel = b.dataset.nmem; renderNotifyGrid(); }));
  }
  $('psNotifyGo').addEventListener('click', () => {
    if (!notifySel) { toast('اختر اسمك أولًا'); return; }
    if (!('Notification' in window)) { toast('جهازك لا يدعم الإشعارات'); return; }
    Notification.requestPermission().then((p) => {
      if (p === 'granted') {
        notifyMe = notifySel;
        localStorage.setItem('psNotifyMe', notifyMe);
        updateNotifyUI();
        closeLayer('psNotify');
        toast('✔ ستصلك إشعارات مهامك يا ' + notifyMe);
        prevTasks = null;          // re-baseline so we don't spam existing tasks
        runNotify(tasks);          // fires today's due-tasks immediately
      } else {
        toast('لم يُسمح بالإشعارات من المتصفح');
      }
    }).catch(() => toast('تعذّر تفعيل الإشعارات'));
  });

  function sysNotify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: 'assets/icon-192.png' }); } catch (_) {}
  }
  function runNotify(nextTasks) {
    if (notifyMe && prevTasks) {
      Object.keys(nextTasks).forEach((id) => {
        const t = nextTasks[id];
        if (!t || !t.date) return;
        const now = (t.members || []).includes(notifyMe);
        const before = prevTasks[id] && (prevTasks[id].members || []).includes(notifyMe);
        if (now && !before) sysNotify('📋 مهمة جديدة لك', t.name);
      });
    }
    prevTasks = nextTasks;
    checkDueToday(nextTasks);
  }
  function checkDueToday(src) {
    if (!notifyMe) return;
    const storeKey = 'psDue_' + todayKey;
    let done;
    try { done = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch (_) { done = []; }
    // prune stale due-keys from previous days
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.indexOf('psDue_') === 0 && k !== storeKey) localStorage.removeItem(k);
    }
    Object.keys(src).forEach((id) => {
      const t = src[id];
      if (!t || t.date !== todayKey) return;
      if (!(t.members || []).includes(notifyMe)) return;
      if (done.includes(id)) return;
      sysNotify('⏰ مهمة اليوم', t.name + ' — مستحقة اليوم');
      done.push(id);
    });
    try { localStorage.setItem(storeKey, JSON.stringify(done)); } catch (_) {}
  }
  updateNotifyUI();

  /* ---------- entry point ---------- */
  const trigger = document.getElementById('openSchedule');
  if (trigger) trigger.addEventListener('click', () => {
    applyAdmin();
    renderCalendar();
    openLayer('psCal');
    startFirebase();
  });
})();
