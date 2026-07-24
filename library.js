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
  var NOTIFY_URL = 'https://notify-api-pi.vercel.app/api/notify';

  // Replace with the public key printed by `npm run keys` (see NOTIFICATIONS.md).
  var VAPID_PUBLIC_KEY = 'BLh5zx0FiowxAYB88WAB6KlzAP9DU0ZQXG9S1Wj1THqhco0z6_4wDwvlzwRddHzRYt2TF5p2txyrpysE_idGjkE';

  var LS_USER = 'mdwnh.user';
  var LS_GROUPS = 'mdwnh.groups';
  var LS_SKIP = 'mdwnh.notifSkipped';
  var LS_VAPID = 'mdwnh.vapidKey';
  var LS_VIEW = 'mdwnh.taskView';   // 'cards' | 'pills'
  var LS_SPLIT = 'mdwnh.split';     // tasks-pane width, %
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
  // Shared team roster — single source of truth (github.com/mdwnstudio/MdwnhMembers).
  // Avatars load from there; the bundled MdwnhMembers/ folder is an offline fallback.
  var ROSTER_BASE = 'https://raw.githubusercontent.com/mdwnstudio/MdwnhMembers/main';
  function avatar(slug) { return ROSTER_BASE + '/avatars/' + slug + '.png'; }
  // One delegated handler: any roster avatar that fails to load falls back to the local copy.
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (img && img.tagName === 'IMG' && String(img.src).indexOf(ROSTER_BASE) === 0) {
      img.onerror = null;
      img.src = 'MdwnhMembers/' + img.src.slice(img.src.lastIndexOf('/') + 1);
    }
  }, true);
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
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h12a5 5 0 0 1 0 10H9"/><path d="M7 4L3 8l4 4"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };

  /* --- solid, rounded, playful glyphs for links + favourites + quicklinks --- */
  var GLYPH = {
    leaderboard: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="13" width="5" height="8" rx="2"/><rect x="9.5" y="8" width="5" height="13" rx="2"/><rect x="16" y="4" width="5" height="17" rx="2"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="4" width="18" height="4.6" rx="1.7"/><path d="M4.5 9.6h15V19a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M6 3h7l6 6v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm7 1.8V8a1.5 1.5 0 0 0 1.5 1.5h3.2z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M7 2.2a1.2 1.2 0 0 1 1.2 1.2V4h7.6v-.6a1.2 1.2 0 1 1 2.4 0V4H19a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h.8v-.6A1.2 1.2 0 0 1 7 2.2ZM4.4 9.6V18a.6.6 0 0 0 .6.6h14a.6.6 0 0 0 .6-.6V9.6Z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 3a1.5 1.5 0 0 1 1.5 1.5V18.5h15A1.5 1.5 0 0 1 20 21.5H4.5A1.5 1.5 0 0 1 3 20V4.5A1.5 1.5 0 0 1 4 3Z"/><rect x="7" y="11" width="3" height="5.6" rx="1.2"/><rect x="12" y="7.4" width="3" height="9.2" rx="1.2"/><rect x="17" y="9.4" width="3" height="7.2" rx="1.2"/></svg>',
    tools: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.9 2.4a6 6 0 0 0-7 7.7L2.7 15.3a2.3 2.3 0 0 0 3.2 3.2l5.2-5.2a6 6 0 0 0 7.7-7l-2.9 2.9a2.1 2.1 0 0 1-3-3z"/></svg>',
    office: '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M5 3a2 2 0 0 0-2 2v16h8v-4h2v4h8V9a2 2 0 0 0-2-2h-6V5a2 2 0 0 0-2-2Zm2 4h2v2H7Zm4 0h2v2h-2ZM7 11h2v2H7Zm4 0h2v2h-2Zm6 0h2v2h-2Zm-6 4h2v2h-2Zm6 0h2v2h-2Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.2 13.4a3.6 3.6 0 0 0 5.1.2l3-3a3.6 3.6 0 1 0-5.1-5.1l-1.5 1.5a1.3 1.3 0 0 0 1.8 1.8l1.5-1.5a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.5 0 1.3 1.3 0 0 0-1.9 1.9z"/><path d="M14.8 10.6a3.6 3.6 0 0 0-5.1-.2l-3 3a3.6 3.6 0 1 0 5.1 5.1l1.5-1.5a1.3 1.3 0 0 0-1.8-1.8l-1.5 1.5a1 1 0 1 1-1.4-1.4l3-3a1 1 0 0 1 1.5 0 1.3 1.3 0 0 0 1.9-1.9z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 13h6l-1 9 9-12h-6z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21S3.5 14.5 3.5 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.5 2.8C20.5 14.5 12 21 12 21z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7L8.5 3.6A1 1 0 0 0 7 4.5z"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6a2.5 2.5 0 0 1 2.5-2.5H9L11.5 6h7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>'
  };
  function glyph(name){ return GLYPH[name] || GLYPH.link; }
  /* icons offered in the quicklink icon picker */
  var QUICK_ICONS = ['link','star','bolt','heart','play','folder','pin','chat','leaderboard'];

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
  var quicklinks = {};    // {id:{name,url,icon,color}}
  var tasks = {};         // {taskId:task}
  var pollTimer = null, tickTimer = null, booted = false;
  var taskView = 'pills'; // task appearance: 'cards' | 'pills' (default: pills)

  /* task tags: key -> {label, color} — colours match the spec */
  var TAGS = {
    content: { label: 'محتوى', color: '#f3c02b' },
    prod:    { label: 'إنتاج', color: '#e54b2a' },
    comm:    { label: 'تواصل', color: '#41b9a6' },
    coord:   { label: 'تنسيق', color: '#2f8fe0' }
  };
  var TAG_ORDER = ['content', 'prod', 'comm', 'coord'];
  var POINT_VALUES = [5, 10, 20, 30, 60];
  function sticker(v) { return 'assets/points/' + v + '.webp'; }
  /* NFC-normalise so أُبي / أبو بندر match the Points site's claim key */
  function nfc(s) { try { return String(s).normalize('NFC'); } catch (e) { return String(s); } }

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
  /* favouritable built-in cards = the link rows (maqr card is its own tab) */
  function linkCards() { return $$('.lrow[data-card]'); }
  function cardInfo(el) {
    return {
      id: el.dataset.card,
      label: (($('.name', el) || {}).textContent || '').trim(),
      color: el.style.getPropertyValue('--c').trim() || '#41b9a6',
      icon: el.dataset.icon || 'link'
    };
  }

  /* drop a solid glyph into every link row's chip */
  function paintLinkIcons() {
    linkCards().forEach(function (el) {
      var chip = $('.chip', el);
      if (chip && !chip.dataset.painted) { chip.innerHTML = glyph(el.dataset.icon); chip.dataset.painted = '1'; }
    });
  }

  function favChipBuiltin(card, i) {
    var m = cardInfo(card);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'fav-chip';
    b.style.setProperty('--c', m.color);
    b.style.animationDelay = (i * 0.045) + 's';
    b.title = m.label; b.setAttribute('aria-label', m.label);
    b.innerHTML = glyph(m.icon);
    b.addEventListener('click', function () { closeFan(); card.click(); });
    return b;
  }

  function favChipQuick(id, q, i) {
    var b = document.createElement('button');
    b.type = 'button';
    var emoji = q.icon && q.icon.charAt(0) !== '@';   // '@name' encodes a glyph icon
    b.className = 'fav-chip quick' + (emoji ? ' is-emoji' : '');
    b.style.setProperty('--c', q.color || '#41b9a6');
    b.style.animationDelay = (i * 0.045) + 's';
    b.title = q.name || q.url; b.setAttribute('aria-label', q.name || q.url);
    b.innerHTML = emoji ? esc(q.icon) : glyph(q.icon.slice(1));
    b.addEventListener('click', function () {
      closeFan();
      if (q.url) window.open(q.url, '_blank', 'noopener');
    });
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'ql-x'; x.innerHTML = ICON.x;
    x.setAttribute('aria-label', 'حذف الاختصار');
    x.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      deleteQuicklink(id, q.name || '');
    });
    b.appendChild(x);
    return b;
  }

  function renderFavs() {
    var strip = $('#favStrip');
    if (!strip) return;
    strip.innerHTML = '';
    var i = 0;
    linkCards().filter(function (c) { return favs[c.dataset.card]; })
      .forEach(function (card) { strip.appendChild(favChipBuiltin(card, i++)); });
    Object.keys(quicklinks).forEach(function (id) {
      strip.appendChild(favChipQuick(id, quicklinks[id], i++));
    });

    var add = document.createElement('button');
    add.type = 'button'; add.className = 'fav-add';
    add.title = 'إضافة اختصار'; add.setAttribute('aria-label', 'إضافة اختصار');
    add.innerHTML = ICON.plus;
    add.addEventListener('click', openQuickModal);
    strip.appendChild(add);

    var c = $('#favCount');
    if (c) c.textContent = i ? ar(i) : '';
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
    linkCards().forEach(function (card) {
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

  /* ---------- personal quicklinks ---------- */
  var qlDraft = { icon: '@link', color: '#41b9a6' };
  /* the picker glyphs stay neutral (no colour) — only the preview chip shows
     the colour a user picked, so the two things being chosen read separately */
  function renderQlPreview() {
    var b = $('#qlPreview'); if (!b) return;
    var emoji = qlDraft.icon && qlDraft.icon.charAt(0) !== '@';
    b.className = 'fav-chip' + (emoji ? ' is-emoji quick' : '');
    b.style.setProperty('--c', qlDraft.color);
    b.innerHTML = emoji ? esc(qlDraft.icon) : glyph(qlDraft.icon.slice(1));
  }
  function renderQlIcons() {
    var w = $('#qlIcons'); if (!w) return; w.innerHTML = '';
    QUICK_ICONS.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ql-opt' + (qlDraft.icon === '@' + name ? ' on' : '');
      b.innerHTML = glyph(name);
      b.setAttribute('aria-label', name);
      b.addEventListener('click', function () {
        qlDraft.icon = '@' + name;
        var em = $('#qlEmoji'); if (em) em.value = '';
        renderQlIcons(); renderQlPreview(); validateQuick();
      });
      w.appendChild(b);
    });
  }
  function renderQlSwatches() {
    var w = $('#qlSwatches'); if (!w) return; w.innerHTML = '';
    ['#41b9a6', '#e54b2a', '#f3c02b', '#0b6eb9', '#9b5de5', '#3bb9ab'].forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw' + (qlDraft.color === c ? ' on' : '');
      b.style.setProperty('--c', c);
      b.setAttribute('aria-label', 'لون ' + c);
      b.addEventListener('click', function () { qlDraft.color = c; renderQlSwatches(); renderQlPreview(); });
      w.appendChild(b);
    });
  }
  function validateQuick() {
    var name = ($('#qlName').value || '').trim();
    var url = ($('#qlUrl').value || '').trim();
    $('#saveQuick').disabled = !(name && url);
  }
  function openQuickModal() {
    qlDraft = { icon: '@link', color: '#41b9a6' };
    $('#qlName').value = ''; $('#qlUrl').value = '';
    var em = $('#qlEmoji'); if (em) em.value = '';
    renderQlIcons(); renderQlSwatches(); renderQlPreview(); validateQuick();
    $('#quickModal').hidden = false;
  }
  function saveQuicklink() {
    var name = ($('#qlName').value || '').trim();
    var url = ($('#qlUrl').value || '').trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    var q = { name: name, url: url, icon: qlDraft.icon, color: qlDraft.color };
    var btn = $('#saveQuick'); btn.disabled = true;
    dbPost(ROOT + '/users/' + me.slug + '/quicklinks', q).then(function (res) {
      quicklinks[res.name] = q;
      $('#quickModal').hidden = true;
      renderFavs();
      toast('أُضيف الاختصار');
    }).catch(function () { toast('تعذّر حفظ الاختصار'); btn.disabled = false; });
  }
  function deleteQuicklink(id, name) {
    if (!window.confirm('حذف الاختصار «' + (name || '') + '»؟')) return;
    var backup = quicklinks[id];
    delete quicklinks[id];
    renderFavs();
    dbDelete(ROOT + '/users/' + me.slug + '/quicklinks/' + id).then(function () {
      toast('حُذف الاختصار');
    }).catch(function () { quicklinks[id] = backup; renderFavs(); toast('تعذّر الحذف'); });
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
  /* points are earned once per (task,member) — a task pulled back from the
     archive and re-completed must NOT mint a second claim */
  function hasEarned(t, slug) { return !!(t.earned && t.earned[slug]); }
  function supervisorsOf(t) { return Object.keys(t.supervisors || {}); }
  function isSupervisorOf(t) { return !!(me && t.supervisors && t.supervisors[me.slug]); }
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
  /* tasks I watch over as مشرف (not necessarily assigned to me). Admins already
     see everything, so this is only meaningful for regular members. */
  function supervisedTasks() {
    if (isAdmin || !me) return [];
    return Object.keys(tasks).map(function (id) {
      var t = tasks[id]; t.id = id; return t;
    }).filter(function (t) {
      return !!(t.supervisors && t.supervisors[me.slug]);
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

  function tagsHtml(t) {
    var keys = TAG_ORDER.filter(function (k) { return t.tags && t.tags[k]; });
    if (!keys.length) return '';
    return '<span class="task-tags">' + keys.map(function (k) {
      return '<span class="task-tag" style="--tc:' + TAGS[k].color + '">' + esc(TAGS[k].label) + '</span>';
    }).join('') + '</span>';
  }

  function taskCard(t, i, opts) {
    opts = opts || {};
    // a supervisor sees "their" task with the same admin-style card (progress
    // badge + edit) even though they aren't the leader
    var adminView = isAdmin || opts.supervise;
    var done = isDoneFor(t, adminView && opts.viewSlug ? opts.viewSlug : me.slug);
    var full = isFullyDone(t);
    var c = countdown(t.due);
    var color = t.color || '#41b9a6';
    var el = document.createElement('article');
    el.className = 'task' +
      (done || (adminView && full) ? ' done' : '') +
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
    } else if (adminView) {
      var n = assigneesOf(t).filter(function (s2) { return isDoneFor(t, s2); }).length;
      action = '<span class="task-done-badge">' + (full ? ICON.check : '') +
        ' ' + ar(n) + '/' + ar(assigneesOf(t).length) + '</span>';
    } else if (done) {
      action = '<span class="task-done-badge">' + ICON.check + ' تمّت</span>';
    } else {
      action = '<button class="task-do" type="button" aria-label="إتمام المهمة">' +
        ICON.check + ' تم</button>';
    }

    var pts = (t.points && !done && !(adminView && full))
      ? '<span class="task-pts"><img src="' + esc(sticker(t.points)) + '" alt="' + ar(t.points) + ' نقطة" loading="lazy"></span>'
      : '';

    /* Compact head: an image task keeps the 2:1 banner on its own row with the
       title + tags underneath; an emoji task pulls the emoji, title and tags
       onto one tight line so the card stops being mostly empty space. */
    var titleTags = '<span class="task-title">' + esc(t.title) + '</span>' + tagsHtml(t);
    var head = t.img
      ? '<img class="task-img" src="' + esc(t.img) + '" alt="" loading="lazy">' +
        '<span class="task-head img"><span class="task-headtxt">' + titleTags + '</span></span>'
      : '<span class="task-head"><span class="task-emoji">' + esc(t.emoji || '📌') + '</span>' +
        '<span class="task-headtxt">' + titleTags + '</span></span>';

    el.innerHTML =
      (adminView ? '<button class="task-edit" type="button" title="تعديل المهمة" aria-label="تعديل المهمة">' + ICON.edit + '</button>' : '') +
      pts +
      head +
      '<span class="task-meta"><span class="task-due">' + esc(dueLabelOf(t)) + '</span>' +
      whoHtml(t, adminView) + '</span>' +
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
    var edit = $('.task-edit', el);
    if (edit) edit.addEventListener('click', function (e) { e.stopPropagation(); openEditTask(t.id); });
    return el;
  }

  /* compact countdown for the horizontal pill (ticks in place like the card) */
  function cdCompact(t) {
    var c = countdown(t.due);
    if (c.late) return '<span class="pill-cd late">تأخّرت ' + ar(c.days) + ' يوم</span>';
    return '<span class="pill-cd" data-due="' + t.due + '">' +
      '<span class="n" data-u="d">' + ar(c.days) + '</span><span class="u">يوم</span>' +
      '<span class="n" data-u="h">' + ar(c.hours) + '</span><span class="u">ساعة</span>' +
      '</span>';
  }

  /* ---------- one task as a horizontal pill (traditional list look) ---------- */
  function taskPill(t, i, opts) {
    opts = opts || {};
    var adminView = isAdmin || opts.supervise;
    var done = isDoneFor(t, adminView && opts.viewSlug ? opts.viewSlug : me.slug);
    var full = isFullyDone(t);
    var c = countdown(t.due);
    var color = t.color || '#41b9a6';
    var el = document.createElement('article');
    el.className = 'task pill' +
      (done || (adminView && full) ? ' done' : '') +
      (c.late ? ' overdue' : '') +
      (!c.late && c.ms <= 864e5 ? ' urgent' : '') +
      (opts.fire ? ' fire' : '');
    el.style.setProperty('--c', color);
    el.style.setProperty('--fg', readableOn(color));
    el.style.setProperty('--d', (i * 0.05) + 's');
    el.dataset.id = t.id;

    var media = t.img
      ? '<img class="task-img" src="' + esc(t.img) + '" alt="" loading="lazy">'
      : '<span class="task-emoji">' + esc(t.emoji || '📌') + '</span>';
    var pts = (t.points && !done && !(adminView && full))
      ? '<span class="task-pts"><img src="' + esc(sticker(t.points)) + '" alt="' + ar(t.points) + ' نقطة" loading="lazy"></span>'
      : '';

    var action;
    if (opts.archive && isDoneFor(t, me.slug)) {
      action = '<button class="pill-check undo" type="button" aria-label="تراجع عن إتمام المهمة">' + ICON.undo + ' تراجع</button>';
    } else if (adminView) {
      var n = assigneesOf(t).filter(function (s2) { return isDoneFor(t, s2); }).length;
      action = '<span class="pill-check badge">' + (full ? ICON.check : '') + ' ' + ar(n) + '/' + ar(assigneesOf(t).length) + '</span>';
    } else if (done) {
      action = '<span class="pill-check badge">' + ICON.check + '</span>';
    } else {
      action = '<button class="pill-check" type="button" aria-label="إتمام المهمة">' + ICON.check + '</button>';
    }

    el.innerHTML =
      pts +
      media +
      '<span class="pill-main">' +
        '<span class="task-title">' + esc(t.title) + '</span>' +
        tagsHtml(t) +
        '<span class="pill-quote">' + esc(done ? 'أحسنت، أتممتها.' : nudgeFor(c.ms)) + '</span>' +
      '</span>' +
      whoHtml(t, adminView) +
      cdCompact(t) +
      (adminView ? '<button class="task-edit" type="button" title="تعديل المهمة" aria-label="تعديل المهمة">' + ICON.edit + '</button>' : '') +
      action;

    var btn = $('.pill-check', el);
    if (btn && btn.tagName === 'BUTTON') {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('undo')) uncompleteTask(t.id);
        else completeTask(t.id, el);
      });
    }
    var edit = $('.task-edit', el);
    if (edit) edit.addEventListener('click', function (e) { e.stopPropagation(); openEditTask(t.id); });
    return el;
  }

  /* pick the renderer for the current appearance mode */
  function renderTaskEl(t, i, opts) {
    return taskView === 'pills' ? taskPill(t, i, opts) : taskCard(t, i, opts);
  }
  function listClass() { return 'task-list' + (taskView === 'pills' ? ' as-pills' : ''); }

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
        if (t.points && !hasEarned(t, me.slug)) { writeClaim(t); }
        else if (t.points) { toast('أحسنت! تمّت المهمة — نقاطها استُلمت سابقًا'); }
        else toast('أحسنت! تمّت المهمة 🎉');
        setTimeout(renderTasks, 900);
      })
      .catch(function () {
        delete t.done[me.slug];
        el.classList.remove('done');
        if (btn) btn.disabled = false;
        toast('تعذّر الحفظ، حاول مجددًا');
      });
  }

  /* ---------- points claim → Points site ---------- */
  var POINTS_URL = 'https://youssefdot.github.io/MdwnhPoints/';
  function writeClaim(t) {
    // Persist the claim first so "لاحقًا" still lets the Points site settle it.
    var key = nfc(me.dbKey);
    var payload = { taskId: t.id, title: t.title, points: t.points, color: t.color || '#3bb9ab', ts: Date.now() };
    dbPut(ROOT + '/claims/' + encodeURIComponent(key) + '/' + t.id, payload)
      .catch(function () { /* the popup still offers a manual path */ });
    // Stamp the points as earned so a re-completion (after un-archiving) can't
    // mint a second claim. Kept separate from `done` — un-completing clears
    // `done` but this stays, so points are strictly once per member per task.
    t.earned = t.earned || {}; t.earned[me.slug] = true;
    dbPut(ROOT + '/tasks/' + t.id + '/earned/' + me.slug, true)
      .catch(function () { /* best effort — claim already written */ });
    showClaim(t);
  }

  function showClaim(t) {
    var m = $('#claimModal');
    if (!m) { toast('أحسنت! استلم نقاطك من صفحة النقاط'); return; }
    var card = $('.claim-card', m);
    if (card) card.style.setProperty('--c', t.color || '#3bb9ab');
    $('#claimAvatar').src = avatar(me.slug);
    $('#claimAvatar').alt = me.name;
    $('#claimName').textContent = 'أحسنت يا ' + me.name + '!';
    $('#claimTaskTitle').textContent = t.title;
    var st = $('#claimSticker');
    st.src = sticker(t.points); st.alt = ar(t.points) + ' نقطة';
    st.onerror = function () { st.style.display = 'none'; };
    st.style.display = '';
    $('#claimPts').textContent = '+' + ar(t.points);
    m.hidden = false;

    $('#claimLater').onclick = function () { m.hidden = true; toast('نقاطك محفوظة — استلمها متى شئت'); };
    $('#claimNow').onclick = function () {
      m.hidden = true;
      var url = POINTS_URL + '?claim=1&user=' + encodeURIComponent(nfc(me.dbKey));
      if (window.__dropCurtain) window.__dropCurtain(url);
      else window.location.href = url;
    };
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

  /* returns true only when the delete actually proceeds — the edit panel uses
     that to know whether it should close itself or the user hit "cancel" */
  function deleteTask(id, title) {
    if (!isAdmin && !(tasks[id] && tasks[id].supervisors && tasks[id].supervisors[me.slug])) return false;
    if (!window.confirm('حذف المهمة «' + title + '» نهائيًا؟\nسيختفي هذا من قوائم كل المكلَّفين.')) return false;
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
    return true;
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

  function renderTasks(silent) {
    var host = $('#taskList');
    if (!host || !me) return;
    // background refreshes (poll/visibilitychange/late-countdown) rebuild the same
    // DOM from scratch — without this, every one of them replayed the card
    // entrance animation for the whole list every few seconds
    host.classList.toggle('silent', !!silent);
    host.innerHTML = '';

    var all = sortByDue(myTasks());
    var open = all.filter(function (t) {
      return isAdmin ? !isFullyDone(t) : !isDoneFor(t, me.slug);
    });

    // archive button count
    var arch = all.length - open.length;
    var ab = $('#archCount');
    if (ab) ab.textContent = arch ? ' (' + ar(arch) + ')' : '';

    if (!isAdmin) {
      // مهام تشرف عليها — a collapsible group above your own tasks, mini-admin
      // view (progress + edit), just like the leader's حريقة section
      // exclude anything I'm also assigned — that already shows in my own list
      var sup = sortByDue(supervisedTasks()).filter(function (t) {
        return !isFullyDone(t) && !(t.assignees && t.assignees[me.slug]);
      });
      if (sup.length) {
        var sec = document.createElement('section');
        sec.className = 'subgroup supervising';
        sec.dataset.group = 'sup-watch';
        sec.innerHTML =
          '<button class="sub-head" type="button" aria-expanded="true">' +
          '<span class="tri">' + ICON.tri + '</span>' +
          '<h3>قيد إشرافك 👁️</h3>' +
          '<span class="why">مهام تُشرف عليها — تابِع تقدّمها وعدّلها</span>' +
          '<span class="count">' + ar(sup.length) + '</span>' +
          '<span class="rule"></span>' +
          '</button>' +
          '<div class="group-body"><div class="group-inner"><div class="' + listClass() + '"></div></div></div>';
        var slst = $('.task-list', sec);
        sup.forEach(function (t, i) { slst.appendChild(renderTaskEl(t, i, { supervise: true })); });
        host.appendChild(sec);
        wireAllGroups(host);
      }

      if (!open.length) {
        // only show the "all done" cheer when there's genuinely nothing else here
        if (!sup.length) host.appendChild(emptyState());
        return;
      }
      var list = document.createElement('div');
      list.className = listClass();
      open.forEach(function (t, i) { list.appendChild(renderTaskEl(t, i)); });
      host.appendChild(list);
      return;
    }

    if (!open.length) { host.appendChild(emptyState()); return; }

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
        '<div class="group-body"><div class="group-inner"><div class="' + listClass() + '"></div></div></div>';
      var lst = $('.task-list', sec);
      items.forEach(function (t, i) { lst.appendChild(renderTaskEl(t, i, { fire: fireFlag })); });
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
    $$('.cd[data-due], .pill-cd[data-due]').forEach(function (cd) {
      var c = countdown(Number(cd.dataset.due));
      if (c.late) { renderTasks(true); return; }
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
      list.className = listClass();
      all.forEach(function (t, i) { list.appendChild(renderTaskEl(t, i, { archive: true })); });
      body.appendChild(list);
    }
    m.hidden = false;
  }

  /* ======================================================================
     11. ADMIN — ADD TASK
     ====================================================================== */
  var COLORS = ['#e54b2a', '#f3c02b', '#41b9a6', '#0b6eb9', '#8a5a12', '#9b5de5', '#ef476f', '#2a9d8f'];
  var EMOJIS = ['📌', '🎬', '✍️', '🎨', '📸', '📊', '📣', '🎧', '🗂️', '⚡', '🔥', '🌙', '⭐', '📝', '🎯', '💡'];

  var draft = { color: COLORS[0], emoji: EMOJIS[0], due: null, members: {}, supervisors: {}, tags: {}, points: null, img: null, mediaTab: 'emoji' };
  var calCursor = new Date();
  var editingTaskId = null;   // null = adding a new task; a task id = editing that task in place

  function renderTags() {
    var w = $('#tagPicker'); if (!w) return; w.innerHTML = '';
    TAG_ORDER.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag-opt' + (draft.tags[k] ? ' on' : '');
      b.style.setProperty('--tc', TAGS[k].color);
      b.setAttribute('aria-pressed', String(!!draft.tags[k]));
      b.innerHTML = '<span class="dot"></span>' + esc(TAGS[k].label);
      b.addEventListener('click', function () {
        if (draft.tags[k]) delete draft.tags[k]; else draft.tags[k] = true;
        renderTags();
      });
      w.appendChild(b);
    });
  }

  function renderPoints() {
    var w = $('#ptsPicker'); if (!w) return; w.innerHTML = '';
    POINT_VALUES.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pts-opt' + (draft.points === v ? ' on' : '');
      b.setAttribute('aria-label', ar(v) + ' نقطة');
      b.setAttribute('aria-pressed', String(draft.points === v));
      b.innerHTML = '<img src="' + sticker(v) + '" alt="' + ar(v) + ' نقطة">';
      b.addEventListener('click', function () { draft.points = (draft.points === v ? null : v); renderPoints(); });
      w.appendChild(b);
    });
    var none = document.createElement('button');
    none.type = 'button';
    none.className = 'pts-none' + (draft.points == null ? ' on' : '');
    none.textContent = 'بدون';
    none.addEventListener('click', function () { draft.points = null; renderPoints(); });
    w.appendChild(none);
  }

  function setMediaTab(tab) {
    draft.mediaTab = tab;
    $$('.media-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.mtab === tab); });
    $('#emojiPane').hidden = tab !== 'emoji';
    $('#imagePane').hidden = tab !== 'image';
    // which one wins (image vs emoji) is decided at save time from the active
    // tab, so switching tabs and back no longer throws away a cropped image
  }

  /* ---------- 2:1 image cropper (drag to pan, slider to zoom) ---------- */
  var crop = { img: null, natW: 0, natH: 0, cover: 1, mult: 1, x: 0, y: 0, sw: 0, sh: 0, drag: false, px: 0, py: 0 };
  function cropStageSize() {
    var st = $('#cropStage'); if (!st) return;
    var r = st.getBoundingClientRect();
    crop.sw = r.width || 400; crop.sh = r.height || 200;
  }
  function cropApply() {
    var el = $('#cropImg'); if (!el) return;
    var s = crop.cover * crop.mult;
    var dispW = crop.natW * s, dispH = crop.natH * s;
    // clamp so the image always covers the stage
    crop.x = Math.min(0, Math.max(crop.sw - dispW, crop.x));
    crop.y = Math.min(0, Math.max(crop.sh - dispH, crop.y));
    el.style.width = crop.natW + 'px';
    el.style.transform = 'translate(' + crop.x + 'px,' + crop.y + 'px) scale(' + s + ')';
  }
  /* the crop stage only has real dimensions once its popup is open and laid
     out, so stage-size-dependent setup runs after the modal is shown */
  function openCropModal() {
    var m = $('#cropModal'); if (m) m.hidden = false;
    cropStageSize(); cropApply();   // re-lay-out any already-primed crop (e.g. window resized meanwhile)
  }
  function primeCropStage() {
    var el = $('#cropImg');
    crop.natW = el.naturalWidth; crop.natH = el.naturalHeight;
    openCropModal();
    crop.cover = Math.max(crop.sw / crop.natW, crop.sh / crop.natH);
    crop.mult = 1;
    var dispW = crop.natW * crop.cover, dispH = crop.natH * crop.cover;
    crop.x = (crop.sw - dispW) / 2; crop.y = (crop.sh - dispH) / 2;
    var z = $('#cropZoom'); if (z) z.value = 1;
    cropApply();
  }
  function loadCropFile(file) {
    if (!file || !/^image\//.test(file.type)) { toast('اختر ملف صورة'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var el = $('#cropImg');
      el.onload = primeCropStage;
      el.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  /* re-opens the popup on an already-known image — used for "تعديل الصورة"
     on a task that was edited rather than freshly uploaded this session */
  function loadCropFromSrc(src) {
    var el = $('#cropImg');
    el.onload = primeCropStage;
    el.src = src;
  }
  function cropToDataURL() {
    if (!crop.natW) return null;
    var OW = 640, OH = 320;
    var cv = document.createElement('canvas');
    cv.width = OW; cv.height = OH;
    var ctx = cv.getContext('2d');
    var k = OW / crop.sw;                 // stage px -> canvas px
    var s = crop.cover * crop.mult;
    var el = $('#cropImg');
    ctx.drawImage(el, crop.x * k, crop.y * k, crop.natW * s * k, crop.natH * s * k);
    return cv.toDataURL('image/jpeg', 0.82);
  }
  function showImagePreview(src) {
    var pv = $('#imgPreview'); if (pv) pv.src = src;
    $('#imgPreviewRow').hidden = false;
    $('#dropzone').hidden = true;
  }
  function initCropper() {
    var dz = $('#dropzone'), inp = $('#imageInput'), st = $('#cropStage'), z = $('#cropZoom'), rs = $('#cropReset');
    if (!dz || dz.dataset.wired) return;
    dz.dataset.wired = '1';
    dz.addEventListener('click', function () { inp.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('drag'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault(); dz.classList.remove('drag');
      if (e.dataTransfer && e.dataTransfer.files[0]) loadCropFile(e.dataTransfer.files[0]);
    });
    inp.addEventListener('change', function () { if (inp.files[0]) loadCropFile(inp.files[0]); inp.value = ''; });
    z.addEventListener('input', function () { crop.mult = Number(z.value) || 1; cropApply(); });
    if (rs) rs.addEventListener('click', function () {
      // re-centres pan/zoom — the whole image is discarded via "إزالة" instead
      if (!crop.natW) return;
      crop.mult = 1;
      var dispW = crop.natW * crop.cover, dispH = crop.natH * crop.cover;
      crop.x = (crop.sw - dispW) / 2; crop.y = (crop.sh - dispH) / 2;
      var zz = $('#cropZoom'); if (zz) zz.value = 1;
      cropApply();
    });

    var cropSave = $('#cropSave');
    if (cropSave) cropSave.addEventListener('click', function () {
      draft.img = cropToDataURL();
      showImagePreview(draft.img);
      $('#cropModal').hidden = true;
    });
    var cropCancel = $('#cropCancel');
    if (cropCancel) cropCancel.addEventListener('click', function () {
      $('#cropModal').hidden = true;
      if (!draft.img) {   // never confirmed a crop yet this session — back to the dropzone
        crop.natW = 0;
        var el = $('#cropImg'); if (el) el.removeAttribute('src');
        $('#dropzone').hidden = false;
        $('#imgPreviewRow').hidden = true;
      }
    });
    var editBtn = $('#imgEditBtn');
    if (editBtn) editBtn.addEventListener('click', function () {
      if (crop.natW) { openCropModal(); } else if (draft.img) { loadCropFromSrc(draft.img); }
    });
    var removeBtn = $('#imgRemoveBtn');
    if (removeBtn) removeBtn.addEventListener('click', function () {
      draft.img = null; crop.natW = 0;
      var el = $('#cropImg'); if (el) el.removeAttribute('src');
      $('#imgPreviewRow').hidden = true;
      $('#dropzone').hidden = false;
    });

    function down(e) {
      crop.drag = true;
      var p = e.touches ? e.touches[0] : e;
      crop.px = p.clientX; crop.py = p.clientY;
    }
    function move(e) {
      if (!crop.drag) return;
      var p = e.touches ? e.touches[0] : e;
      crop.x += p.clientX - crop.px; crop.y += p.clientY - crop.py;
      crop.px = p.clientX; crop.py = p.clientY;
      cropApply();
      if (e.cancelable) e.preventDefault();
    }
    function up() { crop.drag = false; }
    st.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

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

  /* ---------- مشرفون (supervisors) ---------- */
  /* chips shown in the add/edit sheet next to the "إضافة مشرف" button */
  function renderSupPicked() {
    var w = $('#supPicked'); if (!w) return; w.innerHTML = '';
    var keys = Object.keys(draft.supervisors);
    if (!keys.length) { w.innerHTML = '<span class="none">لا مشرف على هذه المهمة</span>'; return; }
    keys.forEach(function (s) {
      var m = BY_SLUG[s]; if (!m) return;
      var p = document.createElement('span');
      p.className = 'pill';
      p.innerHTML = '<img src="' + esc(avatar(s)) + '" alt=""><span>' + esc(m.name) + '</span>' +
        '<button type="button" aria-label="إزالة ' + esc(m.name) + '">' + ICON.x + '</button>';
      $('button', p).addEventListener('click', function () {
        delete draft.supervisors[s]; renderSupPicked(); renderSupPeople();
      });
      w.appendChild(p);
    });
  }
  /* the member grid inside the supervisor popup (multi-select) */
  function renderSupPeople() {
    var w = $('#supPeople'); if (!w) return; w.innerHTML = '';
    ROSTER.filter(function (m) { return !m.admin; }).forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'person' + (draft.supervisors[m.slug] ? ' on' : '');
      b.innerHTML = '<img src="' + esc(avatar(m.slug)) + '" alt="" loading="lazy">' +
        '<span class="pname">' + esc(m.name) + '</span>' +
        '<span class="tick">' + ICON.check + '</span>';
      b.setAttribute('aria-pressed', String(!!draft.supervisors[m.slug]));
      b.addEventListener('click', function () {
        if (draft.supervisors[m.slug]) delete draft.supervisors[m.slug];
        else draft.supervisors[m.slug] = true;
        renderSupPeople(); renderSupPicked();
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
    editingTaskId = null;
    draft = { color: COLORS[0], emoji: EMOJIS[0], due: null, members: {}, supervisors: {}, tags: {}, points: null, img: null, mediaTab: 'emoji' };
    calCursor = new Date();
    $('#taskName').value = '';
    $('#calTime').value = '23:59';
    var ci = $('#emojiCustom'); if (ci) ci.value = '';
    crop.natW = 0;
    var cImg = $('#cropImg'); if (cImg) cImg.removeAttribute('src');
    if ($('#cropModal')) $('#cropModal').hidden = true;
    if ($('#dropzone')) $('#dropzone').hidden = false;
    if ($('#imgPreviewRow')) $('#imgPreviewRow').hidden = true;
    setMediaTab('emoji');
    renderSwatches(); renderEmojis(); renderTags(); renderPoints();
    renderCal(); renderPicked(); renderPeople(); renderSupPicked(); renderSupPeople(); validateDraft();
    $('#addModalTitle').textContent = 'إضافة مهمة';
    $('#saveTask').textContent = 'إضافة المهمة';
    if ($('#deleteTaskBtn')) $('#deleteTaskBtn').hidden = true;
  }

  /* opens the same panel used for "add", pre-filled from an existing task —
     everything (title/color/due/tags/points/assignees/media) is editable */
  function openEditTask(id) {
    var t = tasks[id]; if (!t) return;
    resetDraft();
    editingTaskId = id;
    draft.color = t.color || COLORS[0];
    draft.due = t.due || null;
    draft.members = Object.assign({}, t.assignees || {});
    draft.supervisors = Object.assign({}, t.supervisors || {});
    draft.tags = Object.assign({}, t.tags || {});
    draft.points = t.points || null;
    calCursor = t.due ? new Date(t.due) : new Date();

    $('#taskName').value = t.title || '';
    if (t.due) {
      var hh = new Date(t.due).getHours(), mm = new Date(t.due).getMinutes();
      $('#calTime').value = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }

    if (t.img) {
      draft.img = t.img;
      showImagePreview(t.img);
      setMediaTab('image');
    } else {
      draft.emoji = t.emoji || EMOJIS[0];
      if (EMOJIS.indexOf(draft.emoji) === -1) { var ci = $('#emojiCustom'); if (ci) ci.value = draft.emoji; }
      setMediaTab('emoji');
    }

    renderSwatches(); renderEmojis(); renderTags(); renderPoints();
    renderCal(); renderPicked(); renderPeople(); renderSupPicked(); renderSupPeople(); validateDraft();

    $('#addModalTitle').textContent = 'تعديل المهمة';
    $('#saveTask').textContent = 'حفظ التعديلات';
    $('#deleteTaskBtn').hidden = false;
    $('#addModal').hidden = false;
  }

  function saveTask() {
    // which media wins is whatever tab is active right now
    if (draft.mediaTab !== 'image') draft.img = null;

    // gentle nudges — only when ADDING a new task; editing shouldn't re-nag
    if (!editingTaskId) {
      if (!Object.keys(draft.tags).length &&
          !window.confirm('لم تُضِف أي وسم لهذه المهمة. المتابعة بدون وسوم؟')) return;
      if (draft.points == null &&
          !window.confirm('لم تُحدِّد نقاطًا لهذه المهمة. المتابعة بدون نقاط؟')) return;
    }

    var btn = $('#saveTask');

    if (editingTaskId) {
      var id = editingTaskId;
      btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
      var patch = {
        title: $('#taskName').value.trim(),
        color: draft.color,
        due: draft.due,
        assignees: draft.members,
        supervisors: Object.keys(draft.supervisors).length ? draft.supervisors : null,
        tags: Object.keys(draft.tags).length ? draft.tags : null,
        points: draft.points || null,
        img: draft.img || null,
        emoji: draft.img ? null : draft.emoji
      };
      dbPatch(ROOT + '/tasks/' + id, patch).then(function () {
        var merged = Object.assign({}, tasks[id], patch);
        if (!patch.img) delete merged.img;      // PATCHing a key to null deletes it server-side too
        if (!patch.emoji) delete merged.emoji;
        if (!patch.supervisors) delete merged.supervisors;
        tasks[id] = merged;
        $('#addModal').hidden = true;
        toast('تم حفظ التعديلات');
        resetDraft();
        renderTasks();
      }).catch(function () {
        toast('تعذّر حفظ التعديلات');
      }).finally(function () {
        btn.textContent = 'حفظ التعديلات';
        validateDraft();
      });
      return;
    }

    btn.disabled = true; btn.textContent = 'جارٍ الإضافة…';
    var t = {
      title: $('#taskName').value.trim(),
      color: draft.color,
      due: draft.due,
      assignees: draft.members,
      supervisors: Object.keys(draft.supervisors).length ? draft.supervisors : null,
      done: {},
      tags: Object.keys(draft.tags).length ? draft.tags : null,
      points: draft.points || null,
      createdAt: Date.now(),
      createdBy: me.slug,
      notified: { created: false, day1: false }
    };
    if (draft.img) t.img = draft.img; else t.emoji = draft.emoji;

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

  /* A PushSubscription is permanently bound to the VAPID key it was created
     with. Rotate the key and every existing subscription keeps answering to
     the old one, so the push service rejects each send with 403 and the user
     sees nothing. Detect that and re-subscribe rather than making people
     clear their site data. */
  function keyOfSubscription(sub) {
    try {
      var raw = sub.options && sub.options.applicationServerKey;
      if (!raw) return null;
      var bytes = new Uint8Array(raw);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return null; }
  }

  function subscribePush(slug) {
    if (!pushSupported() || !VAPID_PUBLIC_KEY) return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub) {
          // Two independent signals. options.applicationServerKey is the
          // authoritative one but is missing on some browsers, so fall back to
          // the key we recorded when we last subscribed on this device.
          var bound = keyOfSubscription(sub);
          var remembered = null;
          try { remembered = localStorage.getItem(LS_VAPID); } catch (e) {}
          var stale = (bound && bound !== VAPID_PUBLIC_KEY) ||
                      (!bound && remembered && remembered !== VAPID_PUBLIC_KEY);
          if (!stale) return sub;
          console.log('[push] VAPID key rotated — re-subscribing this device');
          var oldKey = subKey(sub.endpoint);
          return sub.unsubscribe()
            .catch(function () { /* unsubscribe can fail; subscribing again still works */ })
            .then(function () {
              dbDelete(ROOT + '/users/' + slug + '/push/' + oldKey);
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY)
              });
            });
        }
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY)
        });
      });
    }).then(function (sub) {
      var j = sub.toJSON();
      var key = subKey(j.endpoint);
      try { localStorage.setItem(LS_VAPID, VAPID_PUBLIC_KEY); } catch (e) {}
      return dbPut(ROOT + '/users/' + slug + '/push/' + key, {
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        vapid: VAPID_PUBLIC_KEY,     // lets the sender spot a stale binding
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

    // favourites + personal quicklinks
    paintLinkIcons();
    Promise.all([
      dbGet(ROOT + '/users/' + me.slug + '/favourites').catch(function () { return null; }),
      dbGet(ROOT + '/users/' + me.slug + '/quicklinks').catch(function () { return null; })
    ]).then(function (r) {
      favs = r[0] || {};
      quicklinks = r[1] || {};
      mountStars(); renderFavs();
    });

    loadTasks(true);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { loadTasks(false); }, REFRESH_MS);
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tickCountdowns, 30000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { loadTasks(false); refreshNag(); }
    });

    // The add/edit sheet is used by the leader (add + edit) AND by supervisors
    // (edit their supervised tasks), so prime it for everyone — a plain member
    // who never opens it pays nothing for the idle DOM.
    initCropper();
    renderSwatches(); renderEmojis(); renderTags(); renderPoints();
    renderCal(); renderPicked(); renderPeople(); renderSupPicked(); renderSupPeople(); validateDraft();
  }

  function loadTasks(showLoader) {
    var ld = $('#taskLoader'), lbl = $('#taskLoaderLbl');
    if (showLoader) { if (ld) ld.hidden = false; if (lbl) lbl.hidden = false; }
    return dbGet(ROOT + '/tasks').then(function (t) {
      tasks = t || {};
      if (ld) ld.hidden = true;
      if (lbl) lbl.hidden = true;
      renderTasks(!showLoader);
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
     14b. APP SHELL — resizable split, view toggle, mobile pages + fan
     ====================================================================== */
  function isMobile() { return window.matchMedia('(max-width:820px)').matches; }

  /* ---- task appearance ---- */
  function setView(v) {
    taskView = (v === 'pills') ? 'pills' : 'cards';
    try { localStorage.setItem(LS_VIEW, taskView); } catch (e) { }
    var vc = $('#viewCards'), vp = $('#viewPills');
    if (vc) { vc.classList.toggle('on', taskView === 'cards'); vc.setAttribute('aria-pressed', String(taskView === 'cards')); }
    if (vp) { vp.classList.toggle('on', taskView === 'pills'); vp.setAttribute('aria-pressed', String(taskView === 'pills')); }
    if (me) renderTasks();
  }

  /* ---- resizable split (desktop) ---- */
  function applySplit(tp) {
    var split = $('#split'); if (!split) return;
    tp = Math.min(72, Math.max(24, tp));       // keep both panes usable
    split.style.setProperty('--tp', tp);
    split.style.setProperty('--lp', 100 - tp);
  }
  function currentTp() {
    var split = $('#split');
    return parseFloat(split && split.style.getPropertyValue('--tp')) || 34;
  }
  function saveTp() { try { localStorage.setItem(LS_SPLIT, String(Math.round(currentTp()))); } catch (e) { } }
  function initDivider() {
    var split = $('#split'), div = $('#divider');
    if (!split || !div) return;
    var saved = parseFloat(localStorage.getItem(LS_SPLIT));
    applySplit(isFinite(saved) ? saved : 34);   // default: compact tasks / wide links
    var dragging = false;
    div.addEventListener('pointerdown', function (e) {
      if (isMobile()) return;               // no side-resize on the mobile pager — leave the swipe alone
      dragging = true; document.body.classList.add('resizing'); div.classList.add('drag');
      div.setPointerCapture && div.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var r = split.getBoundingClientRect();
      applySplit((e.clientX - r.left) / r.width * 100);   // split runs LTR: tasks on the left
      if (e.cancelable) e.preventDefault();
    });
    window.addEventListener('pointerup', function () {
      if (!dragging) return; dragging = false;
      document.body.classList.remove('resizing'); div.classList.remove('drag');
      saveTp();
    });
    div.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { applySplit(currentTp() - 3); saveTp(); }
      else if (e.key === 'ArrowRight') { applySplit(currentTp() + 3); saveTp(); }
    });
  }

  /* ---- mobile page switching (the split is a native scroll-snap track) ---- */
  function markPage(p) {                                 // sync only the tab bar / indicator
    document.body.setAttribute('data-page', p);
    var tt = $('#tabTasks'), tl = $('#tabLinks');
    if (tt) { tt.classList.toggle('on', p === 'tasks'); tt.setAttribute('aria-pressed', String(p === 'tasks')); }
    if (tl) { tl.classList.toggle('on', p === 'links'); tl.setAttribute('aria-pressed', String(p === 'links')); }
  }
  /* snappy in-house tween — the native smooth scroll is too slow/laggy for a
     two-page pager, so we drive scrollLeft ourselves over a short duration */
  function animScrollLeft(el, target, dur, done) {
    var start = el.scrollLeft, delta = target - start, t0 = 0;
    if (reduceMotion || Math.abs(delta) < 1) { el.scrollLeft = target; if (done) done(); return; }
    function ease(p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
    (function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      el.scrollLeft = start + delta * ease(p);
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    })(performance.now());
  }
  /* drive the tab-bar pill 1:1 with scroll progress while a swipe/tween is in
     flight — a discrete flip at the 50% mark makes it snap back and forth when
     the finger wobbles near the threshold, so instead we follow the finger and
     only hand control back to the CSS spring once the track has settled. */
  function trackIndicator(frac) {
    var ind = $('#tabInd'); if (!ind) return;
    ind.style.transition = 'none';
    ind.style.transform = 'translateX(' + (Math.max(0, Math.min(1, frac)) * 100) + '%)';
  }
  function releaseIndicator() {
    var ind = $('#tabInd'); if (!ind) return;
    ind.style.transition = '';
    ind.style.transform = '';
  }
  function setPage(p) {
    if (p !== 'tasks' && p !== 'links') return;
    markPage(p);
    var split = $('#split');
    if (split && isMobile()) {
      var left = p === 'links' ? split.clientWidth : 0;
      // `scroll-snap-type:mandatory` fights an in-flight animation and can stall
      // the track half-way between pages (the "empty half" glitch). Relax snap
      // for the tween, then restore it so finger-swipes still snap crisply.
      split.style.scrollSnapType = 'none';
      clearTimeout(setPage._snap);
      animScrollLeft(split, left, 115, function () {
        split.scrollLeft = left;            // land exactly on the page
        split.style.scrollSnapType = '';
        releaseIndicator();
      });
    }
    closeFan();
  }

  /* Follow the native swipe: keep the tab bar in step with the scroll position,
     and drop the favourites fan once we've settled back on المهام. */
  function initPager() {
    var split = $('#split'); if (!split) return;
    var raf = 0, settleT = 0, curPage = document.body.getAttribute('data-page') || 'tasks';
    split.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!isMobile()) return;
        var frac = split.scrollLeft / split.clientWidth;
        trackIndicator(frac);
        // hysteresis band around the midpoint: a wobbling finger near 50% must
        // not flip the committed page (and its tab classes/aria) back and forth
        var next = curPage;
        if (curPage === 'tasks' && frac > 0.6) next = 'links';
        else if (curPage === 'links' && frac < 0.4) next = 'tasks';
        if (next !== curPage) {
          curPage = next;
          markPage(next);
          if (next === 'tasks') closeFan();
        }
        clearTimeout(settleT);
        settleT = setTimeout(releaseIndicator, 80);
      });
    }, { passive: true });

    /* Flick-to-page: a quick horizontal flick commits to the next page even if
       the finger didn't drag past the snap threshold. We read the browser's own
       scroll delta (sign already correct for RTL) so a small nudge toward a page
       finishes the trip — native snap still handles slow, full drags. */
    var sx = 0, sy = 0, st = 0, ssl = 0;
    split.addEventListener('touchstart', function (e) {
      if (!isMobile()) return;
      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now(); ssl = split.scrollLeft;
    }, { passive: true });
    split.addEventListener('touchend', function (e) {
      if (!isMobile()) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st;
      if (dt > 350 || Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy)) return; // not a horizontal flick
      var moved = split.scrollLeft - ssl;      // browser's own sign (RTL-safe)
      if (Math.abs(moved) < 4) return;         // track didn't budge — let native snap decide
      setPage(moved > 0 ? 'links' : 'tasks');
    }, { passive: true });
  }

  /* ---- favourites fan (mobile) ---- */
  function openFan() {
    var fan = $('#favFan'), tray = $('#favFanTray'), strip = $('#favStrip'), fab = $('#fabFav');
    if (!fan || !tray || !strip) return;
    tray.appendChild(strip);                       // lift the live strip into the fan
    $$('#favStrip > *').forEach(function (elm, i) { elm.style.animationDelay = (i * 0.04) + 's'; });
    fan.classList.add('open'); fan.setAttribute('aria-hidden', 'false');
    if (fab) { fab.classList.add('on'); fab.setAttribute('aria-expanded', 'true'); }
  }
  function closeFan() {
    var fan = $('#favFan'), fab = $('#fabFav');
    if (fab) { fab.classList.remove('on'); fab.setAttribute('aria-expanded', 'false'); }
    if (!fan || !fan.classList.contains('open')) return;
    fan.classList.remove('open'); fan.setAttribute('aria-hidden', 'true');
    var home = $('#favGroup .group-inner'), strip = $('#favStrip');
    if (home && strip) home.appendChild(strip);    // return it to its desktop home
  }

  function initShell() {
    var v = 'pills';
    try { v = localStorage.getItem(LS_VIEW) || 'pills'; } catch (e) { }
    setView(v);
    var vc = $('#viewCards'), vp = $('#viewPills');
    if (vc) vc.addEventListener('click', function () { setView('cards'); });
    if (vp) vp.addEventListener('click', function () { setView('pills'); });

    initDivider();

    var tt = $('#tabTasks'), tl = $('#tabLinks');
    if (tt) tt.addEventListener('click', function () { setPage('tasks'); });
    if (tl) tl.addEventListener('click', function () { setPage('links'); });
    var fab = $('#fabFav');
    if (fab) fab.addEventListener('click', function () {
      var fan = $('#favFan');
      if (fan && fan.classList.contains('open')) closeFan(); else openFan();
    });
    var scrim = $('#favFanScrim');
    if (scrim) scrim.addEventListener('click', closeFan);

    initPager();
  }

  /* ======================================================================
     15. WIRE UP
     ====================================================================== */
  function wireStatic() {
    wireAllGroups();
    initShell();

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

    $$('.modal [data-close]').forEach(function (b) {
      b.addEventListener('click', function () { $('#' + b.dataset.close).hidden = true; });
    });
    $$('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.hidden = true; });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { $$('.modal').forEach(function (m) { m.hidden = true; }); closeFan(); }
    });

    var add = $('#addTaskBtn');
    if (add) add.addEventListener('click', function () { resetDraft(); $('#addModal').hidden = false; });
    var save = $('#saveTask');
    if (save) save.addEventListener('click', saveTask);
    var delTaskBtn = $('#deleteTaskBtn');
    if (delTaskBtn) delTaskBtn.addEventListener('click', function () {
      if (!editingTaskId) return;
      var t = tasks[editingTaskId];
      if (deleteTask(editingTaskId, t ? t.title : '')) {
        $('#addModal').hidden = true;
        resetDraft();
      }
    });
    var supBtn = $('#addSupBtn');
    if (supBtn) supBtn.addEventListener('click', function () {
      renderSupPeople(); renderSupPicked();
      $('#supModal').hidden = false;
    });
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

    // emoji / image tabs
    $$('.media-tab').forEach(function (b) {
      b.addEventListener('click', function () { setMediaTab(b.dataset.mtab); });
    });

    // add-quicklink modal
    var sq = $('#saveQuick');
    if (sq) sq.addEventListener('click', saveQuicklink);
    var qn = $('#qlName'), qu = $('#qlUrl'), qe = $('#qlEmoji');
    if (qn) qn.addEventListener('input', validateQuick);
    if (qu) qu.addEventListener('input', validateQuick);
    if (qe) qe.addEventListener('input', function () {
      var v = qe.value.trim();
      if (v) { qlDraft.icon = v; renderQlIcons(); }   // an emoji beats the glyph choice
      else { qlDraft.icon = '@link'; renderQlIcons(); }
      renderQlPreview();
    });
  }

  function start() {
    wireStatic();
    // Prefer the shared roster repo; fall back to the bundled members.json if it's unreachable.
    fetch(ROSTER_BASE + '/members.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return fetch('members.json').then(function (r) { return r.json(); }); })
      .then(function (data) {
      // Only real, active members belong on the roster (drop dummies + deactivated members).
      ROSTER = data.members.filter(function (m) { return !m.dummy && m.active !== false; });
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
