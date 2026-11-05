// 语音（挑衅台词/题目朗读）+ 音效 + 轻量背景音乐
(function () {
  // 中文男声在不同系统里名字不一样：Windows 自带康康，Edge/Chrome 的在线神经音色有云希/云野/云扬/云健/云皓。
  // 必须按完整单词匹配，否则 "Simplified" 里的 li、"female" 里的 male 会造成误判。
  // 挑不到男声时退而求其次，用更低的 pitch 把女声压浑厚。
  const MALE = /\b(kangkang|yunxi|yunjian|yunyang|yunye|yunfeng|yunhao|bingbing|male|男|dad|boy)\b/i;
  const FEMALE = /\b(xiaoxiao|xiaoyi|xiaohan|xiaomeng|xiaoshuang|xiaoxuan|xiaoqiu|xiaobei|xiaorui|xiaoni|yaoyao|huihui|tingting|hehui|hanhan|nanjiang|susan|sarah|sabina|grace|mary|jiajia|hioyue|luna|meijia|wanling|kongkong|female|女|girl)\b/i;
  const GOOD = /natural|neural|online|premium|enhanced|plus/i;
  // 安卓/鸿蒙的普通话经常报成 cmn-Hans-CN、yue-Hant-HK，只认 lang 开头是不是 zh 会把这些漏掉，
  // 于是平板明明装了中文语音包，游戏却提示「本机没有中文音色」。
  const ZH_LANG = /^(zh|zho|cmn|yue|hak|hakka|nan|mas)([-_]|$)/i;
  const ZH_NAME = /中文|普通话|粤语|国语|Chinese|Mandarin|Putonghua|Cantonese/i;

  function isZhVoice(v) {
    return !!v && (ZH_LANG.test(v.lang || "") || ZH_NAME.test(v.name || ""));
  }

  const VKEY = "dinorpg.voice.v1";

  const Audio = {
    voiceOn: true,
    sfxOn: true,
    musicOn: false,
    _ctx: null,
    _list: null,
    _voiceIdx: 0,
    _goodIdx: 0,
    _watch: null,
    _waitTimer: null,
    _isMale: false,
    _isFem: false,
    fail: null,
    // 用户可在「⚙ 设置」里改：voiceURI=null 表示自动挑，"" 表示用系统默认音色
    cfg: { voiceURI: null, pitch: null, rate: 0.94 },
    // 最近一次发声的诊断，供设置面板显示
    diag: { text: "", events: [], ms: 0, voice: "" },

    loadCfg: function () {
      try {
        const raw = localStorage.getItem(VKEY);
        if (!raw) return;
        const c = JSON.parse(raw);
        if (c && typeof c === "object") {
          if ("voiceURI" in c) this.cfg.voiceURI = c.voiceURI;
          if (typeof c.pitch === "number") this.cfg.pitch = c.pitch;
          if (typeof c.rate === "number") this.cfg.rate = c.rate;
          if (typeof c.on === "boolean") this.voiceOn = c.on;
        }
      } catch (e) { /* 存档坏了就用默认值 */ }
    },

    saveCfg: function () {
      try {
        localStorage.setItem(VKEY, JSON.stringify({
          voiceURI: this.cfg.voiceURI, pitch: this.cfg.pitch, rate: this.cfg.rate, on: this.voiceOn
        }));
      } catch (e) { /* 无痕模式存不下 */ }
    },

    ctx: function () {
      if (!this._ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this._ctx = new AC();
      }
      if (this._ctx.state === "suspended") this._ctx.resume();
      return this._ctx;
    },

    // 音色表是异步加载的，voiceschanged 之后要把缓存清掉重挑
    watchVoices: function () {
      if (!("speechSynthesis" in window)) return;
      const self = this;
      window.speechSynthesis.getVoices();
      if ("onvoiceschanged" in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = function () { self._list = null; self._voiceIdx = 0; self.pickVoice(); };
      }
    },

    // 全部音色（设置面板列出来给用户挑）
    allVoices: function () {
      if (!("speechSynthesis" in window)) return [];
      return (window.speechSynthesis.getVoices() || []).slice();
    },

    // 判定是不是中文音色，设置面板排序也用同一个口径
    zhVoice: isZhVoice,

    // 候选音色按分数从高到低排；看门狗失败时依次往后换
    voiceList: function () {
      // 空表不写缓存：平板的音色表是引擎绑上来之后才补全的，缓存住空数组就再也扫不到了
      if (this._list && this._list.length) return this._list;
      const vs = this.allVoices().filter(isZhVoice);
      this._list = vs.sort(function (a, b) { return Audio.voiceScore(b) - Audio.voiceScore(a); });
      return this._list;
    },

    // 等中文音色出现（最多 ms 毫秒），好了再回调：安卓的 getVoices() 首帧基本是空的
    waitZh: function (ms, done) {
      const self = this;
      if (this._waitTimer) { clearInterval(this._waitTimer); this._waitTimer = null; }
      if (!("speechSynthesis" in window)) { done(false); return; }
      if (this.voiceList().length) { done(true); return; }
      const t0 = Date.now();
      this._waitTimer = setInterval(function () {
        self._list = null;
        if (self.voiceList().length) {
          clearInterval(self._waitTimer); self._waitTimer = null;
          self._voiceIdx = 0;
          done(true);
        } else if (Date.now() - t0 > (ms || 2500)) {
          clearInterval(self._waitTimer); self._waitTimer = null;
          done(false);
        }
      }, 240);
    },

    // 装中文语音包的入口每台设备都不一样，按 UA 说人话
    zhHint: function () {
      const ua = navigator.userAgent || "";
      // 文件管理器/微信的内置预览经常不给网页接系统 TTS，这条对所有设备都成立
      const via = " 另外：要是你是在文件管理器、微信或浏览器「预览」里打开这个网页，多半根本接不到系统语音，请用 Chrome、Edge 或 Safari 直接打开文件。";
      if (/Android/i.test(ua)) {
        return "安卓：设置 → 系统管理（或「更多设置」「语言和输入法」）→ 文字转语音(TTS) → 「首选引擎」选一个支持中文的引擎，再到「已安装的语言/语音数据」里下载 中文(中国)。机器上若一个 TTS 引擎都没有，先装 Google 文字转语音、讯飞或厂商自带的语音引擎。" + via;
      }
      if (/iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
        return "iPad/iPhone：设置 → 辅助功能 → 朗读内容 → 语音 → 中文(中国大陆)，下载 Tingting 之类的女声/男声；下载完回到这里点「🔄 重新扫描音色」。" + via;
      }
      if (/Windows/i.test(ua)) {
        return "Windows：设置 → 时间和语言 → 语音 → 添加「中文(中国)」并勾选「语音合成」，添加完回到这里点「🔄 重新扫描音色」。" + via;
      }
      return "在这台设备的系统设置里搜索「文字转语音」或「TTS」，把「中文(中国)」的语音包装上；装完回到游戏点「🔄 重新扫描音色」。" + via;
    },

    // 记下这个音色是男是女，pitch 兜底要用：分不清时别压太狠，安卓会糊成一团
    markGender: function (v) {
      const n = v ? (v.name + " " + (v.uri || "")) : "";
      this._isMale = !!v && MALE.test(n) && !FEMALE.test(n);
      this._isFem = !!v && FEMALE.test(n);
      return v;
    },

    // 浑厚：男声 0.88，明确的女声压到 0.62，听不出性别的音色（平板常见）只压到 0.8
    defaultPitch: function () {
      if (this.cfg.pitch != null) return this.cfg.pitch;
      return this._isMale ? 0.88 : (this._isFem ? 0.62 : 0.8);
    },

    pickVoice: function () {
      if (!("speechSynthesis" in window)) return null;
      const uri = this.cfg.voiceURI;
      if (uri === "") { this.markGender(null); return null; }   // 交给系统默认音色
      if (uri != null) {
        const hit = this.allVoices().filter(function (v) { return v.voiceURI === uri; })[0];
        if (hit) return this.markGender(hit);
      }
      const list = this.voiceList();
      if (!list.length) { this.markGender(null); return null; }
      return this.markGender(list[Math.min(this._voiceIdx || 0, list.length - 1)]);
    },

    voiceScore: function (v) {
      const n = (v.name || "") + " " + (v.uri || "");
      let s = 0;
      if (MALE.test(n)) s += 120;
      if (FEMALE.test(n)) s -= 100;
      if (GOOD.test(n)) s += 34;
      if (/zh([-_])?(CN|Hans)|cmn/i.test(v.lang || "")) s += 20;
      // 在线音色（Natural/Online）断网或被策略拦掉时会「静默失败」，一声不吭，
      // 所以本地音色加分、明确标着 online/natural 的减分，宁可声音糙一点也要能出声。
      if (v.localService) s += 45; else s -= 30;
      if (/online|natural|neural/i.test(n)) s -= 18;
      return s;
    },

    // 说台词：字幕由调用方负责，这里只管发声
    speak: function (text, opt) {
      opt = opt || {};
      if (!this.voiceOn || !("speechSynthesis" in window)) return false;
      const s = window.speechSynthesis;
      const self = this;
      // 每句都从「上次真正读出声音的那个音色」开始，重试链不污染后续台词
      if (!opt._retry) this._voiceIdx = this._goodIdx || 0;
      if (s.paused) s.resume();
      // 队列空着就别 cancel：Chrome 里 cancel 紧接 speak 有概率把这句话说掉
      if (opt.interrupt !== false && (s.speaking || s.pending)) s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      const v = this.pickVoice();
      if (v) u.voice = v;
      // 浑厚：默认整体降调，设置面板里可自己调
      const depth = this.defaultPitch();
      const rel = opt.pitch == null ? 1 : opt.pitch;
      u.rate = Math.max(0.5, Math.min(1.6, opt.rate || this.cfg.rate || 0.94));
      u.pitch = Math.max(0.3, Math.min(1.6, rel * depth));
      u.volume = opt.volume == null ? 1 : opt.volume;
      const t0 = Date.now();
      let started = false, marked = false;
      this.diag = { text: "", events: [], ms: 0, voice: v ? v.name : "系统默认音色" };
      function note(ev) {
        self.diag.events.push(ev);
        self.diag.ms = Date.now() - t0;
      }
      u.onstart = function () { started = true; note("start"); };
      u.onboundary = function () { self._goodIdx = self._voiceIdx || 0; note("boundary"); };
      u.onend = function () { note("end"); };
      u.onerror = function (e) { note("error:" + (e && e.error ? e.error : "?")); };
      clearTimeout(this._watch);
      this._watch = setTimeout(function () {
        if (!started) {
          if (s.speaking || s.pending) return;
          const tried = (self._voiceIdx || 0) + 1;
          if (tried <= 3 && self.voiceList().length >= tried) {
            self._voiceIdx = tried;
            self.speak(text, { _retry: true, pitch: opt.pitch, rate: opt.rate, volume: opt.volume, interrupt: false });
            return;
          }
          self.diag.text = s.getVoices().length
            ? "换了 " + tried + " 个音色都没等到发声事件，多半是系统没装中文语音包。" + self.zhHint()
            : "这台设备一个语音音色都报不出来，等于系统 TTS 引擎没装或没启用。" + self.zhHint();
          if (self.fail) self.fail(self.diag.text);
          return;
        }
        // 有 start 却一直没有 boundary：引擎接了活但吐不出声音（在线音色被拦/语音包残缺）
        const hasWord = self.diag.events.indexOf("boundary") >= 0;
        if (!hasWord && !marked) {
          marked = true;
          self.diag.text = "引擎说「已开始」但一个音节都没读出来，这个音色在你这台机器上是哑的，换一个试试（或选「系统默认」）";
          if (self.fail) self.fail(self.diag.text);
        }
      }, 1800);
      s.speak(u);
      return true;
    },

    stopSpeak: function () {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },

    tone: function (freq, dur, type, gain, when) {
      const c = this.ctx();
      if (!c || !this.sfxOn) return;
      const t0 = c.currentTime + (when || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    },

    sweep: function (f1, f2, dur, type, gain) {
      const c = this.ctx();
      if (!c || !this.sfxOn) return;
      const t0 = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "sawtooth";
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t0 + dur);
      g.gain.setValueAtTime(gain || 0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    },

    // 噪声层：吼声和爪击都要靠它，纯振荡器做不出肉质感的冲击
    noise: function (dur, filterType, f1, f2, gain) {
      const c = this.ctx();
      if (!c || !this.sfxOn) return;
      const t0 = c.currentTime;
      const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const bq = c.createBiquadFilter();
      bq.type = filterType || "lowpass";
      bq.frequency.setValueAtTime(f1, t0);
      bq.frequency.exponentialRampToValueAtTime(Math.max(60, f2), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain || 0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bq).connect(g).connect(c.destination);
      src.start(t0);
    },

    // 恐龙低吼：噪声咆哮 + 两个失谐锯齿 + 颤音，越强的恐龙基频越低
    roar: function (tier) {
      const c = this.ctx();
      if (!c || !this.sfxOn) return;
      const t = Math.max(0, Math.min(9, (tier || 1) - 1));
      const base = 96 - t * 6;
      const dur = 0.8;
      this.noise(dur, "lowpass", 1100, 150, 0.13);
      const t0 = c.currentTime;
      [base, base * 1.5].forEach(function (f, i) {
        const o = c.createOscillator();
        const g = c.createGain();
        const lfo = c.createOscillator();
        const lg = c.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f * 1.25, t0);
        o.frequency.exponentialRampToValueAtTime(f * 0.62, t0 + dur);
        lfo.frequency.setValueAtTime(24 + i * 5, t0);
        lg.gain.setValueAtTime(f * 0.1, t0);
        lfo.connect(lg);
        lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(i ? 0.05 : 0.1, t0 + 0.07);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(c.destination);
        o.start(t0); o.stop(t0 + dur + 0.05);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      });
    },

    sfx: function (name) {
      switch (name) {
        case "step": this.tone(150 + Math.random() * 40, 0.05, "triangle", 0.05); break;
        case "correct":
          this.tone(660, 0.1, "square", 0.1);
          this.tone(880, 0.12, "square", 0.1, 0.09);
          this.tone(1320, 0.16, "square", 0.08, 0.18);
          break;
        case "hit": this.sweep(520, 90, 0.28, "sawtooth", 0.14); break;
        case "wrong":
          this.sweep(300, 60, 0.4, "square", 0.13);
          this.tone(120, 0.3, "square", 0.08, 0.05);
          break;
        case "hurt": this.sweep(200, 40, 0.5, "triangle", 0.16); break;
        case "slash":
          this.noise(0.16, "bandpass", 5200, 900, 0.16);
          this.sweep(1400, 260, 0.14, "sawtooth", 0.07);
          break;
        case "boom":
          this.noise(0.55, "lowpass", 1600, 90, 0.2);
          this.sweep(180, 42, 0.55, "sawtooth", 0.16);
          this.tone(58, 0.5, "sine", 0.14, 0.02);
          break;
        case "vs":
          this.sweep(90, 300, 0.3, "square", 0.1);
          this.tone(140, 0.5, "sawtooth", 0.07, 0.12);
          break;
        case "combo":
          this.tone(880, 0.07, "square", 0.07);
          this.tone(1175, 0.09, "square", 0.07, 0.06);
          break;
        case "victory":
          [523, 659, 784, 1046].forEach(function (f, i) { Audio.tone(f, 0.16, "square", 0.1, i * 0.11); });
          break;
        case "defeat":
          [440, 370, 294, 220].forEach(function (f, i) { Audio.tone(f, 0.22, "triangle", 0.12, i * 0.16); });
          break;
        case "heal":
          [700, 950].forEach(function (f, i) { Audio.tone(f, 0.12, "sine", 0.12, i * 0.08); });
          break;
        case "open": this.tone(500, 0.08, "sine", 0.08); break;
      }
    },

    // 极简循环 BGM（可由 HUD 开关）
    _bgmTimer: null,
    bgm: function (on) {
      const c = this.ctx();
      if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
      if (!on || !c) return;
      const scale = [262, 294, 330, 392, 440, 523];
      let step = 0;
      this._bgmTimer = setInterval(function () {
        if (!Audio.musicOn) return;
        const f = scale[Math.floor(Math.random() * scale.length)];
        Audio.tone(f, 0.3, "sine", 0.035);
        if (step % 4 === 0) Audio.tone(f / 2, 0.5, "triangle", 0.025);
        step++;
      }, 300);
    }
  };

  Audio.loadCfg();
  Audio.watchVoices();
  window.SFX = Audio;
})();
