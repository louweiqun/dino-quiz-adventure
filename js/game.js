// 恐龙答题大冒险 · 主逻辑
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const ENEMIES = window.ENEMIES, REGIONS = window.REGIONS, PASSAGES = window.PASSAGES, TAUNTS = window.TAUNT_LINES;

  const WORLD_W = 5620, WORLD_H = 2600;
  const STEP_DMG = 200;      // 答对/答错的每题伤害
  const HERO_DMG = 50;       // 击败敌人后的血量上限奖励
  const HERB_HEAL = 100;
  const Q_TIME_KEY = "dinorpg.qtime.v1";
  const Q_TIME_DEFAULT = 30;
  // 每题倒计时，可在「⚙ 设置」里改；0 = 不限时
  let Q_TIME = (function () {
    const v = parseInt(localStorage.getItem(Q_TIME_KEY), 10);
    return isNaN(v) || v < 0 ? Q_TIME_DEFAULT : v;
  })();
  const SKEY = "dinorpg.save.v1";
  const VIEW_KEY = "dinorpg.view.v1";     // "3d" 第一人称 / "2d" 俯视原版

  const rand = (function () {   // 稳定伪随机：地图装饰每次一致
    let s = 20261102;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })();

  const state = {
    deadCount: 0, lastFoe: null, cap: 1000, hp: 1000, herbs: [], form: null,
    stats: { right: 0, wrong: 0, skip: 0, startedAt: Date.now() },
    battle: null, running: false, paused: false, won: false, moving: false
  };
  const player = { x: 120, y: 1300, flip: false };
  const keys = {};
  // 单文件版里立绘是 data URI，路径必须在运行时从 DOM 拿，写死 assets/dinos/hero.png 会指向不存在的文件
  const HERO_IMG = $("b-hero").src;
  let herbEls = [];

  /* ---------------- 视角：第一人称 3D（WebGL 不可用就自动退回原来的俯视版） ---------------- */
  let wantFP = true;
  try { wantFP = localStorage.getItem(VIEW_KEY) !== "2d"; } catch (e) { }
  if (wantFP && window.FP && window.THREE) {
    try {
      if (FP.init($("glcanvas"), { foe: $("aFoe"), me: $("aMe") })) {
        document.body.classList.add("fp");
        $("stick").classList.remove("hidden");
        FP.bindStick($("stick"), $("stickKnob"));
      } else FP.on = false;
    } catch (e) { FP.on = false; }
  }

  /* ---------------- 地图几何 ---------------- */
  function posOf(i) {
    const t = Math.floor(i / 5), k = i % 5;
    return { x: 260 + t * 520 + k * 95, y: 1300 + Math.round(430 * Math.sin(k * 1.15 + t * 0.9)) };
  }
  function regionOfTier(tier) {
    let r = REGIONS[0];
    for (let i = 0; i < REGIONS.length; i++) if (REGIONS[i].tier <= tier) r = REGIONS[i];
    return r;
  }
  function regionOfX(x) {
    const tier = Math.max(1, Math.min(10, Math.floor((x - 200) / 520) + 1));
    return regionOfTier(tier);
  }
  function foePos(e) {
    // 第一人称里恐龙在自己地盘里慢走，逻辑位置要跟着它站的那一点走，不然走近了看不见的那只才开战
    const live = FP.on && e.fp && FP.foePos ? FP.foePos(e) : null;
    return live || posOf(e.idx);
  }
  function foeDist(e) {
    const p = foePos(e);
    return Math.hypot(p.x - player.x, p.y - player.y);
  }
  function aliveList() {
    return ENEMIES.filter(function (e) { return !e.dead; });
  }
  function nearestFoe(range) {
    let best = null, bd = range === undefined ? Infinity : range;
    aliveList().forEach(function (e) {
      const d = foeDist(e);
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }
  function markDead(e, instant) {
    e.dead = true;
    if (FP.on) { FP.killFoe(e, instant); return; }
    e.el.classList.add("dead");
    e.el.classList.remove("pulse");
    e.bubble.textContent = "已击败";
    e.hpBar.style.display = "none";
  }

  /* ---------------- 形态：击败谁就变成谁 ---------------- */
  // 50 张恐龙立绘全都画成朝左，只有主角朝右，所以换形态必须跟着翻面，否则会「倒着走」
  function formLeft(idx) { return idx != null; }
  function formSrc(idx) { return idx == null ? HERO_IMG : ENEMIES[idx].img; }
  function formName(idx) { return idx == null ? "小恐龙" : ENEMIES[idx].cn; }

  // 第一人称的化身要「背对」玩家，所以每种形态另配一张背面立绘（侧视立绘绕轴转多少度都还是侧身）
  function formBackSrc(idx) {
    if (idx != null) return ENEMIES[idx].back;
    return window.__IMG ? window.__IMG["hero-back"] : "assets/dinos/hero-back.png";
  }

  function applyForm() {
    const src = formSrc(state.form);
    $("player").firstElementChild.src = src;
    heroImg().src = src;
    $("formFace").src = src;
    $("formName").textContent = formName(state.form);
    // 战斗面板里主角站在左边、要朝右；恐龙立绘原本朝左，整组镜像（FX 认这个容器，扑击方向会自己校正）
    $("b-heroBox").classList.toggle("fx-mirror", formLeft(state.form));
    if (FP.on) FP.setForm(src, state.form == null ? 1 : ENEMIES[state.form].tier, formBackSrc(state.form));
  }

  // 进化：形态当场就换（存档也要立刻带上），动画等 KO 那一下演完再上，别和彩带挤在一起
  function evolve(e) {
    state.form = e.idx;
    applyForm();
    setTimeout(function () {
      if (state.battle) return;      // 已经开打下一场，别把横幅糊到新对手脸上
      FX.flash("rgba(198,255,208,.5)", 460);
      FX.burstAt(meNode(), { n: 22, dist: 165, ring: 3.2 });
      FX.banner("进化！", "你现在是 " + e.cn + " 的样子", "finish");
      SFX.sweep(170, 880, 0.5, "sawtooth", 0.11);
      if (FP.on) FP.shakeIt("m");
    }, 640);
    toast("🧬 进化成 " + e.cn + "（" + e.en + "）！形态一路保留到通关", "good", 5200);
  }

  /* ---------------- 建世界 ---------------- */
  function placeholder(size) {
    const d = document.createElement("div");
    d.textContent = "🦖";
    d.style.cssText = "font-size:" + Math.round(size * 0.65) + "px;text-align:center;line-height:" + size + "px";
    d.title = "立绘未加载";
    return d;
  }

  function buildWorld() {
    if (FP.on) {
      // 3D 版自己造地形、植被和恐龙，DOM 世界一层都不建
      FP.build({
        w: WORLD_W, h: WORLD_H, regions: REGIONS, enemies: ENEMIES,
        posOf: posOf, rand: rand, stepDmg: STEP_DMG
      });
      FP.setPose(player.x, player.y);
      FP.dropHerbs(state.herbs);
      return;
    }
    const w = $("world");
    w.style.width = WORLD_W + "px";
    w.style.height = WORLD_H + "px";
    const frag = document.createDocumentFragment();

    REGIONS.forEach(function (r, ri) {
      const next = REGIONS[ri + 1];
      const span = (next ? next.tier : 11) - r.tier;
      const band = document.createElement("div");
      band.className = "band " + r.theme;
      const left = ri === 0 ? 0 : 130 + (r.tier - 1) * 520;
      const right = next ? 130 + (next.tier - 1) * 520 : WORLD_W;
      band.style.left = left + "px";
      band.style.width = (right - left) + "px";
      frag.appendChild(band);

      const lb = document.createElement("div");
      lb.className = "region-label";
      lb.textContent = r.name;
      lb.style.left = (260 + (r.tier - 1) * 520 + span * 260 - 80) + "px";
      lb.style.top = "170px";
      frag.appendChild(lb);
    });

    for (let x = 30; x < WORLD_W; x += 44) {
      const d = document.createElement("div");
      d.className = "deco tuft";
      d.style.left = (x + rand() * 26) + "px";
      d.style.top = (230 + rand() * (WORLD_H - 330)) + "px";
      d.style.transform = "scale(" + (0.7 + rand() * 0.9) + ")";
      frag.appendChild(d);
    }
    const FLOWER = ["#ffd6e8", "#fff3a6", "#c9b6ff", "#ffb3a6", "#a6e0ff"];
    for (let i = 0; i < 90; i++) {
      const d = document.createElement("div");
      d.className = "deco flower";
      d.style.left = (60 + rand() * (WORLD_W - 120)) + "px";
      d.style.top = (260 + rand() * (WORLD_H - 380)) + "px";
      d.style.background = FLOWER[Math.floor(rand() * FLOWER.length)];
      frag.appendChild(d);
    }
    for (let i = 0; i < 34; i++) {
      const d = document.createElement("div");
      d.className = "deco tree";
      d.style.left = (60 + rand() * (WORLD_W - 120)) + "px";
      d.style.top = (260 + rand() * (WORLD_H - 380)) + "px";
      d.style.transform = "scale(" + (0.8 + rand() * 1.1) + ")";
      frag.appendChild(d);
    }
    for (let i = 0; i < 26; i++) {
      const d = document.createElement("div");
      d.className = "deco rock";
      const s = 14 + rand() * 26;
      d.style.width = s + "px"; d.style.height = (s * 0.7) + "px";
      d.style.left = (60 + rand() * (WORLD_W - 120)) + "px";
      d.style.top = (260 + rand() * (WORLD_H - 380)) + "px";
      frag.appendChild(d);
    }

    for (let i = 0; i < ENEMIES.length - 1; i++) {
      const a = posOf(i), b = posOf(i + 1);
      for (let f = 0; f < 1; f += 0.09) {
        const s = document.createElement("div");
        s.className = "stone";
        s.style.left = (a.x + (b.x - a.x) * f - 13) + "px";
        s.style.top = (a.y + (b.y - a.y) * f + 8) + "px";
        frag.appendChild(s);
      }
    }

    ENEMIES.forEach(function (_, i) {
      if (i % 5 !== 2) return;
      const h = document.createElement("div");
      h.className = "herb";
      h.dataset.herb = i;
      const p = posOf(i);
      h.style.left = (p.x + 150) + "px";
      h.style.top = (p.y - 250 + rand() * 500) + "px";
      frag.appendChild(h);
    });

    ENEMIES.forEach(function (e, i) {
      const p = posOf(i);
      const size = 130 + e.tier * 13;
      const el = document.createElement("div");
      el.className = "enemy pulse";
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      el.style.width = size + "px";
      el.style.height = size + "px";
      const img = document.createElement("img");
      img.alt = e.cn;
      img.onerror = function () { img.replaceWith(placeholder(size)); };
      img.src = e.img;
      el.appendChild(img);
      const bub = document.createElement("div");
      bub.className = "bubble";
      bub.textContent = "强度 " + e.tier + " · " + e.hp + " 血 · 答对 " + Math.ceil(e.hp / STEP_DMG) + " 题";
      el.appendChild(bub);
      const nm = document.createElement("div");
      nm.className = "name";
      nm.textContent = e.cn;
      el.appendChild(nm);
      const bar = document.createElement("div");
      bar.className = "hpmini";
      bar.innerHTML = '<i style="width:100%;background:' + (e.tier <= 3 ? "#7bd88f" : e.tier <= 6 ? "#ffd166" : "#ff6b6b") + '"></i>';
      el.appendChild(bar);
      frag.appendChild(el);
      e.el = el; e.bubble = bub; e.hpBar = bar;
    });

    w.appendChild(frag);
    herbEls = Array.prototype.slice.call(w.querySelectorAll(".herb"));
  }

  /* ---------------- 渲染 & 相机 ---------------- */
  let vw = 0, vh = 0;
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    if (FP.on) FP.resize();
  }

  function render() {
    if (FP.on) {
      $("region").textContent = FP.regionName || regionOfX(player.x).name;
      updateCompass();
      return;
    }
    const cx = Math.max(0, Math.min(Math.max(0, WORLD_W - vw), player.x - vw / 2));
    const cy = Math.max(0, Math.min(Math.max(0, WORLD_H - vh), player.y - vh / 2));
    $("world").style.transform = "translate(" + (-cx) + "px," + (-cy) + "px)";
    const p = $("player");
    p.style.left = (player.x - cx) + "px";
    p.style.top = (player.y - cy) + "px";
    // player.flip 记的是「想朝左走」，立绘本身朝哪边由形态决定，两者异或才是要不要镜像
    p.classList.toggle("flip", formLeft(state.form) ? !player.flip : player.flip);
    $("shadow").style.left = (player.x - cx) + "px";
    $("shadow").style.top = (player.y - cy + 6) + "px";
    $("region").textContent = regionOfX(player.x).name;
    updateCompass(cx, cy);
  }

  function updateCompass(cx, cy) {
    const arrow = $("arrow");
    const target = nearestFoe();
    if (!target) { $("compass").classList.add("hidden"); arrow.classList.add("hidden"); return; }
    const p = foePos(target);
    const dx = p.x - player.x, dy = p.y - player.y;
    const dist = Math.round(foeDist(target));
    $("compass").classList.remove("hidden");
    $("c-name").textContent = "#" + target.no + " " + target.cn + "（强度 " + target.tier + " · " + target.hp + " 血）";
    $("c-dist").textContent = FP.on ? " · 约 " + (FP.m(dist) || 0).toFixed(1) + " 米" : " · 约 " + dist + " 步";

    if (FP.on) {
      // 目标不在视线里时，屏幕上方出现一枚指针告诉你往哪转
      const b = FP.bearing(p.x, p.y);
      if (Math.abs(b) > 0.5) {
        const r = Math.min(vw, vh) * 0.3;
        arrow.classList.remove("hidden");
        arrow.style.left = (vw / 2 + Math.sin(b) * r) + "px";
        arrow.style.top = (vh * 0.3 - (Math.cos(b) - 1) * r * 0.25) + "px";
        arrow.style.transform = "translate(-50%,-50%) rotate(" + (b * 180 / Math.PI - 90) + "deg)";
      } else arrow.classList.add("hidden");
      return;
    }
    if (dist > 240) {
      const ang = Math.atan2(dy, dx);
      arrow.classList.remove("hidden");
      const r = Math.min(vw, vh) * 0.3;
      arrow.style.left = (player.x - cx + Math.cos(ang) * r) + "px";
      arrow.style.top = (player.y - cy + Math.sin(ang) * r) + "px";
      arrow.style.transform = "translate(-50%,-50%) rotate(" + (ang * 180 / Math.PI) + "deg)";
    } else arrow.classList.add("hidden");
  }

  /* ---------------- 行动循环 ---------------- */
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (state.running && !state.battle && !state.paused) step(dt);
    else {
      state.moving = false;
      walkTick(false);
      // step() 不跑了就没人收「走路」这个类，不开口战斗/暂停时主角会一直原地颠簸
      if (!FP.on) $("player").classList.remove("walking");
    }
    if (FP.on) { FP.setPose(player.x, player.y); FP.frame(dt, state.moving); }
    render();
    requestAnimationFrame(loop);
  }

  /* ---------------- 脚步声（js/walk-sfx.js 现场合成，这里只管开关、地形、步频） ---------------- */
  let walkOn = false, walkDead = false;
  function walkTick(moving, speed01, theme) {
    const W = window.WalkSfx;
    // 老 WebView 缺 Math.tanh 会在建总线时抛错，这里炸一次就永久别过脚步声，别拖垮主循环
    if (!W || walkDead) return;
    try {
      if (!moving) {
        if (walkOn) { W.stop(); walkOn = false; }
        return;
      }
      W.speed(speed01);
      if (walkOn) W.terrain(theme);
      else { W.start(theme); walkOn = true; }
    } catch (e) {
      walkDead = true;
      try { W.stop(); } catch (e2) { }
    }
  }

  // 走一步：第一人称算的是「相对镜头」的方向，俯视版还是屏幕四向
  function step(dt) {
    let nx = 0, ny = 0, sp = 320;
    if (FP.on) {
      const turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (turn) FP.turnBy(turn * FP.turnSpeed() * dt);
      const st = FP.stickVec();
      const mf = (keys.up ? 1 : 0) - (keys.down ? 1 : 0) - st.y;
      const ms = (keys.strafeR ? 1 : 0) - (keys.strafeL ? 1 : 0) + st.x;
      const f = FP.forward(), r = FP.right();
      const vx = f.x * mf + r.x * ms, vy = f.y * mf + r.y * ms;
      const len = Math.hypot(vx, vy);
      if (len > 0.02) {
        const mag = Math.min(1, len);
        nx = vx / len * mag; ny = vy / len * mag;
        sp = FP.speed();
      }
    } else {
      let dx = 0, dy = 0;
      if (keys.left) dx -= 1;
      if (keys.right) dx += 1;
      if (keys.up) dy -= 1;
      if (keys.down) dy += 1;
      const len = Math.hypot(dx, dy);
      if (len) { nx = dx / len; ny = dy / len; }
    }
    state.moving = !!(nx || ny);
    if (state.moving) {
      player.x = Math.max(60, Math.min(WORLD_W - 60, player.x + nx * sp * dt));
      player.y = Math.max(220, Math.min(WORLD_H - 60, player.y + ny * sp * dt));
      if (!FP.on) {
        if (nx) player.flip = nx < 0;
        $("player").classList.add("walking");
      }
    } else if (!FP.on) $("player").classList.remove("walking");

    // 步频跟着实际走速走：摇杆推一半，脚步也慢一半
    const wbase = FP.on ? FP.speed() : 320;
    walkTick(state.moving, Math.min(1, Math.hypot(nx, ny) * sp / wbase), regionOfX(player.x).theme);

    if (FP.on) {
      const got = FP.takeHerb(player.x, player.y, 46);
      if (got !== null) {
        state.herbs.push(got);
        state.hp = Math.min(state.cap, state.hp + HERB_HEAL);
        SFX.sfx("heal");
        toast("🌿 发现回血草药，血量 +" + HERB_HEAL, "good");
        updateHud(); save();
      }
    } else {
      for (let i = herbEls.length - 1; i >= 0; i--) {
        const h = herbEls[i];
        const hx = parseFloat(h.style.left), hy = parseFloat(h.style.top);
        if (Math.hypot(hx - player.x, hy - player.y) < 46) {
          herbEls.splice(i, 1);
          state.herbs.push(h.dataset.herb);
          state.hp = Math.min(state.cap, state.hp + HERB_HEAL);
          h.remove();
          SFX.sfx("heal");
          toast("🌿 发现回血草药，血量 +" + HERB_HEAL, "good");
          updateHud(); save();
        }
      }
    }

    const foe = nearestFoe(FP.on ? 80 : 74);
    if (foe) startBattle(foe);
    else if (!aliveList().length && !state.won) winGame();
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    const pct = Math.max(0, state.hp) / state.cap * 100;
    $("hpbar").firstElementChild.style.width = pct + "%";
    $("hpbar").classList.toggle("low", pct <= 30);
    $("hptext").textContent = Math.max(0, Math.round(state.hp)) + " / " + state.cap;
    $("stage").textContent = state.deadCount + " / " + ENEMIES.length;
    $("cap").textContent = state.cap;
    $("statRight").textContent = state.stats.right;
    $("statWrong").textContent = state.stats.wrong;
    $("wCount").textContent = window.WRONGBOOK.count();
  }

  /* ---------------- 字幕 + 语音 ---------------- */
  let subTimer = null;
  function enemyPitch() {
    const t = state.battle ? state.battle.enemy.tier : 1;
    // SFX.speak 还会再乘一遍整体降调，这里给的是相对音高：越强的恐龙吼得越沉
    return Math.max(0.62, 1.02 - t * 0.045);
  }
  function subtitle(who, text, cls, speak) {
    $("subtitle").classList.remove("hidden");
    $("sub-who").textContent = who;
    const el = $("sub-txt");
    el.className = "txt" + (cls ? " " + cls : "");
    el.textContent = "";
    clearInterval(subTimer);
    let i = 0;
    subTimer = setInterval(function () {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(subTimer);
    }, 26);
    if (speak !== false) SFX.speak(text, { pitch: enemyPitch() });
  }
  function hideSubtitle() { clearInterval(subTimer); $("subtitle").classList.add("hidden"); }

  function toast(msg, cls, ms) {
    const t = document.createElement("div");
    t.className = "toast" + (cls ? " " + cls : "");
    t.textContent = msg;
    $("toast").appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2600);
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ---------------- 战斗 ---------------- */
  function heroImg() { return $("b-hero"); }
  // 第一人称里立绘不在 DOM 上了，粒子和飘字改打在 fp.js 每帧投影出来的隐形锚点上
  function foeNode() { return FP.on ? $("aFoe") : $("b-img"); }
  function meNode() { return FP.on ? $("aMe") : heroImg(); }
  function heroSrc() {
    const p = $("player").firstElementChild;
    return (p && p.src) || (heroImg() && heroImg().src) || "";
  }

  function startBattle(enemy) {
    state.battle = { enemy: enemy, ehp: enemy.hp, used: {}, round: 0, timer: null, left: Q_TIME, answered: true, q: null, streak: 0 };
    state.lastFoe = enemy;
    if (FP.on) FP.lockFoe(enemy);
    $("battle").classList.remove("hidden");
    const img = $("b-img");
    img.style.display = "";
    img.onerror = function () { img.style.display = "none"; };
    img.src = enemy.img;
    FX.reset(img); FX.reset(heroImg());
    $("b-foe-name").textContent = enemy.cn;
    $("b-name").firstChild.nodeValue = enemy.cn + " ";
    $("b-en").textContent = enemy.en;
    $("b-tags").innerHTML = [
      "第 " + enemy.no + " 只（共 " + ENEMIES.length + " 只）",
      "强度 " + enemy.tier + " 级",
      regionOfTier(enemy.tier).name,
      "血量 " + enemy.hp,
      "需答对 " + Math.ceil(enemy.hp / STEP_DMG) + " 题"
    ].map(function (t) { return '<span class="tag">' + t + "</span>"; }).join("");
    $("b-round").textContent = "它正在放狠话……";
    $("b-timer").textContent = Q_TIME || "∞";
    $("b-timer").classList.remove("danger");
    $("stem").textContent = "「" + enemy.taunt + "」";
    $("opts").innerHTML = "";
    const tip = document.createElement("button");
    tip.className = "opt"; tip.disabled = true;
    tip.textContent = "点击右下角「迎战」开始出题（战斗中可用 1 / 2 / 3 / 4 键作答）";
    $("opts").appendChild(tip);
    hideExplain();
    updateBars();
    const nx = $("b-next");
    nx.classList.remove("hidden");
    nx.textContent = "迎战 →";
    nx.dataset.act = "intro";
    nx.focus();
    // 先演 VS 开场，撞完再让它开口放狠话
    SFX.sfx("vs");
    FX.intro(heroSrc(), enemy, formLeft(state.form)).then(function () {
      if (!state.battle) return;
      subtitle(enemy.cn + " 放狠话", enemy.taunt, "hurt");
      SFX.roar(enemy.tier);
      if (FP.on) FP.roarFoe(enemy);
    });
  }

  function updateBars() {
    const b = state.battle; if (!b) return;
    $("ehpbar").firstElementChild.style.width = Math.max(0, b.ehp / b.enemy.hp * 100) + "%";
    $("b-ehp-text").textContent = Math.max(0, b.ehp) + " / " + b.enemy.hp;
    const p = $("phpe");
    p.firstElementChild.style.width = Math.max(0, state.hp / state.cap * 100) + "%";
    p.classList.toggle("low", state.hp / state.cap <= 0.3);
    $("b-php-text").textContent = Math.max(0, Math.round(state.hp)) + " / " + state.cap;
    FX.lowhp(state.hp / state.cap <= 0.25);
  }

  function askQuestion() {
    const b = state.battle;
    b.round++;
    b.answered = false;
    const q = window.pickQuestion(b.enemy.tier, b.used);
    b.q = q; b.used[q.id] = true;
    const from = " · " + window.qSource(q);
    $("b-round").textContent = "第 " + b.round + " 题 · " + window.qSubject(q) + "（难度 " + q.level + "）" + from;
    $("b-subject").textContent = q.key ? "重点题" : q.subject + "题";

    const P = $("b-passage");
    if (q.passage && PASSAGES[q.passage]) {
      P.classList.remove("hidden");
      P.innerHTML = "<b>" + escapeHtml(PASSAGES[q.passage].title) + "（" + escapeHtml(PASSAGES[q.passage].from) + "）</b>" +
        escapeHtml(PASSAGES[q.passage].text);
      P.scrollTop = 0;
    } else { P.classList.add("hidden"); P.innerHTML = ""; }

    const stemEl = $("stem");
    stemEl.innerHTML = "";
    if (FX.live()) { stemEl.classList.remove("fx-in"); void stemEl.offsetWidth; stemEl.classList.add("fx-in"); }
    stemEl.appendChild(window.renderRich(q.stem, q.figs, q.tables));
    hideExplain();
    const opts = $("opts");
    opts.innerHTML = "";
    q.options.forEach(function (txt, i) {
      const btn = document.createElement("button");
      btn.className = "opt" + (FX.live() ? " fx-in" : "");
      btn.style.animationDelay = (70 + i * 70) + "ms";
      btn.innerHTML = "<kbd>" + "ABCD"[i] + "</kbd>";
      btn.appendChild(window.renderRich(txt, q.figs, q.tables));
      btn.onclick = function () { answer(i); };
      opts.appendChild(btn);
    });
    $("b-next").classList.add("hidden");
    $("b-skip").classList.remove("hidden");
    startTimer();
  }

  function startTimer() {
    const b = state.battle;
    clearInterval(b.timer);
    b.left = Q_TIME;
    if (!Q_TIME) {
      $("b-timer").textContent = "∞";
      $("b-timer").classList.remove("danger");
      return;
    }
    $("b-timer").textContent = b.left;
    $("b-timer").classList.remove("danger");
    b.timer = setInterval(function () {
      b.left--;
      $("b-timer").textContent = Math.max(0, b.left);
      $("b-timer").classList.toggle("danger", b.left <= Math.min(8, Math.ceil(Q_TIME * 0.3)));
      if (b.left <= 0) {
        clearInterval(b.timer);
        toast("⏰ 时间到，换一道题（不扣血）", "bad");
        askQuestion();
      }
    }, 1000);
  }

  function answer(i) {
    const b = state.battle;
    if (!b || b.answered) return;
    b.answered = true;
    clearInterval(b.timer);
    const q = b.q, ok = i === q.answer;
    for (let k = 0; k < $("opts").children.length; k++) {
      const btn = $("opts").children[k];
      btn.disabled = true;
      if (k === q.answer) btn.classList.add("right");
      if (k === i && !ok) btn.classList.add("wrongpick");
    }
    $("b-skip").classList.add("hidden");

    const foeEl = foeNode(), heroEl = meNode(), foe = b.enemy;
    if (ok) {
      state.stats.right++;
      b.streak++;
      b.ehp -= STEP_DMG;
      SFX.sfx("correct");
      FX.lunge(heroEl, 1);
      FX.strike(foeEl, STEP_DMG, 1, { colors: ["#ffe98a", "#ff9d5c", "#7ce39b"] });
      if (FP.on) { FP.punch(1); FP.hitFoe(foe); FP.shakeIt(b.ehp <= 0 ? "l" : "m"); }
      setTimeout(function () { SFX.sfx("slash"); SFX.sfx("hit"); }, 150);
      if (b.ehp <= 0) {
        setTimeout(function () {
          FX.banner("终结一击！", b.enemy.cn + " 被你的知识击倒", "finish");
          FX.flash("rgba(255,240,190,.85)", 420);
          SFX.sfx("boom");
        }, 430);
      } else if (b.streak >= 2) {
        FX.combo(b.streak);
        SFX.sfx("combo");
      }
      showExplain("ok", "回答正确", q, b.enemy.cn + " 被扣 " + STEP_DMG + " 点血量！");
      subtitle(b.enemy.cn, pick(TAUNTS.enemyHurt), "good");
    } else {
      state.stats.wrong++;
      b.streak = 0;
      state.hp -= STEP_DMG;
      window.WRONGBOOK.addWrong(q.id);
      SFX.sfx("wrong");
      FX.lunge(foeEl, -1);
      FX.strike(heroEl, STEP_DMG, -1, { colors: ["#ff6b6b", "#ffb36b", "#ff9d9d"] });
      FX.flash("rgba(255,60,60,.5)", 380);
      if (FP.on) { FP.punch(-1); FP.shakeIt("l"); }
      setTimeout(function () { SFX.sfx("slash"); SFX.sfx("hurt"); }, 150);
      const panel = $("battlePanel");
      panel.classList.add("shake");
      setTimeout(function () { panel.classList.remove("shake"); }, 450);
      showExplain("no", "回答错误", q, "你被扣 " + STEP_DMG + " 点血量，这题已记入错题库。");
      subtitle(b.enemy.cn, pick(TAUNTS.playerHurt), "hurt");
    }
    updateBars(); updateHud(); save();

    const nx = $("b-next");
    nx.classList.remove("hidden");
    if (b.ehp <= 0) { nx.textContent = "🏆 击败它，领取奖励 →"; nx.dataset.act = "win"; }
    else if (state.hp <= 0) { nx.textContent = "😵 我倒下了…… →"; nx.dataset.act = "lose"; }
    else { nx.textContent = "下一题 →"; nx.dataset.act = "next"; }
    nx.focus();
  }

  function showExplain(cls, verdict, q, tail) {
    const e = $("explain");
    e.className = cls;
    e.style.display = "block";
    e.innerHTML = '<span class="verdict">' + verdict + "。</span> 正确答案：" + "ABCD"[q.answer] + ". " +
      escapeHtml(q.options[q.answer]) + "<br>解析：" + escapeHtml(q.explain) + (tail ? "<br>" + escapeHtml(tail) : "");
  }
  function hideExplain() { const e = $("explain"); e.style.display = "none"; e.className = ""; }

  $("b-next").onclick = function () {
    const act = this.dataset.act;
    if (act === "win") { winBattle(); return; }
    if (act === "lose") { loseBattle(); return; }
    this.classList.add("hidden");
    askQuestion();
  };
  $("b-skip").onclick = function () {
    const b = state.battle; if (!b || b.answered) return;
    state.stats.skip++;
    clearInterval(b.timer);
    toast("🤔 换一道题（累计跳过 " + state.stats.skip + " 次）", "bad");
    askQuestion();
  };
  $("b-read").onclick = function () {
    const q = state.battle && state.battle.q;
    if (!q) { toast("还没有题目"); return; }
    const P = q.passage && PASSAGES[q.passage];
    SFX.speak((P ? P.title + "。" + P.text + " " : "") + window.stripImg(q.stem) + "。" + q.options.map(window.stripImg).join("；"));
  };

  /* ---------------- 胜负 ---------------- */
  function winBattle() {
    const b = state.battle, e = b.enemy;
    clearInterval(b.timer);
    state.battle = null;
    state.cap += HERO_DMG;
    state.hp = state.cap;
    state.deadCount++;
    FX.lowhp(false);
    // 敌人倒下、主角补一爪、彩带落下，然后再收掉战斗面板
    const foeEl = foeNode();
    FX.lunge(heroImg(), 1);
    FX.ko($("b-img"));
    if (FP.on) { FP.punch(1); FP.shakeIt("l"); }
    setTimeout(function () {
      FX.burstAt(foeEl, { n: 24, dist: 180, ring: 3.4 });
      FX.shake("l");
      SFX.sfx("victory");
    }, 240);
    setTimeout(function () {
      $("battle").classList.add("hidden");
      FX.reset(foeEl);
      if (FP.on) FP.release();
    }, 980);
    FX.confetti();
    markDead(e);
    evolve(e);
    subtitle(e.cn + "（" + e.en + "）", pick(TAUNTS.win), "hurt");
    toast("🏅 击败 " + e.cn + "！血量上限 +" + HERO_DMG + "，血量已加满", "good");
    updateHud(); save();
    const left = aliveList();
    if (!left.length) { setTimeout(winGame, 1200); return; }
    setTimeout(function () {
      toast("📖 " + e.cn + " 的档案：" + e.fact);
    }, 1500);
    setTimeout(function () {
      if (state.battle) return;   // 已开始下一场，别打扰新台词
      let tough = left[0];
      left.forEach(function (x) { if (x.tier > tough.tier) tough = x; });
      toast("还剩 " + left.length + " 只。最强的还在 " + regionOfTier(tough.tier).name +
        "（强度 " + tough.tier + " · " + tough.hp + " 血），随挑随打");
      hideSubtitle();
    }, 5200);
  }

  function loseBattle() {
    const b = state.battle, e = b.enemy;
    clearInterval(b.timer);
    state.battle = null;
    state.hp = 0;
    state.paused = true;
    FX.lowhp(false);
    FX.lunge($("b-img"), -1);
    FX.flash("rgba(255,40,40,.6)", 520);
    FX.shake("l");
    FX.banner("你被打倒了", e.cn + " 赢下了这一场", "lose");
    if (FP.on) { FP.roarFoe(e); FP.shakeIt("l"); FP.lookDown(); }
    SFX.sfx("defeat");
    hideSubtitle();
    $("dead-line").textContent = e.cn + "（" + e.en + "）笑着说：「" + pick(TAUNTS.lose) +
      "」你的血量归零了。进度不会丢，可以满血重打这一场。";
    $("dead-stats").innerHTML = statsHtml();
    setTimeout(function () {
      $("battle").classList.add("hidden");
      FX.reset($("b-img"));
      if (FP.on) FP.release();
      $("deadview").classList.remove("hidden");
    }, 1000);
    updateHud(); save();
  }

  function statsHtml() {
    const s = state.stats, total = s.right + s.wrong;
    const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
    return [
      [state.deadCount, "已击败敌人"], [s.right, "答对题数"], [s.wrong, "答错题数"],
      [(total ? Math.round(s.right / total * 100) : 0) + "%", "正确率"],
      [s.skip, "跳过题目"], [mins + " 分钟", "游戏时长"],
      [state.cap, "血量上限"], [window.WRONGBOOK.count(), "错题库待复习"]
    ].map(function (r) { return '<div class="stat"><b>' + r[0] + "</b><span>" + r[1] + "</span></div>"; }).join("");
  }

  function winGame() {
    state.won = true;
    state.paused = true;
    $("win-stats").innerHTML = statsHtml();
    $("winview").classList.remove("hidden");
    SFX.sfx("victory");
    FX.banner("全部通关！", "50 只恐龙都被你答倒了", "finish");
    FX.confetti();
    setTimeout(FX.confetti, 700);
    subtitle("五片领地", "50 只恐龙全部被你的答题实力打败，草地恢复了平静！", "good");
    save();
  }

  $("btnRevive").onclick = function () {
    $("deadview").classList.add("hidden");
    state.paused = false;
    state.hp = state.cap;
    updateHud(); save();
    const e = state.lastFoe;
    if (!e || e.dead) return;
    const p = foePos(e);
    player.x = p.x - 150; player.y = p.y + 40;
    render();
    startBattle(e);
  };
  $("btnDeadWrong").onclick = function () { $("deadview").classList.add("hidden"); state.paused = false; openWrong(); };
  $("btnAgain").onclick = function () { $("winview").classList.add("hidden"); resetAll(); };
  $("btnWinWrong").onclick = function () { $("winview").classList.add("hidden"); state.paused = false; openWrong(); };

  /* ---------------- 错题库 ---------------- */
  function openWrong() { renderWrong(); $("wrongview").classList.remove("hidden"); $("w-practice-area").classList.add("hidden"); }
  function renderWrong() {
    const list = window.WRONGBOOK.all();
    const box = $("w-list");
    box.innerHTML = "";
    $("w-total").textContent = list.length;
    if (!list.length) {
      box.innerHTML = '<p style="color:#9fe0ff">错题库现在是空的，继续保持。</p>';
      return;
    }
    list.forEach(function (it) {
      const q = it.q, P = q.passage && PASSAGES[q.passage];
      const d = document.createElement("div");
      d.className = "witem";
      d.innerHTML = '<div class="head"><span class="tag">' + window.qSubject(q) + "</span>" +
        '<span class="tag">难度 ' + q.level + "</span>" +
        '<span class="tag">错 ' + it.wrong + " 次</span>" +
        '<span class="tag">' + escapeHtml(window.qSource(q)) + "</span>" +
        (P ? '<span class="tag">含篇章，练习时会显示</span>' : "") +
        '<span class="grow"></span>' +
        '<button class="btn" data-practice="' + q.id + '">练这一题</button>' +
        '<button class="btn" data-drop="' + q.id + '">已掌握，移除</button></div>' +
        '<div class="stem"></div>' +
        '<div class="opts"></div>' +
        '<div class="exp">解析：' + escapeHtml(q.explain) + "</div>";
      // 题干/选项里可能带插图占位，只能走 DOM 插入，不拼 innerHTML
      d.querySelector(".stem").appendChild(window.renderRich(q.stem, q.figs, q.tables));
      const optBox = d.querySelector(".opts");
      q.options.forEach(function (o, i) {
        const line = document.createElement("div");
        const holder = i === q.answer ? line.appendChild(document.createElement("i")) : line;
        holder.appendChild(document.createTextNode("ABCD"[i] + ". "));
        holder.appendChild(window.renderRich(o, q.figs, q.tables));
        optBox.appendChild(line);
      });
      box.appendChild(d);
    });
  }
  $("w-list").addEventListener("click", function (ev) {
    const t = ev.target;
    if (t.dataset.drop) {
      window.WRONGBOOK.remove(t.dataset.drop);
      renderWrong(); updateHud();
      toast("已从错题库移除", "good");
    } else if (t.dataset.practice) practice(t.dataset.practice);
  });
  function practice(id) {
    const q = window.findQuestion(id);
    if (!q) return;
    const area = $("w-practice-area");
    area.classList.remove("hidden");
    const P = q.passage && PASSAGES[q.passage];
    area.dataset.q = id;
    $("w-q-passage").innerHTML = P ? "<b>" + escapeHtml(P.title) + "</b>" + escapeHtml(P.text) : "";
    $("w-q-passage").classList.toggle("hidden", !P);
    const wStem = $("w-q-stem");
    wStem.innerHTML = "";
    wStem.appendChild(window.renderRich(q.stem, q.figs, q.tables));
    $("w-q-explain").style.display = "none";
    const box = $("w-q-opts");
    box.innerHTML = "";
    q.options.forEach(function (txt, i) {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = "<kbd>" + "ABCD"[i] + "</kbd>";
      b.appendChild(window.renderRich(txt, q.figs, q.tables));
      b.onclick = function () {
        const ok = i === q.answer;
        for (let k = 0; k < box.children.length; k++) {
          box.children[k].disabled = true;
          if (k === q.answer) box.children[k].classList.add("right");
          if (k === i && !ok) box.children[k].classList.add("wrongpick");
        }
        const e = $("w-q-explain");
        e.className = ok ? "ok" : "no";
        e.style.display = "block";
        e.textContent = ok ? "✅ 答对了！这道题已经移出错题库。"
          : "❌ 又答错了，它还会留在错题库里等你。正确答案：" + "ABCD"[q.answer] + "，解析：" + q.explain;
        if (ok) { window.WRONGBOOK.addRight(q.id); SFX.sfx("correct"); }
        else { window.WRONGBOOK.addWrong(q.id); SFX.sfx("wrong"); }
        updateHud(); renderWrong();
      };
      box.appendChild(b);
    });
    area.scrollIntoView({ block: "nearest" });
  }
  $("w-practice").onclick = function () {
    const list = window.WRONGBOOK.all();
    if (!list.length) { toast("错题库现在是空的"); return; }
    practice(list[Math.floor(Math.random() * list.length)].id);
  };
  $("w-close").onclick = function () { $("wrongview").classList.add("hidden"); };
  $("w-clear").onclick = function () {
    if (!confirm("确定清空错题库？")) return;
    window.WRONGBOOK.clear(); renderWrong(); updateHud(); toast("错题库已清空");
  };

  /* ---------------- 存档 ---------------- */
  function save() {
    try {
      localStorage.setItem(SKEY, JSON.stringify({
        dead: ENEMIES.filter(function (e) { return e.dead; }).map(function (e) { return e.no; }),
        cap: state.cap, hp: state.hp,
        herbs: state.herbs, stats: state.stats, player: { x: player.x, y: player.y },
        form: state.form
      }));
    } catch (e) { }
  }
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; }
  }
  function deadNos(s) {
    if (s.dead) return s.dead;
    const n = Math.min(ENEMIES.length, s.progress || 0);   // 兼容旧的按顺序存档
    var arr = [];
    for (let i = 0; i < n; i++) arr.push(i + 1);
    return arr;
  }
  function applySave(s) {
    const nos = deadNos(s);
    state.deadCount = nos.length;
    state.cap = s.cap || 1000;
    state.hp = Math.min(state.cap, s.hp || state.cap);
    state.herbs = s.herbs || [];
    state.stats = Object.assign({ right: 0, wrong: 0, skip: 0, startedAt: Date.now() }, s.stats || {});
    if (s.player) { player.x = s.player.x; player.y = s.player.y; }
    state.form = (typeof s.form === "number" && s.form >= 0 && s.form < ENEMIES.length) ? s.form : null;
    applyForm();
    ENEMIES.forEach(function (e) {
      if (nos.indexOf(e.no) >= 0) markDead(e, true);
    });
    herbEls = herbEls.filter(function (h) {
      if (state.herbs.indexOf(h.dataset.herb) >= 0) { h.remove(); return false; }
      return true;
    });
    if (FP.on) FP.dropHerbs(state.herbs);   // 3D 的草药是在建世界时铺的，读档后再摘掉已采过的
  }
  function resetAll() {
    try { localStorage.removeItem(SKEY); } catch (e) { }
    location.reload();
  }
  $("btnReset").onclick = function () {
    if (!confirm("重新开始会清空进度和错题库，确定吗？")) return;
    window.WRONGBOOK.clear();
    resetAll();
  };

  /* ---------------- 输入 ---------------- */
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", a: "left", s: "down", d: "right", W: "up", A: "left", S: "down", D: "right",
    q: "strafeL", e: "strafeR", Q: "strafeL", E: "strafeR"   // 第一人称里 Q/E 才是横移，←/→ 改成转身
  };
  window.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      if (!$("setview").classList.contains("hidden")) { closeSettings(); return; }
      if (!$("wrongview").classList.contains("hidden")) { $("wrongview").classList.add("hidden"); return; }
      if (!$("startview").classList.contains("hidden") && state.running) { $("startview").classList.add("hidden"); state.paused = false; return; }
    }
    if (state.battle) {
      if (["1", "2", "3", "4"].indexOf(ev.key) >= 0) {
        if (!$("b-next").classList.contains("hidden") && $("b-next").dataset.act !== "next" && $("b-next").dataset.act !== "intro") { /* 结算按钮交给 Enter */ }
        answer(parseInt(ev.key, 10) - 1);
        ev.preventDefault(); return;
      }
      if (ev.key === "Enter" || ev.key === " ") { $("b-next").click(); ev.preventDefault(); return; }
      if (ev.key === "z" || ev.key === "Z") { $("b-read").click(); return; }
    }
    if (state.running && !state.battle && !state.paused) {
      const k = KEYMAP[ev.key];
      if (k) { keys[k] = true; ev.preventDefault(); }
    }
  });
  window.addEventListener("keyup", function (ev) { const k = KEYMAP[ev.key]; if (k) keys[k] = false; });
  window.addEventListener("blur", function () { keys.up = keys.down = keys.left = keys.right = false; });

  document.querySelectorAll("#dpad button[data-dir]").forEach(function (b) {
    const set = function (v) { return function (ev) { ev.preventDefault(); keys[b.dataset.dir] = v; }; };
    b.addEventListener("pointerdown", set(true));
    b.addEventListener("pointerup", set(false));
    b.addEventListener("pointercancel", set(false));
    b.addEventListener("pointerleave", set(false));
  });

  /* ---------------- 开关 ---------------- */
  function bindToggle(id, key, after) {
    $(id).onclick = function () {
      SFX[key] = !SFX[key];
      $(id).classList.toggle("on", SFX[key]);
      if (after) after(SFX[key]);
    };
  }
  bindToggle("btnVoice", "voiceOn", function (on) {
    SFX.saveCfg();
    if (!on) { SFX.stopSpeak(); toast("台词语音已关闭"); return; }
    if (!("speechSynthesis" in window)) { toast("这台设备的浏览器没有语音接口，台词只显示字幕", "bad"); return; }
    SFX.waitZh(2600, function (ok) {
      const v = SFX.pickVoice();
      if (v) toast("台词语音已开启 · 音色 " + v.name, "good");
      else if (SFX.cfg.voiceURI === "") toast("台词语音已开启 · 按你选的「系统默认音色」朗读", "good");
      else toast("台词语音已开启 · 这台设备没报出中文音色，先让系统默认引擎试读。" + SFX.zhHint(), "bad");
      SFX.speak("语音已开启，我是你的旁白。");
    });
  });
  bindToggle("btnSfx", "sfxOn", function (on) {
    if (window.WalkSfx && !walkDead) { try { WalkSfx.enabled(on); } catch (e) { walkDead = true; } }
    toast("音效" + (on ? "开启" : "关闭"));
  });
  bindToggle("btnMusic", "musicOn", function (on) { SFX.bgm(on); });
  // 诊断信息里带着按设备的安装指引，字数多，按长度给停留时间
  SFX.fail = function (msg) { toast(msg, "bad", Math.min(20000, 6000 + String(msg).length * 90)); };
  $("btnVoice").classList.toggle("on", SFX.voiceOn);
  $("btnFx").onclick = function () {
    FX.on = !FX.on;
    FX.save();
    $("btnFx").classList.toggle("on", FX.on);
    if (!FX.on) FX.lowhp(false);
    toast("对决特效" + (FX.on ? "开启" : "关闭"));
  };
  $("btnFx").classList.toggle("on", FX.on);
  $("btnView").classList.toggle("on", FP.on);
  $("btnView").onclick = function () {
    if (state.battle) { toast("打完这一场再换视角"); return; }
    if (FP.on) {
      try { localStorage.setItem(VIEW_KEY, "2d"); } catch (e) { }
      location.reload();
      return;
    }
    if (!window.FP || !window.THREE) { toast("这份文件里没有 3D 模块", "bad"); return; }
    if (wantFP) { toast("这台设备的浏览器起不了 WebGL，只能用俯视版", "bad"); return; }
    try { localStorage.setItem(VIEW_KEY, "3d"); } catch (e) { }
    location.reload();
  };
  $("btnWrong").onclick = openWrong;

  /* ---------------- 出题科目配置 ---------------- */
  function subjectState() {
    const counts = window.subjectCounts();
    const on = window.getSubjects();
    const list = Object.keys(counts).map(function (s) {
      return { name: s, on: on.indexOf(s) >= 0, own: counts[s].own, fill: counts[s].fill, zk: counts[s].zk, key: counts[s].key || 0, total: counts[s].total };
    }).sort(function (a, b) { return b.total - a.total; });
    return { list: list, on: on, counts: counts };
  }

  function applySubjects() {
    const st = subjectState();
    const chosen = st.list.filter(function (x) { return x.on; });
    $("subjCount").textContent = chosen.length;
    const pool = chosen.reduce(function (n, x) { return n + x.total; }, 0);
    $("subj-summary").textContent = "已选 " + chosen.length + " / " + st.list.length + " 个科目，共 " + pool + " 道题可出" +
      "（浙江真题为主，真题不足 " + window.MIN_ZK + " 道的科目用补位题兜底）。" +
      (chosen.length === 0 ? " 一门都没选时会临时使用全部科目。" : "");
    const mini = $("start-subjects");
    if (mini) {
      mini.innerHTML = "";
      (chosen.length ? chosen : st.list).forEach(function (x) {
        const b = document.createElement("b");
        b.textContent = x.name + " " + x.total;
        mini.appendChild(b);
      });
    }
  }

  function renderSubjects() {
    const st = subjectState();
    const box = $("subj-list");
    box.innerHTML = "";
    st.list.forEach(function (x) {
      const label = document.createElement("label");
      label.className = "subjchip" + (x.on ? "" : " off");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = x.on;
      cb.onchange = function () {
        const now = Array.prototype.slice.call(box.querySelectorAll("input"))
          .filter(function (i) { return i.checked; })
          .map(function (i) { return i.dataset.sub; });
        window.setSubjects(now.length ? now : []);
        label.classList.toggle("off", !cb.checked);
        applySubjects();
        toast((x.name) + (cb.checked ? " 已加入出题池" : " 已移出出题池"));
      };
      cb.dataset.sub = x.name;
      const span = document.createElement("span");
      span.innerHTML = '<span class="nm">' + escapeHtml(x.name) + "</span>" +
        '<span class="ct">共 ' + x.total + " 题" +
        (x.zk ? " · 浙江真题 " + x.zk : "") +
        (x.key ? " · 错题本重点题 " + x.key : "") +
        (x.own + x.fill ? " · 补位 " + (x.own + x.fill) : "") + "</span>";
      label.appendChild(cb);
      label.appendChild(span);
      box.appendChild(label);
    });
    applySubjects();
  }

  function openSubjects() {
    if (state.battle) { toast("战斗中不能改科目，先打完这一场"); return; }
    state.paused = true;
    SFX.stopSpeak && SFX.stopSpeak();
    renderSubjects();
    $("subjview").classList.remove("hidden");
  }
  function closeSubjects() {
    $("subjview").classList.add("hidden");
    const anyOverlay = ["startview", "wrongview", "deadview", "winview", "setview"].some(function (id) {
      return !$(id).classList.contains("hidden");
    });
    if (!anyOverlay) state.paused = false;
    updateHud();
  }
  $("btnSubjects").onclick = openSubjects;
  $("btnStartSubjects").onclick = openSubjects;
  $("subj-close").onclick = closeSubjects;
  $("subj-all").onclick = function () { window.setSubjects(window.QSUBJECTS.slice()); renderSubjects(); };
  $("subj-none").onclick = function () { window.setSubjects([]); renderSubjects(); toast("一门都没选，临时按全部科目出题"); };
  $("subj-zk").onclick = function () {
    const c = window.subjectCounts();
    const zk = Object.keys(c).filter(function (s) { return c[s].zk > 0; });
    if (!zk.length) { toast("题库里还没有浙江真题"); return; }
    window.setSubjects(zk); renderSubjects();
  };
  /* ---------------- 设置：每题倒计时 + 语音音色 ---------------- */
  const QTIMES = [10, 15, 20, 30, 45, 60, 90, 120, 0];

  function renderSettings() {
    const sel = $("setQTime");
    sel.innerHTML = "";
    QTIMES.forEach(function (t) {
      const o = document.createElement("option");
      o.value = String(t);
      o.textContent = t ? t + " 秒" : "不限时";
      if (t === Q_TIME) o.selected = true;
      sel.appendChild(o);
    });

    const vs = $("setVoice");
    vs.innerHTML = "";
    function opt(val, label) {
      const o = document.createElement("option");
      o.value = val; o.textContent = label;
      vs.appendChild(o);
    }
    opt("auto", "自动 · 优先本地中文男声");
    opt("", "系统默认音色");
    const zh = function (v) { return SFX.zhVoice(v); };
    SFX.allVoices().sort(function (a, b) {
      return (zh(b) ? 1 : 0) - (zh(a) ? 1 : 0) || String(a.name).localeCompare(String(b.name));
    }).forEach(function (v) {
      opt(v.voiceURI, v.name + "（" + v.lang + " · " + (v.localService ? "本地" : "在线") + "）");
    });
    const want = SFX.cfg.voiceURI;
    vs.value = want == null ? "auto" : want;
    if (!vs.value) vs.value = "auto";

    SFX.pickVoice();
    const p = SFX.defaultPitch();
    $("setPitch").value = p;
    $("setPitchV").textContent = Number(p).toFixed(2);
    $("setRate").value = SFX.cfg.rate;
    $("setRateV").textContent = Number(SFX.cfg.rate).toFixed(2);
    $("setVoiceOn").textContent = SFX.voiceOn ? "已开启" : "已关闭";
    $("setVoiceOn").classList.toggle("on", SFX.voiceOn);
    const dev = $("setDevice");
    if (dev) {
      const zh = SFX.voiceList();
      dev.textContent = "这台设备" + (zh.length ? "找到中文音色 " + zh.length + " 个，排在最前的是「" + zh[0].name + "（" + zh[0].lang + "）」"
        : "一个中文音色都没报出来") + "。" + SFX.zhHint();
    }
  }

  function tryVoice() {
    const d = $("setDiag");
    d.className = "setdiag";
    d.textContent = "正在朗读，稍等……";
    SFX.speak("恐龙答题大冒险，用知识打败恐龙。");
    let waited = 0;
    const iv = setInterval(function () {
      waited += 200;
      const ev = SFX.diag.events.join(" → ");
      if (SFX.diag.text) {
        d.className = "setdiag no";
        d.textContent = SFX.diag.text;
        clearInterval(iv);
      } else if (ev.indexOf("boundary") >= 0) {
        d.className = "setdiag ok";
        d.textContent = "发声正常 · " + SFX.diag.voice + " · 事件 " + ev + " · " + SFX.diag.ms + "ms";
        clearInterval(iv);
      } else if (waited >= 3200) {
        d.className = "setdiag no";
        d.textContent = "只收到事件「" + (ev || "无") + "」。听得到音效却没人念课文，基本是这个音色在你机器上是哑的——换一个本地音色，或选「系统默认音色」再试听。";
        clearInterval(iv);
      }
    }, 200);
  }

  function openSettings() {
    state.paused = true;
    SFX.stopSpeak();
    if (state.battle) clearInterval(state.battle.timer);
    renderSettings();
    $("setview").classList.remove("hidden");
  }
  function closeSettings() {
    $("setview").classList.add("hidden");
    if (state.battle && !state.battle.answered) startTimer();
    const anyOverlay = ["startview", "wrongview", "deadview", "winview", "subjview"].some(function (id) {
      return !$(id).classList.contains("hidden");
    });
    if (!anyOverlay) state.paused = false;
  }

  $("btnSet").onclick = openSettings;
  $("set-close").onclick = closeSettings;
  $("setQTime").onchange = function () {
    Q_TIME = parseInt(this.value, 10) || 0;
    try { localStorage.setItem(Q_TIME_KEY, String(Q_TIME)); } catch (e) { /* 存不下也不影响本局 */ }
    if (state.battle) { $("b-timer").textContent = Q_TIME || "∞"; }
    toast("每题倒计时：" + (Q_TIME ? Q_TIME + " 秒" : "不限时"), "good");
  };
  $("setVoice").onchange = function () {
    SFX.cfg.voiceURI = this.value === "auto" ? null : this.value;
    SFX._voiceIdx = 0;
    SFX._goodIdx = 0;
    SFX._watch && clearTimeout(SFX._watch);
    SFX.saveCfg();
    tryVoice();
  };
  $("setPitch").oninput = function () { $("setPitchV").textContent = Number(this.value).toFixed(2); };
  $("setPitch").onchange = function () { SFX.cfg.pitch = Number(this.value); SFX.saveCfg(); tryVoice(); };
  $("setRate").oninput = function () { $("setRateV").textContent = Number(this.value).toFixed(2); };
  $("setRate").onchange = function () { SFX.cfg.rate = Number(this.value); SFX.saveCfg(); tryVoice(); };
  $("setVoiceOn").onclick = function () {
    SFX.voiceOn = !SFX.voiceOn;
    SFX.saveCfg();
    $("btnVoice").classList.toggle("on", SFX.voiceOn);
    renderSettings();
    if (SFX.voiceOn) tryVoice(); else { SFX.stopSpeak(); toast("台词语音已关闭"); }
  };
  $("setTry").onclick = tryVoice;
  $("setRescan").onclick = function () {
    SFX._list = null;
    renderSettings();
    const zh = SFX.voiceList().length;
    if (!zh) {
      toast("扫到 " + SFX.allVoices().length + " 个音色，一个中文的都没有。" + SFX.zhHint(), "bad", 16000);
      return;
    }
    toast("扫到 " + SFX.allVoices().length + " 个音色，其中中文 " + zh + " 个：排在第一个的是「" +
      SFX.voiceList()[0].name + "」", "good", 6000);
  };

  $("btnHelp").onclick = function () {
    if (state.battle) { toast("战斗中不能查看玩法"); return; }
    state.paused = true;
    $("btnStart").textContent = state.running ? "▶ 返回游戏" : "🎮 开始冒险";
    $("btnContinue").classList.toggle("hidden", state.running || !loadSave());
    $("startview").classList.remove("hidden");
  };

  /* ---------------- 启动 ---------------- */
  function begin(saved) {
    if (saved) applySave(saved);
    $("startview").classList.add("hidden");
    state.running = true;
    state.paused = false;
    updateHud(); resize(); render();
    SFX.ctx();
    if (!("speechSynthesis" in window)) {
      toast("本浏览器没有语音接口，台词只显示字幕", "bad");
    } else if (!SFX.voiceOn) {
      toast("台词语音是关闭状态，点右上角「🎙 语音」即可打开");
    } else {
      // 平板的系统 TTS 是异步挂上来的，getVoices() 首帧常常是空表，
      // 一上来就判「没有中文音色」会把装了语音包的设备误伤，所以先等它一会儿。
      SFX.waitZh(3000, function (ok) {
        if (!ok) {
          toast("这台设备还没报出中文音色，台词暂时只有字幕。" + SFX.zhHint() +
            " 装好后点「⚙ 设置」→「🔄 重新扫描音色」，再「▶ 试听」。", "bad", 16000);
        }
        SFX.speak("欢迎来到恐龙答题大冒险。朝着远处的恐龙走过去，去会会它们！");
      });
    }
    toast(FP.on
      ? "左下摇杆走路，手指在画面上拖动就能转头，也可以用 ↑↓ 走路、←→ 转身"
      : "用 ↑ ↓ ← → 或 W A S D 行走，走近恐龙就开始答题");
    if (!aliveList().length) winGame();
  }
  $("btnStart").onclick = function () {
    if (state.running) { $("startview").classList.add("hidden"); state.paused = false; return; }
    state.stats.startedAt = Date.now();
    begin(null);
  };
  const saved = loadSave();
  if (!saved) $("btnContinue").classList.add("hidden");
  $("btnContinue").onclick = function () { begin(saved); };

  resize();
  window.addEventListener("resize", function () { resize(); render(); });
  buildWorld();
  applyForm();
  applySubjects();
  updateHud();
  requestAnimationFrame(loop);
})();
