/* ==========================================================================
   library.js — login, favourites, collapsible groups, tasks, admin, push
   Plain ES2019, no build step. Talks to Firebase RTDB over the REST API.
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     0. CONFIG
     ====================================================================== */
  var DB = 'https://mdwnhpoints-default-rtdb.europe-west1.firebasedatabase.app';
  var ROOT = 'mdwnhLibrary';        // our own namespace — nothing else is touched
  var PLAYERS = 'players';          // existing points data (read-only for us)

  // Vercel endpoint that pushes the moment a task is created. Leave empty and
  // the GitHub Actions sweep still delivers, just 15-40 minutes later.
  // e.g. 'https://mdwnh-notify-api.vercel.app/api/notify'  (see NOTIFICATIONS.md)
  var NOTIFY_URL = 'https://notify-i0hyzutbt-yosefbore3y-3820s-projects.vercel.app';

  // Replace with the public key printed by `npm run keys` (see NOTIFICATIONS.md).
  var VAPID_PUBLIC_KEY = 'BIJexcgCnFbXBZRlZBasMGgWPacETxu3ZR8Mz1MzXUkI95PdfWdntrVIzpsAPK7yCfOUwELnuMjKbYX_N_JbXcc';

  var LS_USER = 'mdwnh.user';
  var LS_GROUPS = 'mdwnh.groups';
  var LS_SKIP = 'mdwnh.notifSkipped';
  var REFRESH_MS = 45000;

  /* ======================================================================
     1. TINY HELPERS
     ====================================================================== */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ar(n) { return Number(n || 0).toLocaleString('ar-EG'); }
  function avatar(slug) { return 'MdwnhMembers/' + slug + '.png'; }
  var reduceMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  function toast(msg) {
    var old = $('.toast'); if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.classList.add('bye');
      setTimeout(function () { t.remove(); }, 400);
    }, 2600);
  }

  /* --- RTDB REST --- */
  function dbGet(path) {
    return fetch(DB + '/' + path + '.json').then(function (r) {
      if (!r.ok) throw new Error('DB read failed: ' + r.status);
      return r.json();
    });
  }
  function dbPut(path, value) {
    return fetch(DB + '/' + path + '.json', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    }).then(function (r) { if (!r.ok) throw new Error('DB write failed: ' + r.status); return r.json(); });
  }
  function dbPatch(path, value) {
    return fetch(DB + '/' + path + '.json', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    }).then(function (r) { if (!r.ok) throw new Error('DB write failed: ' + r.status); return r.json(); });
  }
  function dbPost(path, value) {
    return fetch(DB + '/' + path + '.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    }).then(function (r) { if (!r.ok) throw new Error('DB write failed: ' + r.status); return r.json(); });
  }
  function dbDelete(path) {
    return fetch(DB + '/' + path + '.json', { method: 'DELETE' });
  }

  /* --- icons --- */
  var ICON = {
    tri: '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 8.6 1.2 3.4A.7.7 0 0 1 1.7 2.2h8.6a.7.7 0 0 1 .5 1.2z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9z"/></svg>',
    starO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M2 4h20v4H2z"/><path d="M10 12h4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h12a5 5 0 0 1 0 10H9"/><path d="M7 4L3 8l4 4"/></svg>'
  };

  /* ======================================================================
     2. NUDGE MESSAGES
     ====================================================================== */
  var NUDGE_CALM = [
    'لا تتكاسل في أداء هذه المهمة!!',
    'المهمة لن تُنجز نفسها… جرّبنا، لم تفعل.',
    'بركة العمل في أوّله، فابدأ الآن.',
    'من جدّ وجد، ومن كسل… رأى هذا الإشعار مرّة أخرى.',
    'اجعل نيّتك خالصة، وأتقن عملك.',
    'التسويف لصٌّ يسرق وقتك بهدوء.',
    'خطوة صغيرة اليوم خير من قفزة مؤجّلة.',
    'الإتقان عبادة، فأتقنها.',
    'لو أنجزتها الآن لارتحت، ولو أجّلتها لطاردتك في المنام.',
    'الوقت كالسيف… وأنت تمسكه من طرفه الحاد.',
    'توكّل، وابدأ، والبقيّة تأتي.',
    'المهمة تنظر إليك الآن. لا تتجاهلها.',
    'أجرك على قدر نصبك، فلا تبخل على نفسك.',
    'أنجزها ثم استرح مطمئنًا.',
    'قليل دائم خير من كثير منقطع.',
    'المسوّفون يجتمعون في آخر يوم… لا تكن منهم.',
    'اعمل بإحسان، فالعين التي لا تنام تراك.',
    'ابدأ بسم الله، وستجد الأمر أهون مما تظن.',
    'الهمّة العالية لا تعرف كلمة «غدًا».',
    'لو كانت المهام تُنجز بالتفكير فيها لأنجزتَ ألفًا.',
    'رتّب وقتك يرتّب الله أمرك.',
    'لا تجعل مهمتك تصل إلى مجموعة الحريقة 🔥',
    'صاحب الهمّة لا ينتظر المزاج.',
    'المهمة سهلة… الصعب أن تبدأ.',
    'استعن بالله ولا تعجز.',
    'أنجزها وأرِح ضميرك من ثقلها.',
    'كل تأجيل يزيدها ثقلًا، وكل بدءٍ يخفّفها.',
    'الفوز للمجتهد لا للمتحمّس.',
    'لا تدع الكسل يكتب نهاية قصتك.',
    'خير العمل أدومه وإن قلّ، فابدأ بشيء.',
    'تذكّر: من ورائك فريق يعتمد عليك.',
    'أنت أقرب مما تظن… افتحها وابدأ فقط.',
    'ساعة عملٍ الآن تُغنيك عن ليلةِ ندم.',
    'اجعل اليوم أفضل من أمسك.',
    'الجادّون يبدؤون قبل أن يشعروا بالرغبة.'
  ];
  var NUDGE_URGENT = [
    'لم يبقَ إلا القليل… أسرِع!',
    'الوقت ينفد والمهمة تنتظر. الآن!',
    'غدًا لن يكون هناك غد. أنجزها اليوم.',
    'تحذير: العدّاد يقترب من الصفر ⏳',
    'هذه ليست مزحة، الموعد على الأبواب.',
    'أسرِع قبل أن تصبح المهمة ذكرى مؤلمة.',
    'بادِر! التأخير الآن لا عذر له.',
    'آخر فرصة… استغلّها.',
    'اترك كل شيء وأنجز هذه الآن.',
    'المهمة في رمقها الأخير، أنقذها!',
    'لا وقت للتسويف، بقيت ساعات.',
    'سارِع… فالفرص لا تنتظر أحدًا.',
    'الآن، أو تندم لاحقًا. اختر.',
    '🔥 المهمة تحترق، أطفئها بالإنجاز.',
    'استعجل، بارك الله في وقتك.',
    'العدّاد لا يرحم، تحرّك!',
    'أنجزها الآن ونم قرير العين.',
    'المهلة تكاد تنتهي… لا تتردد.',
    'خطوة واحدة تفصلك عن الراحة، اخطُها.',
    'الوقت الضائع لا يُشترى. أسرِع.',
    'انتبه! الموعد النهائي يطرق الباب.'
  ];
  function nudgeFor(msLeft) {
    var pool = (msLeft <= 864e5) ? NUDGE_URGENT : NUDGE_CALM;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ======================================================================
     3. STATE
     ====================================================================== */
  var ROSTER = [];        // [{slug,name,email,dbKey,admin}]
  var BY_SLUG = {};
  var ADMIN_SLUG = 'nawaf';
  var me = null;          // current member object
  var isAdmin = false;
  var favs = {};          // {cardId:true}
  var tasks = {};         // {taskId:task}
  var pollTimer = null, tickTimer = null, booted = false;

  /* ======================================================================
     4. COLLAPSIBLE GROUPS (localStorage)
     ====================================================================== */
  function groupState() {
    try { return JSON.parse(localStorage.getItem(LS_GROUPS) || '{}'); } catch (e) { return {}; }
  }
  function saveGroupState(s) {
    try { localStorage.setItem(LS_GROUPS, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }
  function wireGroup(el) {
    var id = el.dataset.group;
    var head = $('.group-head, .sub-head', el);
    if (!head || !id) return;
    var st = groupState();
    if (st[id]) el.classList.add('collapsed');
    head.setAttribute('aria-expanded', String(!el.classList.contains('collapsed')));
    head.addEventListener('click', function () {
      var now = el.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', String(!now));
      var s = groupState(); s[id] = now; saveGroupState(s);
    });
  }
  function wireAllGroups(root) {
    $$('[data-group]', root || document).forEach(function (el) {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      wireGroup(el);
    });
  }

  /* ======================================================================
     5. FAVOURITES
     ====================================================================== */
  function cardMeta(el) {
    var cs = el.style;
    return {
      id: el.dataset.card,
      label: (($('.name', el) || {}).textContent || '').trim(),
      color: cs.getPropertyValue('--c').trim(),
      glyph: cs.getPropertyValue('--g').trim()
    };
  }

  function renderFavs() {
    var strip = $('#favStrip');
    if (!strip) return;
    var cards = $$('[data-card]');
    var chosen = cards.filter(function (c) { return favs[c.dataset.card]; });

    strip.innerHTML = '';
    if (!chosen.length) {
      strip.innerHTML = '<span class="fav-empty">' + ICON.starO +
        ' اضغط النجمة على أي بطاقة لتثبيتها هنا</span>';
    } else {
      chosen.forEach(function (card, i) {
        var m = cardMeta(card);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fav-chip';
        b.style.setProperty('--c', m.color);
        b.style.setProperty('--g', m.glyph);
        b.style.animationDelay = (i * 0.045) + 's';
        b.title = m.label;
        b.setAttribute('aria-label', m.label);
        b.innerHTML = '<i></i>';
        b.addEventListener('click', function () { card.click(); });
        strip.appendChild(b);
      });
    }
    var c = $('#favCount');
    if (c) c.textContent = chosen.length ? ar(chosen.length) : '';
  }

  function toggleFav(id, btn) {
    if (favs[id]) { delete favs[id]; btn.classList.remove('on'); btn.innerHTML = ICON.starO; }
    else { favs[id] = true; btn.classList.add('on'); btn.innerHTML = ICON.star; }
    btn.setAttribute('aria-pressed', String(!!favs[id]));
    renderFavs();
    if (me) {
      dbPut(ROOT + '/users/' + me.slug + '/favourites', favs)
        .catch(function () { toast('تعذّر حفظ المفضلة'); });
    }
  }

  function mountStars() {
    $$('[data-card]').forEach(function (card) {
      if ($('.star', card)) return;
      var id = card.dataset.card;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'star' + (favs[id] ? ' on' : '');
      b.innerHTML = favs[id] ? ICON.star : ICON.starO;
      b.title = 'إضافة إلى المفضلة';
      b.setAttribute('aria-label', 'إضافة ' + (($('.name', card) || {}).textContent || '').trim() + ' إلى المفضلة');
      b.setAttribute('aria-pressed', String(!!favs[id]));
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        toggleFav(id, b);
      });
      card.appendChild(b);
    });
  }

  /* ======================================================================
     6. TELEGRAM-STYLE SPOILER
     ====================================================================== */
  function mountSpoiler(el) {
    var cv = document.createElement('canvas');
    el.appendChild(cv);
    var ctx = cv.getContext('2d');
    var dots = [], raf = null, dpr = Math.min(window.devicePixelRatio || 1, 2);

    function size() {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      cv.width = Math.ceil(r.width * dpr);
      cv.height = Math.ceil(r.height * dpr);
      var n = Math.max(40, Math.round(r.width * r.height / 90));
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * cv.width, y: Math.random() * cv.height,
          vx: (Math.random() - .5) * .32 * dpr, vy: (Math.random() - .5) * .32 * dpr,
          r: (Math.random() * 1.1 + .5) * dpr, a: Math.random()
        });
      }
      return true;
    }

    function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx; d.y += d.vy;
        d.a += .022;
        if (d.x < 0) d.x = cv.width; else if (d.x > cv.width) d.x = 0;
        if (d.y < 0) d.y = cv.height; else if (d.y > cv.height) d.y = 0;
        ctx.globalAlpha = .28 + Math.sin(d.a) * .3;
        ctx.fillStyle = '#4a463f';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    function start() { if (!raf && size() && !reduceMotion) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    // element is inside a collapsible panel, so wait until it actually has a box
    if (!size()) {
      var ro = new ResizeObserver(function () { if (size()) { ro.disconnect(); start(); } });
      ro.observe(el);
    } else { start(); }

    function open() {
      if (el.classList.contains('open')) return;
      el.classList.add('open');
      el.setAttribute('aria-expanded', 'true');
      setTimeout(stop, 520);
    }
    el.addEventListener('click', open);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  /* ======================================================================
     7. TASK MODEL HELPERS
     ====================================================================== */
  function assigneesOf(t) { return Object.keys(t.assignees || {}); }
  function isDoneFor(t, slug) { return !!(t.done && t.done[slug]); }
  function isFullyDone(t) {
    var a = assigneesOf(t);
    return a.length > 0 && a.every(function (s) { return isDoneFor(t, s); });
  }
  function myTasks() {
    return Object.keys(tasks).map(function (id) {
      var t = tasks[id]; t.id = id; return t;
    }).filter(function (t) {
      return isAdmin ? true : !!(t.assignees && t.assignees[me.slug]);
    });
  }
  function sortByDue(list) {
    return list.slice().sort(function (a, b) { return (a.due || 0) - (b.due || 0); });
  }

  function countdown(due) {
    var ms = due - Date.now();
    var late = ms < 0;
    var abs = Math.abs(ms);
    return {
      ms: ms, late: late,
      days: Math.floor(abs / 864e5),
      hours: Math.floor((abs % 864e5) / 36e5)
    };
  }

  /* ======================================================================
     8. TASK CARD RENDERING
     ====================================================================== */
  function whoHtml(t, forceShow) {
    var list = assigneesOf(t);
    if (!forceShow && list.length < 2) return '';
    var shown = list.slice(0, 4);
    var html = shown.map(function (s) {
      var m = BY_SLUG[s];
      return '<img src="' + esc(avatar(s)) + '" alt="' + esc(m ? m.name : s) + '" title="' +
        esc((m ? m.name : s) + (isDoneFor(t, s) ? ' — أتمّها' : '')) + '"' +
        (isDoneFor(t, s) ? ' class="done"' : '') + ' loading="lazy">';
    }).join('');
    if (list.length > shown.length) html += '<span class="more">+' + ar(list.length - shown.length) + '</span>';
    return '<span class="who">' + html + '</span>';
  }

  function cdHtml(t) {
    var c = countdown(t.due);
    if (c.late) {
      return '<span class="cd-wrap"><span class="cd">' +
        '<span class="cd-late">تأخّرت ' + ar(c.days) + ' يوم</span></span></span>';
    }
    return '<span class="cd-wrap">' +
      '<span class="cd-pre">تبقى</span>' +
      '<span class="cd" data-due="' + t.due + '">' +
      '<span class="cd-unit"><span class="cd-lbl">يوم</span><span class="cd-num" data-u="d">' + ar(c.days) + '</span></span>' +
      '<span class="cd-unit"><span class="cd-lbl">ساعة</span><span class="cd-num" data-u="h">' + ar(c.hours) + '</span></span>' +
      '</span>' +
      '</span>';
  }

  /* White text is unreadable on the lighter task colours (gold), so pick a
     foreground from the colour's perceived luminance. */
  function readableOn(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '#fff';
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.68 ? '#2a2118' : '#fff';
  }

  function dueLabelOf(t) {
    return new Date(t.due).toLocaleString('ar-EG', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
  }

  function taskCard(t, i, opts) {
    opts = opts || {};
    var done = isDoneFor(t, isAdmin && opts.viewSlug ? opts.viewSlug : me.slug);
    var full = isFullyDone(t);
    var c = countdown(t.due);
    var color = t.color || '#41b9a6';
    var el = document.createElement('article');
    el.className = 'task' +
      (done || (isAdmin && full) ? ' done' : '') +
      (c.late ? ' overdue' : '') +
      (!c.late && c.ms <= 864e5 ? ' urgent' : '') +
      (opts.fire ? ' fire' : '');
    el.style.setProperty('--c', color);
    el.style.setProperty('--fg', readableOn(color));
    el.style.setProperty('--d', (i * 0.05) + 's');
    el.dataset.id = t.id;

    var action;
    if (opts.archive && isDoneFor(t, me.slug)) {
      // one tap can complete a task, so the archive is where that gets undone
      action = '<button class="task-do undo" type="button" aria-label="تراجع عن إتمام المهمة">' +
        ICON.undo + ' تراجع</button>';
    } else if (isAdmin) {
      var n = assigneesOf(t).filter(function (s2) { return isDoneFor(t, s2); }).length;
      action = '<span class="task-done-badge">' + (full ? ICON.check : '') +
        ' ' + ar(n) + '/' + ar(assigneesOf(t).length) + '</span>';
    } else if (done) {
      action = '<span class="task-done-badge">' + ICON.check + ' تمّت</span>';
    } else {
      action = '<button class="task-do" type="button" aria-label="إتمام المهمة">' +
        ICON.check + ' تم</button>';
    }

    el.innerHTML =
      (isAdmin ? '<button class="task-del" type="button" title="حذف المهمة" aria-label="حذف المهمة">' + ICON.trash + '</button>' : '') +
      '<span class="task-emoji">' + esc(t.emoji || '📌') + '</span>' +
      '<span class="task-title">' + esc(t.title) + '</span>' +
      '<span class="task-due">' + esc(dueLabelOf(t)) + '</span>' +
      whoHtml(t, isAdmin) +
      '<span class="task-nudge">' + esc(done ? 'أحسنت، أتممتها.' : nudgeFor(c.ms)) + '</span>' +
      cdHtml(t) +
      action;

    var btn = $('.task-do', el);
    if (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('undo')) uncompleteTask(t.id);
        else completeTask(t.id, el);
      });
    }
    var del = $('.task-del', el);
    if (del) del.addEventListener('click', function () { deleteTask(t.id, t.title); });
    return el;
  }

  /* ---------- completing ---------- */
  var doneSfx = null;
  function playDone() {
    try {
      if (!doneSfx) { doneSfx = new Audio('Paper_Task_Complete.mp3'); doneSfx.volume = .8; }
      doneSfx.currentTime = 0;
      var p = doneSfx.play();
      if (p && p.catch) p.catch(function () { /* autoplay policy */ });
    } catch (e) { /* no audio */ }
  }

  function completeTask(id, el) {
    var t = tasks[id];
    if (!t || isDoneFor(t, me.slug)) return;
    var btn = $('.task-do', el);
    if (btn) btn.disabled = true;

    playDone();
    el.classList.add('done', 'cheer');
    setTimeout(function () { el.classList.remove('cheer'); }, 600);

    t.done = t.done || {};
    t.done[me.slug] = Date.now();

    dbPut(ROOT + '/tasks/' + id + '/done/' + me.slug, t.done[me.slug])
      .then(function () {
        toast('أحسنت! تمّت المهمة 🎉');
        setTimeout(renderTasks, 900);
      })
      .catch(function () {
        delete t.done[me.slug];
        el.classList.remove('done');
        if (btn) btn.disabled = false;
        toast('تعذّر الحفظ، حاول مجددًا');
      });
  }

  function uncompleteTask(id) {
    var t = tasks[id];
    if (!t || !isDoneFor(t, me.slug)) return;
    var stamp = t.done[me.slug];
    delete t.done[me.slug];
    dbDelete(ROOT + '/tasks/' + id + '/done/' + me.slug).then(function () {
      toast('رجعت المهمة إلى قائمتك');
      renderTasks();
      openArchive();
    }).catch(function () {
      t.done[me.slug] = stamp;
      toast('تعذّر التراجع، حاول مجددًا');
    });
  }

  function deleteTask(id, title) {
    if (!isAdmin) return;
    if (!window.confirm('حذف المهمة «' + title + '» نهائيًا؟\nسيختفي هذا من قوائم كل المكلَّفين.')) return;
    var backup = tasks[id];
    delete tasks[id];
    renderTasks();
    dbDelete(ROOT + '/tasks/' + id).then(function () {
      toast('حُذفت المهمة');
    }).catch(function () {
      tasks[id] = backup;
      renderTasks();
      toast('تعذّر الحذف، حاول مجددًا');
    });
  }

  /* ======================================================================
     9. TASKS PANEL RENDER
     ====================================================================== */
  function emptyState() {
    var wrap = document.createElement('div');
    wrap.className = 'no-tasks';
    wrap.innerHTML =
      '<svg class="face" viewBox="0 0 100 100" fill="none" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="34" fill="#fff3c8" stroke="#f3c02b" stroke-width="4"/>' +
      '<circle cx="39" cy="43" r="4.4" fill="#8a5a12"/><circle cx="61" cy="43" r="4.4" fill="#8a5a12"/>' +
      '<path d="M35 58c4.6 7.4 10 11 15 11s10.4-3.6 15-11" stroke="#8a5a12" stroke-width="4.6" stroke-linecap="round"/>' +
      '</svg>' +
      '<h3>أحسنت!</h3>' +
      '<p>لقد أتممت كل مهامك</p>' +
      '<span class="spoiler" tabindex="0" role="button" aria-expanded="false" ' +
      'aria-label="رسالة مخفية، اضغط للكشف">' +
      '<span class="sp-text">أو ربما لم يتم تكليفك بأي شيء أصلًا :)</span>' +
      '</span>';

    // decorative sparkles
    var spots = [
      { t: '14%', l: '12%', s: 22 }, { t: '24%', l: '84%', s: 16 },
      { t: '70%', l: '8%', s: 15 }, { t: '78%', l: '88%', s: 20 },
      { t: '8%', l: '62%', s: 13 }
    ];
    spots.forEach(function (sp, i) {
      var s = document.createElement('span');
      s.className = 'spark';
      s.style.top = sp.t; s.style.left = sp.l;
      s.style.width = s.style.height = sp.s + 'px';
      s.style.animationDelay = (i * .5) + 's';
      s.style.background = ['var(--gold)', 'var(--teal)', 'var(--red)'][i % 3];
      s.style.webkitMaskImage = "url('assets/icons/sparkles.png')";
      s.style.maskImage = "url('assets/icons/sparkles.png')";
      s.style.webkitMaskSize = s.style.maskSize = 'contain';
      s.style.webkitMaskRepeat = s.style.maskRepeat = 'no-repeat';
      wrap.appendChild(s);
    });

    setTimeout(function () { mountSpoiler($('.spoiler', wrap)); }, 30);
    return wrap;
  }

  function renderTasks() {
    var host = $('#taskList');
    if (!host || !me) return;
    host.innerHTML = '';

    var all = sortByDue(myTasks());
    var open = all.filter(function (t) {
      return isAdmin ? !isFullyDone(t) : !isDoneFor(t, me.slug);
    });

    // archive button count
    var arch = all.length - open.length;
    var ab = $('#archCount');
    if (ab) ab.textContent = arch ? ' (' + ar(arch) + ')' : '';

    if (!open.length) { host.appendChild(emptyState()); return; }

    if (!isAdmin) {
      var list = document.createElement('div');
      list.className = 'task-list';
      open.forEach(function (t, i) { list.appendChild(taskCard(t, i)); });
      host.appendChild(list);
      return;
    }

    /* --- admin: حريقة (<=2 days) vs the rest --- */
    var TWO_DAYS = 2 * 864e5;
    var fire = open.filter(function (t) { return (t.due - Date.now()) <= TWO_DAYS; });
    var rest = open.filter(function (t) { return (t.due - Date.now()) > TWO_DAYS; });

    function block(id, cls, title, why, items, fireFlag) {
      if (!items.length) return null;
      var sec = document.createElement('section');
      sec.className = 'subgroup ' + cls;
      sec.dataset.group = id;
      sec.innerHTML =
        '<button class="sub-head" type="button" aria-expanded="true">' +
        '<span class="tri">' + ICON.tri + '</span>' +
        '<h3>' + title + '</h3>' +
        '<span class="why">' + esc(why) + '</span>' +
        '<span class="count">' + ar(items.length) + '</span>' +
        '<span class="rule"></span>' +
        '</button>' +
        '<div class="group-body"><div class="group-inner"><div class="task-list"></div></div></div>';
      var lst = $('.task-list', sec);
      items.forEach(function (t, i) { lst.appendChild(taskCard(t, i, { fire: fireFlag })); });
      return sec;
    }

    var a = block('adm-fire', 'fire', 'الحريقة 🔥', 'مهام باقٍ عليها يومان أو أقل — تحتاج متابعة فورية', fire, true);
    var b = block('adm-rest', '', 'بقية المهام', 'مهام لا يزال أمامها متّسع من الوقت', rest, false);
    if (a) host.appendChild(a);
    if (b) host.appendChild(b);
    wireAllGroups(host);
  }

  /* live countdown tick (numbers only — no re-render, so nothing jumps) */
  function tickCountdowns() {
    $$('.cd[data-due]').forEach(function (cd) {
      var c = countdown(Number(cd.dataset.due));
      if (c.late) { renderTasks(); return; }
      var d = $('[data-u=d]', cd), h = $('[data-u=h]', cd);
      if (d) d.textContent = ar(c.days);
      if (h) h.textContent = ar(c.hours);
    });
  }

  /* ======================================================================
     10. ARCHIVE
     ====================================================================== */
  function openArchive() {
    var m = $('#archModal');
    var body = $('#archBody');
    var all = sortByDue(myTasks()).filter(function (t) {
      return isAdmin ? isFullyDone(t) : isDoneFor(t, me.slug);
    }).reverse();

    body.innerHTML = '';
    if (!all.length) {
      body.innerHTML = '<p class="empty-note">لا توجد مهام مؤرشفة بعد.</p>';
    } else {
      var list = document.createElement('div');
      list.className = 'task-list';
      all.forEach(function (t, i) { list.appendChild(taskCard(t, i, { archive: true })); });
      body.appendChild(list);
    }
    m.hidden = false;
  }

  /* ======================================================================
     11. ADMIN — ADD TASK
     ====================================================================== */
  var COLORS = ['#e54b2a', '#f3c02b', '#41b9a6', '#0b6eb9', '#8a5a12', '#9b5de5', '#ef476f', '#2a9d8f'];
  var EMOJIS = ['📌', '🎬', '✍️', '🎨', '📸', '📊', '📣', '🎧', '🗂️', '⚡', '🔥', '🌙', '⭐', '📝', '🎯', '💡'];

  var draft = { color: COLORS[0], emoji: EMOJIS[0], due: null, members: {} };
  var calCursor = new Date();

  function renderSwatches() {
    var w = $('#swatches'); w.innerHTML = '';
    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw' + (draft.color === c ? ' on' : '');
      b.style.setProperty('--c', c);
      b.setAttribute('aria-label', 'لون ' + c);
      b.addEventListener('click', function () { draft.color = c; renderSwatches(); });
      w.appendChild(b);
    });
  }
  function renderEmojis() {
    var w = $('#emojis'); w.innerHTML = '';
    EMOJIS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'em' + (draft.emoji === e ? ' on' : '');
      b.textContent = e;
      b.setAttribute('aria-label', 'رمز ' + e);
      b.addEventListener('click', function () {
        draft.emoji = e;
        var ci = $('#emojiCustom');
        if (ci) ci.value = '';          // a preset wins over a stale custom value
        renderEmojis();
      });
      w.appendChild(b);
    });
  }

  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var AR_DOW = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  function renderCal() {
    var host = $('#calGrid');
    var label = $('#calLabel');
    var y = calCursor.getFullYear(), mo = calCursor.getMonth();
    label.textContent = AR_MONTHS[mo] + ' ' + ar(y);

    var first = new Date(y, mo, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var today = new Date(); today.setHours(0, 0, 0, 0);

    host.innerHTML = '';
    AR_DOW.forEach(function (d) {
      var s = document.createElement('span');
      s.className = 'cal-dow'; s.textContent = d;
      host.appendChild(s);
    });
    for (var i = 0; i < startDow; i++) {
      var pad = document.createElement('span'); pad.className = 'cal-day other';
      host.appendChild(pad);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      (function (day) {
        var date = new Date(y, mo, day);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cal-day';
        b.textContent = ar(day);
        if (date.getTime() === today.getTime()) b.classList.add('today');
        if (date < today) b.disabled = true;
        if (draft.due && new Date(draft.due).toDateString() === date.toDateString()) b.classList.add('on');
        b.addEventListener('click', function () {
          var time = ($('#calTime').value || '23:59').split(':');
          var picked = new Date(y, mo, day, Number(time[0]) || 0, Number(time[1]) || 0, 0, 0);
          draft.due = picked.getTime();
          renderCal(); validateDraft();
        });
        host.appendChild(b);
      })(d);
    }
  }

  function renderPicked() {
    var w = $('#picked'); w.innerHTML = '';
    var keys = Object.keys(draft.members);
    if (!keys.length) { w.innerHTML = '<span class="none">لم يتم اختيار أحد بعد</span>'; return; }
    keys.forEach(function (s) {
      var m = BY_SLUG[s];
      var p = document.createElement('span');
      p.className = 'pill';
      p.innerHTML = '<img src="' + esc(avatar(s)) + '" alt=""><span>' + esc(m.name) + '</span>' +
        '<button type="button" aria-label="إزالة ' + esc(m.name) + '">' + ICON.x + '</button>';
      $('button', p).addEventListener('click', function () {
        delete draft.members[s]; renderPicked(); renderPeople(); validateDraft();
      });
      w.appendChild(p);
    });
  }

  function renderPeople() {
    var w = $('#people'); if (!w) return;
    w.innerHTML = '';
    ROSTER.filter(function (m) { return !m.admin; }).forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'person' + (draft.members[m.slug] ? ' on' : '');
      b.innerHTML = '<img src="' + esc(avatar(m.slug)) + '" alt="" loading="lazy">' +
        '<span class="pname">' + esc(m.name) + '</span>' +
        '<span class="tick">' + ICON.check + '</span>';
      b.setAttribute('aria-pressed', String(!!draft.members[m.slug]));
      b.addEventListener('click', function () {
        if (draft.members[m.slug]) delete draft.members[m.slug];
        else draft.members[m.slug] = true;
        renderPeople(); renderPicked(); validateDraft();
      });
      w.appendChild(b);
    });
  }

  function validateDraft() {
    var ok = $('#taskName').value.trim() && draft.due && Object.keys(draft.members).length;
    $('#saveTask').disabled = !ok;
    var due = $('#dueLabel');
    if (due) {
      due.textContent = draft.due
        ? new Date(draft.due).toLocaleString('ar-EG', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })
        : 'لم يُحدَّد بعد';
    }
  }

  function resetDraft() {
    draft = { color: COLORS[0], emoji: EMOJIS[0], due: null, members: {} };
    calCursor = new Date();
    $('#taskName').value = '';
    $('#calTime').value = '23:59';
    var ci = $('#emojiCustom'); if (ci) ci.value = '';
    renderSwatches(); renderEmojis(); renderCal(); renderPicked(); renderPeople(); validateDraft();
  }

  function saveTask() {
    var btn = $('#saveTask');
    btn.disabled = true; btn.textContent = 'جارٍ الإضافة…';
    var t = {
      title: $('#taskName').value.trim(),
      emoji: draft.emoji,
      color: draft.color,
      due: draft.due,
      assignees: draft.members,
      done: {},
      createdAt: Date.now(),
      createdBy: me.slug,
      notified: { created: false, day1: false }
    };
    dbPost(ROOT + '/tasks', t).then(function (res) {
      tasks[res.name] = t;
      pingNotify(res.name);
      $('#addModal').hidden = true;
      toast('تمت إضافة المهمة وسيصل الإشعار للمكلَّفين');
      resetDraft();
      renderTasks();
    }).catch(function () {
      toast('تعذّر حفظ المهمة');
    }).finally(function () {
      btn.textContent = 'إضافة المهمة';
      validateDraft();
    });
  }

  /* ======================================================================
     12. PUSH NOTIFICATIONS
     ====================================================================== */
  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function urlB64ToUint8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function subKey(endpoint) {
    var h = 5381;
    for (var i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0;
    return 'e' + h.toString(36);
  }

  function subscribePush(slug) {
    if (!pushSupported() || !VAPID_PUBLIC_KEY) return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub) return sub;
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY)
        });
      });
    }).then(function (sub) {
      var j = sub.toJSON();
      var key = subKey(j.endpoint);
      return dbPut(ROOT + '/users/' + slug + '/push/' + key, {
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        ua: navigator.userAgent.slice(0, 120),
        ts: Date.now()
      }).then(function () {
        // This browser may have been signed in as someone else before. The key
        // is derived from the endpoint, so the previous owner would keep getting
        // this device's notifications until we detach it.
        return dbGet(ROOT + '/users').then(function (all) {
          var stale = Object.keys(all || {}).filter(function (other) {
            return other !== slug && all[other] && all[other].push && all[other].push[key];
          });
          return Promise.all(stale.map(function (other) {
            return dbDelete(ROOT + '/users/' + other + '/push/' + key);
          }));
        }).catch(function () { /* cleanup is best effort */ });
      }).then(function () { return true; });
    }).catch(function (e) {
      console.warn('[push] subscribe failed', e);
      return false;
    });
  }

  /* Best-effort nudge so assignees hear about a task in ~1s instead of waiting
     for the cron. Deliberately not awaited and never surfaced as an error: the
     GitHub Actions sweep is the safety net, so a failure here only costs
     latency, never the notification itself. */
  function pingNotify(taskId) {
    if (!NOTIFY_URL) return;
    // Pasting just the Vercel project URL is the obvious mistake, and POSTing
    // to the root silently fails, so fix up the path instead of dying quietly.
    var url = NOTIFY_URL.replace(/\/+$/, '');
    if (!/\/api\/notify$/.test(url)) url += '/api/notify';

    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: taskId }),
        keepalive: true          // survives the modal closing / a quick tab close
      }).then(function (r) {
        if (r.ok) return r.json().then(function (j) { console.log('[notify]', j); });
        // Loud on purpose: swallowing this made a broken endpoint look
        // identical to a working one until someone noticed no phone buzzed.
        console.warn('[notify] endpoint returned ' + r.status + (r.status === 401
          ? ' — Vercel Deployment Protection is on. Turn it off in project settings.'
          : ''));
      }).catch(function (e) {
        console.warn('[notify] could not reach endpoint:', e && e.message);
      });
    } catch (e) {
      console.warn('[notify] ping failed:', e && e.message);
    }
  }

  /* ======================================================================
     13. LOGIN GATE
     ====================================================================== */
  function showStep(n) {
    $$('.gate-step').forEach(function (s) { s.hidden = (s.dataset.step !== String(n)); });
  }

  function finishLogin(member) {
    me = member;
    isAdmin = !!member.admin || member.slug === ADMIN_SLUG;
    try { localStorage.setItem(LS_USER, member.slug); } catch (e) { }
    var gate = $('#gate');
    gate.classList.add('gate-out');
    setTimeout(function () {
      gate.hidden = true;
      gate.classList.remove('gate-out');
      document.body.classList.remove('locked');
    }, 480);
    bootApp();
  }

  function notifsOn() {
    return pushSupported() && Notification.permission === 'granted';
  }

  function refreshNag() {
    var nag = $('#notifNag');
    if (nag) nag.hidden = notifsOn();
  }

  /* Re-open the gate on the "blocked" step so a member who skipped can come back. */
  function reopenNotifGate() {
    if (!me) return;
    var gate = $('#gate');
    gate.hidden = false;
    goToNotifStep(me);
    if (notifsOn()) return;      // goToNotifStep already let them through
    showStep(pushSupported() ? 3 : 4);
  }

  function handleEmail() {
    var raw = $('#gateEmail').value.trim().toLowerCase();
    var msg = $('#gateMsg');
    if (!raw) { msg.className = 'gate-msg err'; msg.textContent = 'اكتب بريدك أولًا'; return; }
    var found = ROSTER.filter(function (m) { return m.email.toLowerCase() === raw; })[0];
    if (!found) {
      msg.className = 'gate-msg err';
      msg.textContent = 'هذا البريد غير مسجَّل ضمن الفريق. تأكّد من كتابته صحيحًا.';
      return;
    }
    msg.className = 'gate-msg ok';
    msg.textContent = '';
    goToNotifStep(found);
  }

  function goToNotifStep(member) {
    $('#helloAvatar').src = avatar(member.slug);
    $('#helloAvatar').alt = member.name;
    $('#helloName').textContent = member.name;

    // Wire every button up front — the denied branch returns early, and if the
    // retry handler were attached after it that button would be dead exactly
    // when it is the only way forward.
    $('#unsupportedGo').onclick = function () {
      try { localStorage.setItem(LS_SKIP, '1'); } catch (e) { }
      finishLogin(member);
    };
    $('#allowBtn').onclick = function () {
      $('#allowBtn').disabled = true;
      Notification.requestPermission().then(function (p) {
        $('#allowBtn').disabled = false;
        if (p === 'granted') { subscribePush(member.slug); finishLogin(member); }
        else { showStep(3); }
      });
    };
    $('#deniedRetry').onclick = function () {
      if (Notification.permission === 'granted') {
        try { localStorage.removeItem(LS_SKIP); } catch (e) { }
        subscribePush(member.slug);
        finishLogin(member);
      } else { toast('الإشعارات ما زالت محظورة — فعّلها من إعدادات المتصفح'); }
    };
    $('#deniedSkip').onclick = function () {
      try { localStorage.setItem(LS_SKIP, '1'); } catch (e) { }
      finishLogin(member);
    };

    if (!pushSupported()) {
      // iOS Safari outside the installed PWA has no Notification API at all —
      // block the normal path but leave a door so nobody is permanently stuck.
      showStep(4);
      return;
    }
    if (Notification.permission === 'granted') {
      subscribePush(member.slug);
      finishLogin(member);
      return;
    }
    if (Notification.permission === 'denied') { showStep(3); return; }
    showStep(2);
  }

  /* ======================================================================
     14. BOOT
     ====================================================================== */
  function bootApp() {
    refreshNag();
    if (booted) return;          // reopening the gate must not double-init
    booted = true;

    // header strip
    $('#meAvatar').src = avatar(me.slug);
    $('#meAvatar').alt = me.name;
    $('#meName').textContent = me.name;
    if (isAdmin) {
      $('#addTaskBtn').hidden = false;
      $('#tasksTag').textContent = 'لوحة القائد · كل مهام الفريق';
    }

    // points — the leader has no score to show
    var ptsEl = $('.me-pts');
    if (isAdmin) {
      if (ptsEl) ptsEl.hidden = true;
    } else {
      dbGet(PLAYERS + '/' + encodeURIComponent(me.dbKey) + '/totalPoints')
        .then(function (p) { $('#mePts').textContent = ar(p || 0); })
        .catch(function () { $('#mePts').textContent = '—'; });
    }

    // favourites
    dbGet(ROOT + '/users/' + me.slug + '/favourites')
      .then(function (f) { favs = f || {}; })
      .catch(function () { favs = {}; })
      .then(function () { mountStars(); renderFavs(); });

    loadTasks(true);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { loadTasks(false); }, REFRESH_MS);
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tickCountdowns, 30000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { loadTasks(false); refreshNag(); }
    });

    if (isAdmin) { renderSwatches(); renderEmojis(); renderCal(); renderPicked(); renderPeople(); validateDraft(); }
  }

  function loadTasks(showLoader) {
    var ld = $('#taskLoader'), lbl = $('#taskLoaderLbl');
    if (showLoader) { if (ld) ld.hidden = false; if (lbl) lbl.hidden = false; }
    return dbGet(ROOT + '/tasks').then(function (t) {
      tasks = t || {};
      if (ld) ld.hidden = true;
      if (lbl) lbl.hidden = true;
      renderTasks();
    }).catch(function () {
      if (ld) ld.hidden = true;
      if (lbl) lbl.hidden = true;
      var host = $('#taskList');
      if (host && !host.children.length) {
        host.innerHTML = '<p class="empty-note">تعذّر تحميل المهام — تحقّق من اتصالك ثم أعد التحميل.</p>';
      }
    });
  }

  /* ======================================================================
     15. WIRE UP
     ====================================================================== */
  function wireStatic() {
    wireAllGroups();

    $('#gateGo').addEventListener('click', handleEmail);
    $('#gateEmail').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleEmail();
    });

    $('#logoutBtn').addEventListener('click', function () {
      try { localStorage.removeItem(LS_USER); localStorage.removeItem(LS_SKIP); } catch (e) { }
      location.reload();
    });
    $('#notifNagBtn').addEventListener('click', reopenNotifGate);
    $('#archBtn').addEventListener('click', openArchive);

    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { $('#' + b.dataset.close).hidden = true; });
    });
    $$('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.hidden = true; });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') $$('.modal').forEach(function (m) { m.hidden = true; });
    });

    var add = $('#addTaskBtn');
    if (add) add.addEventListener('click', function () { resetDraft(); $('#addModal').hidden = false; });
    var save = $('#saveTask');
    if (save) save.addEventListener('click', saveTask);
    var nameIn = $('#taskName');
    if (nameIn) nameIn.addEventListener('input', validateDraft);
    var emIn = $('#emojiCustom');
    if (emIn) emIn.addEventListener('input', function () {
      var v = emIn.value.trim();
      if (v) { draft.emoji = v; renderEmojis(); }       // renderEmojis clears preset highlight
      else { draft.emoji = EMOJIS[0]; renderEmojis(); }
    });
    var timeIn = $('#calTime');
    if (timeIn) timeIn.addEventListener('change', function () {
      if (!draft.due) return;
      var p = timeIn.value.split(':');
      var d = new Date(draft.due);
      d.setHours(Number(p[0]) || 0, Number(p[1]) || 0, 0, 0);
      draft.due = d.getTime();
      validateDraft();
    });
    var prev = $('#calPrev'), next = $('#calNext');
    if (prev) prev.addEventListener('click', function () { calCursor.setMonth(calCursor.getMonth() - 1); renderCal(); });
    if (next) next.addEventListener('click', function () { calCursor.setMonth(calCursor.getMonth() + 1); renderCal(); });
  }

  function start() {
    wireStatic();
    fetch('members.json').then(function (r) { return r.json(); }).then(function (data) {
      ROSTER = data.members;
      ADMIN_SLUG = data.adminSlug || 'nawaf';
      ROSTER.forEach(function (m) { BY_SLUG[m.slug] = m; });

      var saved = null, skipped = false;
      try {
        saved = localStorage.getItem(LS_USER);
        skipped = localStorage.getItem(LS_SKIP) === '1';
      } catch (e) { }
      var member = saved ? BY_SLUG[saved] : null;

      if (member && notifsOn()) {
        subscribePush(member.slug);
        finishLogin(member);
      } else if (member && (skipped || !pushSupported())) {
        // they chose to continue without notifications — the banner nags instead
        finishLogin(member);
      } else if (member) {
        // was logged in but notifications got turned off — make them fix it
        goToNotifStep(member);
      } else {
        showStep(1);
        setTimeout(function () { var i = $('#gateEmail'); if (i) i.focus(); }, 400);
      }
    }).catch(function () {
      $('#gateMsg').className = 'gate-msg err';
      $('#gateMsg').textContent = 'تعذّر تحميل بيانات الفريق. أعد تحميل الصفحة.';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
