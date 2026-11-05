// 走路脚步声：纯 WebAudio 合成，无音频文件。game.js 按移动状态调 window.WalkSfx。
(function () {
  const MAX_PEAK = .08, EW = .26, EF = .34, REAL = .55;   // 预算；island 湿/反馈；实测余量
  const R = Math.random, X = Math.max, N = Math.min;
  // 层=[起频,止频,时长,峰值,类型,Q]；bi 前两项是粒数/间隔；类型：噪声层是滤波器，th/sk 是波形；上扫脆、下扫闷。
  const T = {
    plains: {sc:[3000,1500,.12,.09,"bandpass",.9],th:[175,110,.07,.045,"triangle"],bi:[2,.042,2800,1600,.03,.015,"bandpass",1.4]},
    valley: {sc:[900,380,.17,.075,"lowpass",5.5],th:[130,66,.11,.055,"sine"],sk:[640,250,.13,.035,"sine"],ti:.93},
    volcano: {sc:[2100,700,.075,.066,"bandpass",1.6],th:[205,95,.06,.06,"square"],bi:[3,.052,2400,850,.038,.022,"bandpass",2.4],ti:1.07},
    ice: {sc:[2400,4200,.115,.06,"highpass",.7],ck:[1500,5200,.165,.05,"bandpass",.6],th:[120,90,.05,.026,"sine"],bi:[4,.034,1900,5400,.046,.014,"bandpass",.8],ti:1.12},
    wasteland: {sc:[700,250,.1,.07,"lowpass",.7],th:[108,56,.13,.095,"triangle"],ti:.85},
    island: {sc:[1600,640,.09,.05,"bandpass",1.1],th:[152,82,.1,.06,"triangle"],bi:[2,.06,1200,500,.045,.013,"bandpass",2],ec:1}
  };
  let ctx = null, nz = null, out = null, echoIn = null, cur = "plains";
  let playing, want, muted, timer = null, foot = 0, spd = 1;

  // 借 audio.js 的上下文：平板只放行首次手势解锁，自建会永远 suspended
  function ac() {
    if (ctx) return ctx;
    if (window.SFX && window.SFX.ctx) ctx = window.SFX.ctx();
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    // 各层偶尔同相叠加会冲破预算（ice 实测 0.36），软削波把上限钉死
    const ws = ctx.createWaveShaper(), cv = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; cv[i] = Math.tanh(x / MAX_PEAK) * MAX_PEAK; }
    ws.curve = cv;
    out = ctx.createGain(); out.connect(ws); ws.connect(ctx.destination); setPeak();
    return ctx;
  }

  // 共享噪声缓冲，每步随机起点：省 GC、听不出循环
  function noiseBuf() {
    if (nz) return nz;
    const n = ctx.sampleRate * .8 | 0;
    nz = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = nz.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = R() * 2 - 1;
    return nz;
  }

  function buildEcho() {
    if (echoIn) return;
    echoIn = ctx.createGain();
    const d = ctx.createDelay(1), lp = ctx.createBiquadFilter(), fb = ctx.createGain(), wet = ctx.createGain();
    const tap = ctx.createDelay(1), tg = ctx.createGain();
    d.delayTime.value = .085; lp.type = "lowpass"; lp.frequency.value = 2000;
    fb.gain.value = EF; wet.gain.value = EW; tap.delayTime.value = .21; tg.gain.value = EW * .5;
    // 环路含 DelayNode 才合法；低通让回声变暗
    echoIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
    d.connect(wet); wet.connect(out);
    echoIn.connect(tap); tap.connect(tg); tg.connect(out);
  }

  // 层增益是滤波前峰值，滤波吞掉一多半；REAL 再留余量压进预算
  function setPeak() {
    if (!out) return;
    const r = T[cur] || T.plains;
    let p = r.sc[3] + r.th[3] + (r.ck ? r.ck[3] : 0) + (r.sk ? r.sk[3] : 0);
    if (r.bi) p += r.bi[5] * r.bi[0];
    if (r.ec) p *= 1 + EW / (1 - EF);
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(N(1, MAX_PEAK / X(1e-4, p * REAL)), t, .03);
  }

  // st 按步记账：模块级会被上一步的兜底掐掉下一步正在响的节点
  function layer(st, L, dest, t0, tilt, gs, tone) {
    const bq = tone ? null : ctx.createBiquadFilter();
    const src = bq ? ctx.createBufferSource() : ctx.createOscillator();
    const g = ctx.createGain(), fq = bq ? bq.frequency : src.frequency;
    if (bq) { src.buffer = noiseBuf(); bq.type = L[4]; bq.Q.value = L[5]; src.connect(bq); bq.connect(g); }
    else { src.type = L[4] || "sine"; src.connect(g); }
    fq.setValueAtTime(L[0] * tilt, t0);
    fq.exponentialRampToValueAtTime(X(28, L[1] * tilt), t0 + L[2]);
    g.gain.setValueAtTime(1e-4, t0);   // 指数包络落不到 0，靠 stop 截断
    g.gain.exponentialRampToValueAtTime(X(2e-4, L[3] * gs), t0 + .006);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + L[2]);
    const end = t0 + L[2] + .025;
    g.connect(dest);
    if (bq) src.start(t0, R() * .5); else src.start(t0);
    src.stop(end);
    st.n.push(g); if (bq) st.n.push(bq);
    st.s.push(src);
    if (end > st.e) { st.e = end; st.k = src; }
  }

  // 无 StereoPanner 时用两路增益差
  function pan(st, sig, v, dest) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = v;
      st.n.push(p); sig.connect(p); p.connect(dest); return;
    }
    if (!ctx.createChannelMerger) { sig.connect(dest); return; }
    const m = ctx.createChannelMerger(2), gl = ctx.createGain(), gr = ctx.createGain();
    gl.gain.value = 1 - X(0, v); gr.gain.value = 1 - X(0, -v);
    st.n.push(m, gl, gr);
    sig.connect(gl); gl.connect(m, 0, 0); sig.connect(gr); gr.connect(m, 0, 1); m.connect(dest);
  }

  function step() {
    const c = ac();
    if (!c) return;
    // 挂起时时间轴停住，恢复瞬间会堆出爆音
    if (c.state === "suspended") return;
    if (window.SFX && !window.SFX.sfxOn) return;
    const r = T[cur] || T.plains;
    foot ^= 1;
    const side = foot * 2 - 1;
    // 左右脚音高/声像/力度都拉开，否则像缝纫机
    const tilt = (r.ti || 1) * (1 + .05 * side) * (.97 + R() * .06);
    const t0 = c.currentTime + .004, st = { n: [], s: [], e: 0, k: null }, mix = ctx.createGain();
    mix.gain.value = .85 + R() * .28;
    st.n.push(mix);
    layer(st, r.sc, mix, t0, tilt, 1, 0);
    if (r.ck) layer(st, r.ck, mix, t0 + .012, tilt, 1, 0);
    layer(st, r.th, mix, t0, tilt, 1, 1);
    if (r.sk) layer(st, r.sk, mix, t0 + .02, tilt, 1, 1);
    if (r.bi) {
      const B = r.bi.slice(2), n = r.bi[0], sp = r.bi[1];
      for (let i = 0; i < n; i++) layer(st, B, mix, t0 + .01 + i * sp + R() * sp * .7, tilt, .7 + R() * .6, 0);
    }
    pan(st, mix, side * (.14 + R() * .06), out);
    if (r.ec) { buildEcho(); mix.connect(echoIn); }
    const kill = function () {
      st.n.concat(st.s).forEach(function (x) { try { x.disconnect(); } catch (e) {} });
      st.n.length = st.s.length = 0;
    };
    if (st.k) st.k.onended = kill;
    setTimeout(kill, X(0, st.e - ctx.currentTime) * 1e3 + 260);   // 老浏览器不触发 onended
  }

  function gap() {
    const v = X(.18, N(1.6, spd || 1));
    let g = .45 / v * (1 + R() * .16 - .08);   // 常速≈2.2 步/秒，慢走≈1 步/秒；±8% 抖动
    if (R() < .1) g *= 1.15;
    return X(220, N(1250, g * 1e3));
  }

  function loop() {
    timer = null;
    if (!playing || muted) return;
    step();
    timer = setTimeout(loop, gap());
  }

  window.WalkSfx = {
    // 每帧都可能被调，必须幂等：在响就别重排
    start: function (terrain) {
      if (terrain && T[terrain] && terrain !== cur) { cur = terrain; if (ctx) setPeak(); }
      want = true;
      if (playing || muted || !ac()) return;
      playing = true;
      if (timer) clearTimeout(timer);
      step();
      timer = setTimeout(loop, gap());
    },
    // 当前步收尾，只保证不再有新脚步
    stop: function () { want = false; playing = false; if (timer) { clearTimeout(timer); timer = null; } },
    terrain: function (n) { if (T[n]) { cur = n; if (ctx) setPeak(); } },
    speed: function (v) { if (v > 0) spd = v; },
    // 关音效要彻底静音：连正在响的这步也压掉
    enabled: function (on) {
      muted = !on;
      if (muted) {
        playing = false; if (timer) { clearTimeout(timer); timer = null; }
        if (out) { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, .01); }
      } else { setPeak(); if (want) window.WalkSfx.start(); }   // 接回还在走的步
    },
    on: function () { return !!playing; }
  };
})();
