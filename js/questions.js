// 题库合并、难度选题、错题库
(function () {
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return "q" + (h >>> 0).toString(36);
  }
  // 题目 id 只由内容决定，这样题库重新生成后错题库还能对得上
  const _idSeen = {};
  function qid(prefix, q) {
    let base = prefix + hash((q.stem || "") + "|" + (q.o || []).join("|"));
    if (_idSeen[base]) base = base + "#" + ++_idSeen[base];
    else _idSeen[base] = 1;
    return base;
  }

  const OWN = (window.QUESTIONS_STEM || []).concat(window.QUESTIONS_LANG || []).map(function (q) {
    return {
      id: qid("own", q),
      subject: q.s,
      level: q.l,
      passage: q.p || null,
      kind: q.kind || "cloze",
      stem: q.stem,
      options: q.o,
      answer: q.a,
      explain: q.x || "",
      src: "自建",
      from: q.y || ""
    };
  });

  const FILL = (window.QUESTIONS_FILL || []).map(function (q) {
    return {
      id: qid("fill", q),
      subject: q.s,
      level: q.l,
      passage: q.p || null,
      kind: q.kind || "single",
      stem: q.stem,
      options: q.o,
      answer: q.a,
      explain: q.x || "",
      src: "补位",
      from: ""
    };
  });

  const ZK_IMG = window.QUESTIONS_IMG || [];
  const ZK = (window.QUESTIONS_ZK || []).map(function (q) {
    return {
      id: qid("zk", q),
      subject: q.s,
      level: q.l,
      passage: q.p || null,
      kind: q.kind || "single",
      stem: q.stem,
      options: q.o,
      answer: q.a,
      explain: q.x || "",
      // g 是题干/选项里 [[IMG:k]] 占位对应的图片编号，顺序和占位下标一致
      figs: (q.g || []).map(function (i) { return ZK_IMG[i] || null; }),
      // tb 是 [[TBL:k]] 占位对应的表格网格（行列文本）
      tables: q.tb || [],
      // k=1 是孩子错题本里的重点题：抽题归到「重点题」这个科目，界面仍显示真实科目
      src: q.k ? "重点题" : "浙江真题",
      key: !!q.k,
      rsub: q.k ? (q.sub || "") : "",
      from: q.k ? "" : ((q.y || "") + (q.r ? "·" + q.r : ""))
    };
  });

  // [[TBL:k]] 画成真正的表格：只建 DOM，不拼 innerHTML
  function buildTable(rows) {
    const t = document.createElement("table");
    t.className = "qtbl";
    rows.forEach(function (row, ri) {
      const tr = document.createElement("tr");
      row.forEach(function (cell) {
        const td = document.createElement(ri === 0 ? "th" : "td");
        td.textContent = cell == null ? "" : String(cell);
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
    return t;
  }

  // 把带 [[IMG:k]] / [[TBL:k]] 占位的文本渲染成「文字 + 插图 + 表格」的片段，不用 innerHTML 拼字符串
  window.renderRich = function (text, figs, tbls) {
    const frag = document.createDocumentFragment();
    const s = String(text == null ? "" : text);
    const re = /\[\[(IMG|TBL):(\d+)\]\]/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      last = re.lastIndex;
      if (m[1] === "IMG") {
        const src = figs && figs[+m[2]];
        if (!src) continue;
        const im = document.createElement("img");
        im.className = "qfig";
        im.src = src;
        im.alt = "题目插图";
        frag.appendChild(im);
      } else {
        const rows = tbls && tbls[+m[2]];
        if (!rows || !rows.length) continue;
        frag.appendChild(buildTable(rows));
      }
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    return frag;
  };
  // 语音朗读时把占位符念成「图」/「表格」
  window.stripImg = function (text) {
    return String(text == null ? "" : text)
      .replace(/\[\[IMG:\d+\]\]/g, " 图 ")
      .replace(/\[\[TBL:\d+\]\]/g, " 表格 ");
  };

  // 真题为唯一主源：某科目浙江真题不足 MIN_ZK 道时，才用自建/补位题兜底，
  // 保证生物、地理这类还没有浙江真题入库的科目照样能打仗。
  const MIN_ZK = 20;
  const ZK_COUNT = (function () {
    const m = {};
    ZK.forEach(function (q) { m[q.subject] = (m[q.subject] || 0) + 1; });
    return m;
  })();
  const FILL_SUBJECTS = (function () {
    const seen = [];
    FILL.forEach(function (q) { if (seen.indexOf(q.subject) < 0) seen.push(q.subject); });
    return seen;
  })();

  const BACKUP = OWN.concat(FILL).filter(function (q) {
    const n = ZK_COUNT[q.subject] || 0;
    if (n >= MIN_ZK) return false;
    return n > 0 || FILL_SUBJECTS.indexOf(q.subject) >= 0;   // 编程等无真题的自编科目不再出题
  });

  const ALL = ZK.length ? ZK.concat(BACKUP) : OWN.concat(FILL);

  // 科目列表：按题量多的排前面，保证默认顺序稳定
  const SUBJECTS = (function () {
    const seen = [];
    ALL.forEach(function (q) { if (seen.indexOf(q.subject) < 0) seen.push(q.subject); });
    return seen;
  })();
  window.QBANK = ALL;
  window.QSUBJECTS = SUBJECTS;
  window.MIN_ZK = MIN_ZK;

  // 战斗界面与错题库显示的出处标签：真题带年份·地区，重点题只标「重点题」，兜底题标成「补位题」
  window.qSource = function (q) {
    if (q.src === "重点题") return (q.from ? q.from + " · " : "") + "重点题";
    if (q.src !== "浙江真题") return "补位题";
    return (q.from ? q.from + " · " : "") + "浙江真题";
  };

  // 题面上显示的科目：重点题回到真实科目，抽题归类仍然是「重点题」
  window.qSubject = function (q) {
    return (q.key && q.rsub) ? q.rsub : q.subject;
  };

  // ---------- 科目偏好（用户自选出题科目，localStorage 持久化） ----------
  const PKEY = "dinorpg.subjects.v1";

  function subjectCounts() {
    const m = {};
    SUBJECTS.forEach(function (s) { m[s] = { zk: 0, own: 0, fill: 0, key: 0, total: 0, byLevel: {} }; });
    ALL.forEach(function (q) {
      const e = m[q.subject]; if (!e) return;
      e[q.src === "浙江真题" ? "zk" : q.src === "重点题" ? "key" : q.src === "补位" ? "fill" : "own"]++;
      e.total++;
      e.byLevel[q.level] = (e.byLevel[q.level] || 0) + 1;
    });
    return m;
  }
  window.subjectCounts = subjectCounts;

  function readPrefs() {
    try {
      const raw = localStorage.getItem(PKEY);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (s) { return SUBJECTS.indexOf(s) >= 0; }) : null;
    } catch (e) { return null; }
  }

  function enabledSubjects() {
    const p = readPrefs();
    if (!p || !p.length) return SUBJECTS.slice();   // 未配置或全清空时回退到全科目，避免无题可出
    return p;
  }

  function setSubjects(list) {
    const keep = SUBJECTS.filter(function (s) { return list.indexOf(s) >= 0; });
    try { localStorage.setItem(PKEY, JSON.stringify(keep)); } catch (e) { window._memSubjects = keep; }
    return keep;
  }

  window.getSubjects = function () {
    return window._memSubjects ? window._memSubjects.slice() : enabledSubjects();
  };
  window.setSubjects = setSubjects;

  // ---------- 错题库（localStorage 持久化） ----------
  const WKEY = "dinorpg.wrongbook.v1";
  function readWrong() {
    try {
      const raw = localStorage.getItem(WKEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) {
      return {};
    }
  }
  function writeWrong(obj) {
    try {
      localStorage.setItem(WKEY, JSON.stringify(obj));
    } catch (e) {
      window._memWrong = obj; // file:// 下可能被禁用存储时的兜底
    }
  }
  let mem = null;
  function store() {
    if (window._memWrong) return window._memWrong;
    return readWrong();
  }

  const WRONG = {
    all: function () {
      const s = store();
      return Object.keys(s)
        .map(function (id) { return { id: id, wrong: s[id].w, right: s[id].r, q: findById(id) }; })
        .filter(function (x) { return !!x.q; })
        .sort(function (a, b) { return b.wrong - a.wrong; });
    },
    count: function () {
      return WRONG.all().length;
    },
    has: function (id) {
      const s = store();
      return !!s[id] && (s[id].w - s[id].r) > 0;
    },
    addWrong: function (id) {
      const s = store();
      const e = s[id] || { w: 0, r: 0 };
      e.w++;
      s[id] = e;
      writeWrong(s);
    },
    addRight: function (id) {
      const s = store();
      if (!s[id]) return;
      const e = s[id];
      e.r++;
      if (e.w - e.r > 0) s[id] = e; else delete s[id]; // 补回一次即视为掌握
      writeWrong(s);
    },
    remove: function (id) {
      const s = store();
      delete s[id];
      writeWrong(s);
    },
    clear: function () { writeWrong({}); }
  };
  window.WRONGBOOK = WRONG;

  function findById(id) {
    for (let i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
    return null;
  }
  window.findQuestion = findById;

  // 敌人层级 1..10 → 题目难度 1..5
  window.levelForTier = function (tier) {
    return Math.max(1, Math.min(5, Math.ceil(tier / 2)));
  };

  // 随机出题：只在已勾选科目里抽 → 匹配难度 → 排除已用/错题库
  window.pickQuestion = function (tier, usedIds) {
    usedIds = usedIds || {};
    const L = window.levelForTier(tier);
    const pool = enabledSubjects();
    const shuffled = pool.slice().sort(function () { return Math.random() - 0.5; });
    const buckets = [];
    shuffled.forEach(function (sub) { buckets.push({ subject: sub, levels: [L] }); });
    // 难度不够时逐级放宽
    const extraLevels = [];
    for (let d = 1; d <= 4; d++) {
      [L - d, L + d].forEach(function (lv) {
        if (lv >= 1 && lv <= 5) extraLevels.push(lv);
      });
    }
    extraLevels.forEach(function (lv) { shuffled.forEach(function (sub) { buckets.push({ subject: sub, levels: [lv] }); }); });

    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const cand = ALL.filter(function (q) {
        return q.subject === b.subject &&
          b.levels.indexOf(q.level) >= 0 &&
          !usedIds[q.id] &&
          !WRONG.has(q.id);
      });
      if (cand.length) return cand[Math.floor(Math.random() * cand.length)];
    }
    // 兜底：只排除本轮已用
    const rest = ALL.filter(function (q) { return !usedIds[q.id]; });
    if (rest.length) return rest[Math.floor(Math.random() * rest.length)];
    return ALL[Math.floor(Math.random() * ALL.length)];
  };
})();
