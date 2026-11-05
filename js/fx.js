// 对决特效：VS 开场对峙、扑击、爪痕爆裂、伤害飘字、屏幕震动、连击与终结横幅
(function () {
  const LS = "dinorpg.fx.v1";
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const $ = function (id) { return document.getElementById(id); };

  function make(cls, parent) {
    const d = document.createElement("div");
    d.className = "fxp " + cls;
    (parent || $("fx")).appendChild(d);
    return d;
  }
  function gone(node, ms) { setTimeout(function () { if (node.parentNode) node.remove(); }, ms); }
  // 敌人立绘所在的容器被 scaleX(-1) 翻转过，容器内的左右位移在屏幕上会反过来
  function mirrored(node) { return !!(node.closest && node.closest(".fx-mirror")); }
  function anim(node, clsA, clsB) {
    node.classList.remove(clsA, clsB);
    void node.offsetWidth;                       // 重启动画
    node.classList.add(clsA);
    setTimeout(function () { node.classList.remove(clsA); }, 950);
  }
  function center(node) {
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  // 立绘加载失败时会被隐藏，尺寸为 0，特效就没法定位
  function visible(node) {
    if (!node) return false;
    const r = node.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  const FX = {
    on: true,

    init: function () {
      // 系统开了「减弱动效」时默认关掉特效，但玩家可以在 HUD 手动打开（开了就真播）
      try {
        const v = localStorage.getItem(LS);
        FX.on = v === null ? !reduce : v === "1";
      } catch (e) { FX.on = !reduce; }
      if (!$("fx")) {
        const d = document.createElement("div");
        d.id = "fx";
        ($("app") || document.body).appendChild(d);
      }
      const btn = $("btnFx");
      if (btn) btn.classList.toggle("on", FX.on);
      return FX;
    },
    save: function () { try { localStorage.setItem(LS, FX.on ? "1" : "0"); } catch (e) { } },
    live: function () { return FX.on; },

    /* 屏幕震动 */
    shake: function (kind) {
      if (!this.live()) return;
      const app = $("app");
      if (!app) return;
      const cls = "fx-shake-" + (kind || "m");
      app.classList.remove("fx-shake-s", "fx-shake-m", "fx-shake-l");
      void app.offsetWidth;                       // 重启动画
      app.classList.add(cls);
      setTimeout(function () { app.classList.remove(cls); }, 560);
    },

    /* 全屏闪光 */
    flash: function (color, ms) {
      if (!this.live()) return;
      const f = make("flash");
      f.style.background = color || "#fff";
      f.style.animationDuration = (ms || 300) + "ms";
      gone(f, (ms || 300) + 60);
    },

    /* 粒子爆裂 + 冲击环 */
    burst: function (x, y, opt) {
      if (!this.live()) return;
      opt = opt || {};
      const n = opt.n || 12;
      const colors = opt.colors || ["#ffe98a", "#ff9d5c", "#ff6b6b", "#7ce39b"];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        const d = (opt.dist || 90) * (0.5 + Math.random() * 0.9);
        const p = make("spark");
        p.style.left = x + "px";
        p.style.top = y + "px";
        p.style.background = colors[i % colors.length];
        p.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
        p.style.setProperty("--dy", Math.round(Math.sin(a) * d) + "px");
        p.style.setProperty("--s", (0.6 + Math.random()).toFixed(2));
        gone(p, 760);
      }
      const ring = make("ring");
      ring.style.left = x + "px";
      ring.style.top = y + "px";
      if (opt.ring) ring.style.setProperty("--rs", opt.ring);
      gone(ring, 640);
    },

    /* 爪痕 */
    claw: function (x, y, dir) {
      if (!this.live()) return;
      for (let i = 0; i < 3; i++) {
        const s = make("claw");
        s.style.left = (x + (i - 1) * 13 * (dir > 0 ? 1 : -1)) + "px";
        s.style.top = (y - 20 + i * 17) + "px";
        s.style.setProperty("--a", (dir > 0 ? -32 : 32) + "deg");
        s.style.animationDelay = i * 55 + "ms";
        gone(s, 560);
      }
    },

    /* 伤害飘字 */
    dmg: function (x, y, text, cls) {
      if (!this.live()) return;
      const d = make("dmg " + (cls || ""));
      d.style.left = x + "px";
      d.style.top = y + "px";
      d.textContent = text;
      gone(d, 1200);
    },

    /* 中央横幅大字 */
    banner: function (text, sub, cls) {
      if (!this.live()) return;
      const b = make("banner " + (cls || ""));
      b.style.left = "50%";
      b.style.top = "42%";
      const h = document.createElement("div");
      h.className = "big";
      h.textContent = text;
      b.appendChild(h);
      if (sub) {
        const s = document.createElement("div");
        s.className = "small";
        s.textContent = sub;
        b.appendChild(s);
      }
      gone(b, 1500);
    },

    /* 连击提示 */
    combo: function (n) {
      if (!this.live() || n < 2) return;
      const b = make("combo");
      b.style.left = "50%";
      b.style.top = "20%";
      b.textContent = "连击 ×" + n;
      gone(b, 900);
    },

    /* 一方扑向另一方：dir 是屏幕方向，+1 向右 */
    lunge: function (node, dir) {
      if (!this.live() || !node) return;
      const d = mirrored(node) ? -dir : dir;
      anim(node, d > 0 ? "fx-lunge-r" : "fx-lunge-l", d > 0 ? "fx-lunge-l" : "fx-lunge-r");
    },

    /* 被打中的抖动 + 白闪：dir 是退开的屏幕方向 */
    recoil: function (node, dir) {
      if (!this.live() || !node) return;
      const d = mirrored(node) ? -dir : dir;
      anim(node, d > 0 ? "fx-hit-r" : "fx-hit-l", d > 0 ? "fx-hit-l" : "fx-hit-r");
    },

    /* 敌人被击败：旋转倒下并淡出 */
    ko: function (node) {
      if (!this.live() || !node) return;
      node.classList.add("fx-ko");
    },

    /* 清掉上一次战斗留下的动作类，避免立绘保持倒下/受击状态 */
    reset: function (node) {
      if (!node) return;
      node.classList.remove("fx-ko", "fx-lunge-r", "fx-lunge-l", "fx-hit-r", "fx-hit-l");
    },

    /* 低血量暗角（常驻开关） */
    lowhp: function (on) {
      const layer = $("fx");
      if (!layer) return;
      let v = $("fxvig");
      if (on && this.live()) {
        if (!v) {
          v = document.createElement("div");
          v.id = "fxvig";
          layer.appendChild(v);
        }
      } else if (v) v.remove();
    },

    /* 胜利彩带 */
    confetti: function () {
      if (!this.live()) return;
      const colors = ["#ffe98a", "#7ce39b", "#a6e0ff", "#ff9d5c", "#ffd6e8", "#c9b6ff"];
      for (let i = 0; i < 26; i++) {
        const c = make("conf");
        c.style.left = (Math.random() * 100) + "vw";
        c.style.top = "-24px";
        c.style.background = colors[i % colors.length];
        c.style.setProperty("--fall", (60 + Math.random() * 40) + "vh");
        c.style.setProperty("--spin", (Math.round(Math.random() * 720) - 360) + "deg");
        c.style.setProperty("--drift", (Math.round(Math.random() * 160) - 80) + "px");
        c.style.animationDelay = (Math.random() * 500) + "ms";
        gone(c, 2600);
      }
    },

    /* 在某个元素中心爆裂 */
    burstAt: function (node, opt) {
      if (!this.live() || !visible(node)) return;
      const c = center(node);
      this.burst(c.x, c.y, opt);
    },

    /* 一击命中：爪痕 + 爆裂 + 飘字 + 受击抖动 */
    strike: function (target, amount, dir, opt) {
      if (!this.live() || !visible(target)) return;
      opt = opt || {};
      const c = center(target);
      const big = opt.big;
      setTimeout(function () {
        FX.claw(c.x, c.y, dir);
        FX.burst(c.x, c.y, { n: big ? 22 : 13, dist: big ? 150 : 95, colors: opt.colors });
        FX.dmg(c.x, c.y - c.h * 0.25, "-" + amount, dir > 0 ? "foe" : "me");
        FX.recoil(target, dir);
        FX.shake(big ? "l" : "s");
      }, 170);
    },

    /* VS 开场对峙：双方从两侧冲进画面，中间撞出冲击波。heroLeft = 主角立绘本身朝左，要镜像 */
    intro: function (heroSrc, foe, heroLeft) {
      if (!this.live()) return Promise.resolve();
      const self = this;
      return new Promise(function (resolve) {
        const ov = document.createElement("div");
        ov.className = "fx-vs";
        const stage = document.createElement("div");
        stage.className = "vstage";

        function side(cls, src, name) {
          const w = document.createElement("div");
          w.className = "duel " + cls;
          const img = document.createElement("img");
          img.src = src;
          img.alt = name;
          img.onerror = function () { img.style.visibility = "hidden"; };
          const lb = document.createElement("div");
          lb.className = "lbl";
          lb.textContent = name;
          w.appendChild(img);
          w.appendChild(lb);
          return w;
        }

        stage.appendChild(side("hero" + (heroLeft ? " fx-mirror" : ""), heroSrc, "你"));
        const mark = document.createElement("div");
        mark.className = "vmark";
        mark.textContent = "VS";
        stage.appendChild(mark);
        stage.appendChild(side("foe", foe.img, foe.cn));
        ov.appendChild(stage);
        $("fx").appendChild(ov);

        self.shake("m");
        setTimeout(function () {
          self.flash("rgba(255,255,255,.85)", 240);
          const cx = window.innerWidth / 2, cy = window.innerHeight * 0.42;
          self.burst(cx, cy, { n: 20, dist: 170, ring: 2.4 });
          self.shake("l");
        }, 340);
        setTimeout(function () { if (ov.parentNode) ov.remove(); resolve(); }, 1450);
      });
    }
  };

  FX.init();
  window.FX = FX;
})();
