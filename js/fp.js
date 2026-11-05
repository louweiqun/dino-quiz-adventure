// 第一人称 3D 层：透视相机、程序化地形与天空、恐龙 billboard、摇杆 + 拖拽转头
// 地图坐标仍是 game.js 那套「像素」，这里只做 px → 米 的换算，逻辑不用改第二遍。
(function () {
  const S = 0.06;          // 1 地图像素 = 0.06 米（整张图约 337 × 156 米）
  const EYE = 1.62;        // 眼睛高度
  const FOV = 74;
  const WALK = 88;         // 满摇杆时的像素/秒 ≈ 5.3 米/秒
  const TURN = 2.0;        // 键盘转身弧度/秒
  const LOOK_X = 0.0032;   // 拖拽灵敏度
  const LOOK_Y = 0.0026;
  const PITCH_MIN = -0.5, PITCH_MAX = 0.6;

  // 六片领地的雾色、雾距、天空渐变和地面罩色
  const THEME = {
    plains:    { fog: 0xbfe0c0, near: 14, far: 165, sky: ["#74bcff", "#dff3e2"], tint: 0x69c07f, veg: 1.0 },
    valley:    { fog: 0x9fb4ad, near: 8,  far: 92,  sky: ["#587e86", "#c9ded6"], tint: 0x3f7a63, veg: 1.5 },
    volcano:   { fog: 0xc08a68, near: 10, far: 125, sky: ["#4b2434", "#ff9d5c"], tint: 0x9a5238, veg: 0.6 },
    ice:       { fog: 0xd9ecff, near: 16, far: 190, sky: ["#7fb2d9", "#eef7ff"], tint: 0xbdd6e4, veg: 0.45 },
    wasteland: { fog: 0xbfae8c, near: 11, far: 140, sky: ["#6b5f4a", "#e2cfa4"], tint: 0x8f8060, veg: 0.35 },
    island:    { fog: 0x8f6f7a, near: 9,  far: 120, sky: ["#2b1b32", "#ff8f8f"], tint: 0x5f4652, veg: 0.3 }
  };

  const FP = {
    on: false,
    yaw: -Math.PI / 2,      // 起始朝 +X，也就是地图右边那一片恐龙
    pitch: -0.02,
    stick: { x: 0, y: 0 },  // 摇杆：x 右为正，y 前推（向上）为负
    m: function (px) { return px * S; }
  };

  let renderer, scene, camera, canvas, el = {};
  let vw = 1, vh = 1, time = 0, moving = false;
  let kick = 0, kickDir = 1, shake = 0, bob = 0, smooth = 0, pitchRet = 0;
  let foes = [], herbs = [], clouds = [], lock = null, regionIdx = 0;
  let emblem = null, emblemTier = 1;
  let spec = null, sky = {}, fogCol = null, fogNear = 14, fogFar = 165, T = {};
  let lookId = null, lookX = 0, lookY = 0;
  const V = (x, y, z) => new window.THREE.Vector3(x, y, z);

  /* ---------------- 贴图：全部现场画，不依赖外部图片资源 ---------------- */
  function cv(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  function tex(c, rx, ry) {
    const t = new window.THREE.CanvasTexture(c);
    if (rx) { t.wrapS = t.wrapT = window.THREE.RepeatWrapping; t.repeat.set(rx, ry); }
    t.anisotropy = 4;
    return t;
  }

  // 草地：底噪 + 一撮撮短叶，重复铺满全图
  function grassTex() {
    const c = cv(256, 256), g = c.getContext("2d");
    g.fillStyle = "#5da85f"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      g.strokeStyle = "hsl(" + (92 + Math.random() * 30) + "," + (30 + Math.random() * 28) + "%," + (28 + Math.random() * 26) + "%)";
      g.lineWidth = 1 + Math.random();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() * 4 - 2), y - 3 - Math.random() * 5); g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(255,255,255,.05)";
      g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 30, 12 + Math.random() * 18, Math.random() * 3, 0, 7); g.fill();
    }
    return tex(c, 60, 28);
  }

  // 一丛草叶（透明底，竖着插在地上）
  function tuftTex() {
    const c = cv(64, 64), g = c.getContext("2d");
    for (let i = 0; i < 13; i++) {
      const bx = 8 + Math.random() * 48, h = 18 + Math.random() * 30;
      g.strokeStyle = "hsl(" + (88 + Math.random() * 34) + "," + (40 + Math.random() * 25) + "%," + (30 + Math.random() * 22) + "%)";
      g.lineWidth = 2 + Math.random() * 2;
      g.beginPath();
      g.moveTo(bx, 64);
      g.quadraticCurveTo(bx + (Math.random() * 14 - 7), 64 - h * 0.6, bx + (Math.random() * 20 - 10), 64 - h);
      g.stroke();
    }
    return tex(c);
  }

  // 树蕲：树干 + 三层冠，白垩纪味道
  function treeTex() {
    const c = cv(128, 192), g = c.getContext("2d");
    g.fillStyle = "#6b4b30";
    g.beginPath(); g.moveTo(56, 192); g.lineTo(72, 192); g.lineTo(68, 74); g.lineTo(60, 74); g.closePath(); g.fill();
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * (0.05 + Math.random() * 0.9), r = 34 + Math.random() * 44;
      g.strokeStyle = "hsl(" + (100 + Math.random() * 26) + "," + (38 + Math.random() * 20) + "%," + (24 + Math.random() * 20) + "%)";
      g.lineWidth = 3 + Math.random() * 3;
      g.beginPath(); g.moveTo(64, 80);
      g.quadraticCurveTo(64 + Math.cos(a) * r * 0.6, 80 - 26 - Math.random() * 16, 64 + Math.cos(a) * r, 80 - Math.sin(a) * 20 + 14);
      g.stroke();
    }
    g.fillStyle = "rgba(30,66,38,.55)";
    g.beginPath(); g.ellipse(64, 66, 44, 26, 0, 0, 7); g.fill();
    return tex(c);
  }

  function flowerTex() {
    const c = cv(48, 48), g = c.getContext("2d");
    g.strokeStyle = "#4d7f3f"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(24, 48); g.lineTo(24, 26); g.stroke();
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      g.beginPath(); g.ellipse(24 + Math.cos(a) * 9, 20 + Math.sin(a) * 9, 7, 7, 0, 0, 7); g.fill();
    }
    g.fillStyle = "#ffe07a"; g.beginPath(); g.arc(24, 20, 5, 0, 7); g.fill();
    return tex(c);
  }

  function glowTex() {
    const c = cv(64, 64), g = c.getContext("2d");
    const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(0.4, "rgba(180,255,200,.55)");
    rg.addColorStop(1, "rgba(120,220,160,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    return tex(c);
  }

  function cloudTex() {
    const c = cv(128, 64), g = c.getContext("2d");
    for (let i = 0; i < 9; i++) {
      const rg = g.createRadialGradient(20 + i * 11, 32 + (i % 2 ? 6 : -6), 2, 20 + i * 11, 32, 26);
      rg.addColorStop(0, "rgba(255,255,255,.85)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg; g.beginPath(); g.arc(20 + i * 11, 32, 26, 0, 7); g.fill();
    }
    return tex(c);
  }

  function skyTex(pair) {
    const c = cv(64, 256), g = c.getContext("2d");
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, pair[0]);
    lg.addColorStop(0.52, pair[1]);
    lg.addColorStop(1, pair[0]);
    g.fillStyle = lg; g.fillRect(0, 0, 64, 256);
    const t = tex(c);
    t.mapping = window.THREE.EquirectangularReflectionMapping;
    return t;
  }

  // 恐龙头顶的名牌：名字 + 强度血量 + 小血条，一次画好，死亡时重画
  function labelFor(e, dead) {
    const c = cv(512, 128), g = c.getContext("2d");
    g.fillStyle = "rgba(8,20,12,.74)";
    const r = 16;
    g.beginPath();
    g.moveTo(10 + r, 12); g.lineTo(502 - r, 12); g.quadraticCurveTo(502, 12, 502, 12 + r);
    g.lineTo(502, 96 - r); g.quadraticCurveTo(502, 96, 502 - r, 96);
    g.lineTo(10 + r, 96); g.quadraticCurveTo(10, 96, 10, 96 - r);
    g.lineTo(10, 12 + r); g.quadraticCurveTo(10, 12, 10 + r, 12);
    g.closePath(); g.fill();
    g.strokeStyle = dead ? "rgba(150,150,150,.5)" : "rgba(255,255,255,.34)";
    g.lineWidth = 3; g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = dead ? "#b9c4ba" : "#ffffff";
    g.font = "bold 34px system-ui, 'Microsoft YaHei', sans-serif";
    g.fillText(dead ? "已击败" : "#" + e.no + " " + e.cn, 256, 40);
    if (!dead) {
      g.font = "26px system-ui, 'Microsoft YaHei', sans-serif";
      g.fillStyle = "#ffe98a";
      g.fillText("强度 " + e.tier + " · " + e.hp + " 血 · 答对 " + Math.ceil(e.hp / spec.stepDmg) + " 题", 256, 70);
      const w = 300, x0 = 106;
      g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(x0, 84, w, 8);
      g.fillStyle = e.tier <= 3 ? "#7bd88f" : e.tier <= 6 ? "#ffd166" : "#ff6b6b";
      g.fillRect(x0, 84, w, 8);
    }
    return c;
  }

  /* ---------------- 初始化 ---------------- */
  FP.init = function (canvasEl, anchors) {
    if (!window.THREE) return false;
    try {
      renderer = new window.THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    } catch (err) { return false; }
    canvas = canvasEl;
    el = anchors || {};
    scene = new window.THREE.Scene();
    camera = new window.THREE.PerspectiveCamera(FOV, 1, 0.1, 900);
    camera.rotation.order = "YXZ";
    fogCol = new window.THREE.Color(THEME.plains.fog);
    scene.fog = new window.THREE.Fog(fogCol.getHex(), fogNear, fogFar);
    scene.background = skyTex(THEME.plains.sky);
    FP.resize();
    bindLook(canvasEl);
    FP.on = true;
    return true;
  };

  FP.resize = function () {
    vw = canvas.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || window.innerHeight;
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(vw, vh, false);
  };

  /* ---------------- 造世界 ---------------- */
  FP.build = function (o) {
    spec = o;
    const W = o.w * S, H = o.h * S;
    foes = []; herbs = [];

    const ground = new window.THREE.Mesh(
      new window.THREE.PlaneGeometry(W + 2400 * S * 4, H + 2400 * S * 4),
      new window.THREE.MeshBasicMaterial({ map: grassTex() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
    scene.add(ground);

    // 领地罩色：一块贴地的半透明色片，走过去整片颜色就变了
    // 纵向铺到地图外，否则走到北边缘会看到一条「颜色到头了」的接缝
    const DEEP = H + 2400 * S * 4;
    o.regions.forEach(function (r, ri) {
      const next = o.regions[ri + 1];
      const th = THEME[r.theme] || THEME.plains;
      const x0 = (ri === 0 ? 0 : 130 + (r.tier - 1) * 520) * S;
      const x1 = (next ? 130 + (next.tier - 1) * 520 : o.w) * S;
      const q = new window.THREE.Mesh(
        new window.THREE.PlaneGeometry(x1 - x0, DEEP),
        new window.THREE.MeshBasicMaterial({ color: th.tint, transparent: true, opacity: 0.3, depthWrite: false })
      );
      q.rotation.x = -Math.PI / 2;
      q.position.set((x0 + x1) / 2, 0.02, H / 2);
      scene.add(q);

      const lb = new window.THREE.Sprite(new window.THREE.SpriteMaterial({
        map: tex(regionLabel(r.name, ri + 1, o.regions.length)), transparent: true, depthWrite: false
      }));
      lb.scale.set(15, 3.75, 1);
      // 挂在领地北侧高空：正好在玩家视线上方一点，又不会挡住走路和恐龙名牌
      lb.position.set((x0 + x1) / 2, 21, H * 0.14);
      scene.add(lb);
    });

    // 石板路：和 2D 版同一套串珠走位，脚底下有东西跟着才不飘
    const stoneGeo = new window.THREE.CircleGeometry(0.3, 9);
    stoneGeo.rotateX(-Math.PI / 2);
    const stones = new window.THREE.InstancedMesh(stoneGeo,
      new window.THREE.MeshBasicMaterial({ color: 0x9a9d92 }), o.enemies.length * 12);
    const box = new window.THREE.Object3D();
    let si = 0;
    for (let i = 0; i < o.enemies.length - 1; i++) {
      const a = o.posOf(i), b = o.posOf(i + 1);
      for (let f = 0; f < 1; f += 0.11) {
        if (si >= stones.count) break;
        box.position.set((a.x + (b.x - a.x) * f) * S, 0.03, (a.y + (b.y - a.y) * f) * S);
        box.rotation.set(0, o.rand() * 6.28, 0);
        const sc = 0.55 + o.rand() * 0.5;
        box.scale.set(sc, 1, sc);
        box.updateMatrix();
        stones.setMatrixAt(si++, box.matrix);
      }
    }
    stones.count = si;
    stones.instanceMatrix.needsUpdate = true;
    scene.add(stones);

    T.tuft = tuftTex();
    scatter(o.rand, T.tuft, 520, 0.7, 1.7, 1, false);
    scatter(o.rand, flowerTex(), 150, 0.45, 0.85, 1, true);
    scatter(o.rand, treeTex(), 90, 3.4, 8.2, 0.67, false);
    rocks(o.rand, 70, W, H);
    herbFields(o);

    // 云：贴在天顶上，不参与雾，纯粹给天空一点动静
    const ct = cloudTex();
    for (let i = 0; i < 12; i++) {
      const c = new window.THREE.Sprite(new window.THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.62, depthWrite: false, fog: false }));
      c.scale.set(60 + o.rand() * 90, 18 + o.rand() * 22, 1);
      c.position.set(o.rand() * W, 55 + o.rand() * 60, o.rand() * H);
      c.renderOrder = -1;
      scene.add(c);
      clouds.push(c);
    }

    o.enemies.forEach(function (e) { FP.addFoe(e, o); });
    setRegion(0);
  };

  function regionLabel(name, i, n) {
    const c = cv(512, 128), g = c.getContext("2d");
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(255,255,255,.92)";
    g.font = "bold 52px system-ui, 'Microsoft YaHei', sans-serif";
    g.fillText(name, 256, 56);
    g.font = "26px system-ui, 'Microsoft YaHei', sans-serif";
    g.fillStyle = "rgba(255,233,138,.9)";
    g.fillText("第 " + i + " 片领地 / 共 " + n + " 片", 256, 100);
    return c;
  }

  // 一丛丛竖着的草片/花/树：InstancedMesh，一次画几百个也不卡
  function scatter(rand, map, count, minH, maxH, aspect, colored) {
    const W = spec.w * S, H = spec.h * S;
    const geo = new window.THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);            // 底部贴地，不然整片草浮在半空
    const mat = new window.THREE.MeshBasicMaterial({
      map: map, transparent: true, alphaTest: 0.35, side: window.THREE.DoubleSide
    });
    const mesh = new window.THREE.InstancedMesh(geo, mat, count);
    const o = new window.THREE.Object3D();
    const col = new window.THREE.Color();
    for (let i = 0; i < count; i++) {
      const h = minH + rand() * (maxH - minH);
      o.position.set(rand() * W, 0, rand() * H);
      o.rotation.set(0, rand() * 6.28, (rand() - 0.5) * 0.1);
      o.scale.set(h * aspect * (0.8 + rand() * 0.5), h, h);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      if (colored) { col.setHSL(0.85 + rand() * 0.32, 0.7, 0.72); mesh.setColorAt(i, col); }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return mesh;
  }

  function rocks(rand, count, W, H) {
    const mesh = new window.THREE.InstancedMesh(
      new window.THREE.DodecahedronGeometry(0.5, 0),
      new window.THREE.MeshBasicMaterial({ color: 0x9aa0a6 }), count);
    const o = new window.THREE.Object3D(), col = new window.THREE.Color();
    for (let i = 0; i < count; i++) {
      const s = 0.4 + rand() * 1.3;
      o.position.set(rand() * W, s * 0.28, rand() * H);
      o.rotation.set(rand() * 3, rand() * 6.28, rand() * 3);
      o.scale.set(s * (1 + rand() * 0.6), s * 0.7, s * (1 + rand() * 0.6));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      col.setHSL(0.09 + rand() * 0.06, 0.08, 0.5 + rand() * 0.2);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  function herbFields(o) {
    const t = glowTex();
    o.enemies.forEach(function (e, i) {
      if (i % 5 !== 2) return;
      const p = o.posOf(i);
      const x = (p.x + 150) * S, z = (p.y - 250 + o.rand() * 500) * S;
      const g = new window.THREE.Sprite(new window.THREE.SpriteMaterial({ map: t, color: 0x9dffc0, transparent: true, blending: window.THREE.AdditiveBlending, depthWrite: false }));
      g.scale.set(2.4, 2.4, 1);
      g.position.set(x, 0.9, z);
      const body = new window.THREE.Sprite(new window.THREE.SpriteMaterial({ map: T.tuft, transparent: true, alphaTest: 0.35 }));
      body.scale.set(1.1, 1.1, 1);
      body.position.set(x, 0.1, z);
      scene.add(g); scene.add(body);
      herbs.push({ key: String(i), x: x, z: z, glow: g, body: body, taken: false, ph: Math.random() * 6.28 });
    });
  }

  FP.addFoe = function (e, o) {
    const p = o.posOf(e.idx);
    const h = 2.6 + e.tier * 0.55;            // 立绘按强度长大，最强的近 8 米
    const w = h;
    const sp = new window.THREE.Sprite(new window.THREE.SpriteMaterial({ color: 0xffffff, transparent: true }));
    sp.scale.set(w, h, 1);
    sp.center.set(0.5, 0);                      // 锚点在脚底，站在地上而不是浮着
    sp.position.set(p.x * S, 0.05, p.y * S);
    scene.add(sp);

    const lb = new window.THREE.Sprite(new window.THREE.SpriteMaterial({ map: tex(labelFor(e, false)), transparent: true, depthWrite: false }));
    lb.scale.set(6.4, 1.6, 1);
    lb.position.set(p.x * S, h + 1.1, p.y * S);
    scene.add(lb);

    const rec = {
      e: e, sp: sp, lb: lb, h: h, w: w, x: p.x * S, z: p.y * S,
      hx: p.x * S, hz: p.y * S,                    // 出生点：漫游以此为圆心，别走远
      tx: p.x * S, tz: p.y * S,                    // 当前要走到的目标点
      range: 1.8 + e.tier * 0.3,                   // 越强的恐龙地盘越大，走得越远（米）
      vmax: 0.3 + Math.random() * 0.35,            // 0.3~0.65 米/秒，只有玩家脚程的十分之一
      v: 0, idle: Math.random() * 7, dirx: 0, dirz: 0, flip: 0,
      flash: 0, dead: false, ph: Math.random() * 6.28
    };
    e.fp = rec;
    foes.push(rec);

    const img = new Image();
    img.onload = function () {
      const t = new window.THREE.Texture(img);
      // 漫步时朝屏幕右走要把整张立绘水平翻面（repeat.x = -1），先开好 S 向环绕，镜像才不会出现空白帧
      t.wrapS = window.THREE.RepeatWrapping;
      t.needsUpdate = true;
      sp.material.map = t;
      sp.material.needsUpdate = true;
    };
    img.src = e.img;   // 多文件版是相对路径，单文件版是 data URI，Image 都吃
  };

  /* ---------------- 转头 / 摇杆 ---------------- */
  function bindLook(node) {
    node.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      lookId = ev.pointerId; lookX = ev.clientX; lookY = ev.clientY;
      try { node.setPointerCapture(ev.pointerId); } catch (e) { }
    });
    node.addEventListener("pointermove", function (ev) {
      if (lookId !== ev.pointerId) return;
      FP.lookBy(ev.clientX - lookX, ev.clientY - lookY);
      lookX = ev.clientX; lookY = ev.clientY;
    });
    const end = function (ev) { if (lookId === ev.pointerId) lookId = null; };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  FP.lookBy = function (dx, dy) {
    FP.yaw -= dx * LOOK_X;
    FP.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, FP.pitch - dy * LOOK_Y));
  };

  // 世界像素坐标下的前后左右单位向量：game.js 拿到它照样加减自己的坐标
  FP.forward = function () { return { x: -Math.sin(FP.yaw), y: -Math.cos(FP.yaw) }; };
  FP.right = function () { return { x: Math.cos(FP.yaw), y: -Math.sin(FP.yaw) }; };
  FP.turnBy = function (rad) { FP.yaw -= rad; };   // 正数向右转

  // 目标相对视线的方位角：0 在正前方，负在左、正在右，超 ±π 在身后
  FP.bearing = function (px, py) {
    const f = FP.forward();
    const dx = px * S - camera.position.x, dz = py * S - camera.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    const dot = Math.max(-1, Math.min(1, nx * f.x + nz * f.y));
    const cross = f.x * nz - f.y * nx;
    return Math.atan2(cross, dot) * -1;
  };

  // 恐龙现在站在地图上的哪一格（漫步之后它已经不在 posOf 给的那个点上了）。
  // game.js 的距离、罗盘、开战判定都问这里，否则「看见恐龙在 A 点、走到 B 点才打起来」。
  FP.foePos = function (e) {
    const r = e && e.fp;
    if (!r) return null;
    return { x: r.x / S, y: r.z / S };
  };

  /* ---------------- 每帧 ---------------- */
  FP.frame = function (dt, isMoving) {
    moving = !!isMoving;
    time += dt;

    // 走路时轻微起伏 + 摆头，第一人称没有这个就「飘」
    if (moving) bob += dt * 9.2; else bob += dt * 1.1;
    const step = moving ? Math.sin(bob) * 0.055 : Math.sin(bob) * 0.012;
    const roll = moving ? Math.sin(bob * 0.5) * 0.012 : 0;

    FP.px = FP.px || 0; FP.py = FP.py || 0;
    let yaw = FP.yaw, pitch = FP.pitch, exPx = FP.px;

    if (lock) {
      const f = lock, dx = f.x - camera.position.x, dz = f.z - camera.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const stand = Math.max(8, f.h * 1.45 + 5.5);            // 依体型拉开的对峙距离
      const want = { x: f.x - dx / dist * stand, z: f.z - dz / dist * stand };
      camera.position.x += (want.x - camera.position.x) * Math.min(1, dt * 2.6);
      camera.position.z += (want.z - camera.position.z) * Math.min(1, dt * 2.6);
      const wy = Math.atan2(-dx, -dz);
      yaw = approach(FP.yaw, wy + Math.sin(time * 0.45) * 0.03, dt * 3.2);
      // 战斗面板占了屏幕下半截：刻意把视线压低 23°，让恐龙整只落在屏幕上半部分
      const wantPitch = Math.max(-0.5, Math.min(0.5, Math.atan2(f.h * 0.5 - EYE, stand) - 0.4));
      pitch = approach(FP.pitch, wantPitch, dt * 3.0);
      FP.yaw = yaw; FP.pitch = pitch;
      camera.position.y = EYE + step * 0.4;
      exPx = camera.position.x / S;
    } else {
      // 战斗结束回到自由行走：镜头从对峙位置滑回主角脚下，别「啪」地一下跳回去
      if (smooth > 0) {
        smooth = Math.max(0, smooth - dt * 1.8);
        const k = Math.min(1, dt * 5.5);
        camera.position.x += (FP.px * S - camera.position.x) * k;
        camera.position.z += (FP.py * S - camera.position.z) * k;
      } else {
        camera.position.x = FP.px * S;
        camera.position.z = FP.py * S;
      }
      // 战斗时视线被压低了，回到行走要把它抬回地平线，不然一直盯着脚底下
      if (pitchRet > 0) {
        pitchRet = Math.max(0, pitchRet - dt * 1.6);
        FP.pitch += (-0.02 - FP.pitch) * Math.min(1, dt * 3.4);
        pitch = FP.pitch;
      }
      camera.position.y = EYE + step;
    }

    // 扑击 / 受击：镜头往前顶一下 + FOV 收一收
    let fov = FOV;
    if (kick > 0) {
      kick = Math.max(0, kick - dt * 2.6);
      const k = kick * kick;
      const f = FP.forward();
      camera.position.x += f.x * k * 0.9 * kickDir;
      camera.position.z += f.y * k * 0.9 * kickDir;
      fov = FOV - k * 7;
    }
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 3.2);
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      yaw += (Math.random() - 0.5) * shake * 0.05;
    }
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.rotation.set(pitch, yaw, roll);

    // 形态化身跟在主角身前。Sprite 永远正对镜头、立绘本身是背面，所以它看着就是朝前走；
    // 转向由两侧景物后退来体现，化身不需要跟着摆头（侧面立绘时代怎么摆都是侧身）。
    if (emblem) {
      emblem.visible = !lock;
      if (!lock) {
        const h = 1.25 + emblemTier * 0.12;
        // 横向偏移必须跟着画面宽高比走：同样 0.75 米，宽屏只压到屏幕 64% 处，竖屏会顶到 84% 的右下角。
        // 偏移 = k × 宽高比时，投影位置与设备无关（实测 54.5% 宽、脚在 67% 高，即中部偏下）。
        const side = Math.max(0.08, Math.min(0.45, 0.16 * (vw / Math.max(1, vh))));
        emblem.position.set(
          FP.px * S - Math.sin(yaw) * 2.2 + Math.cos(yaw) * side,
          0.02,
          FP.py * S - Math.cos(yaw) * 2.2 - Math.sin(yaw) * side);
        emblem.scale.set(h, h, 1);
      }
    }

    animateFoes(dt);
    animateHerbs();
    setRegion(regionOfX(exPx));
    renderer.render(scene, camera);
    syncAnchors();
  };

  function animateFoes(dt) {
    for (let i = 0; i < foes.length; i++) {
      const r = foes[i];
      if (r.gone) continue;
      if (r.dead) {
        r.dying = (r.dying || 0) + dt;
        const p = Math.min(1, r.dying / 1.1);
        r.sp.material.rotation = -p * 1.5;
        r.sp.position.y = 0.05 - p * r.h * 0.35;
        r.sp.material.opacity = 1 - p * 0.9;
        r.lb.material.opacity = 1 - Math.min(1, p * 2.2);
        if (p >= 1) { r.gone = true; r.sp.visible = false; r.lb.visible = false; }
        continue;
      }
      // 站着不动的恐龙像雕塑：慢慢在自己地盘里晃，走到点就停下来歇会儿再换方向。
      // 正在对峙的那只冻结，否则战斗镜头会跟着它一起飘。
      if (r !== lock) stepWander(r, dt);
      // 呼吸 + 原地小幅摇摆，被击中时白闪往后一仰
      const br = 1 + Math.sin(time * 1.6 + r.ph) * 0.02;
      r.sp.scale.set(r.w * br, r.h * (2 - br), 1);
      r.sp.position.y = 0.05 + Math.abs(Math.sin(time * 0.9 + r.ph)) * 0.06;
      r.lb.position.y = r.h * (2 - br) + 1.1;
      r.sp.position.x = r.x; r.sp.position.z = r.z;
      r.lb.position.x = r.x + Math.sin(time * 0.8 + r.ph) * 0.12;
      r.lb.position.z = r.z;
      if (r.flash > 0) {
        r.flash = Math.max(0, r.flash - dt * 3.4);
        r.sp.material.color.setRGB(1, 1 - r.flash * 0.55, 1 - r.flash * 0.55);
      } else if (r.hurt > 0) {
        r.hurt = Math.max(0, r.hurt - dt * 3);
        r.sp.material.color.setRGB(1, 1 - r.hurt * 0.3, 1 - r.hurt * 0.3);
      } else {
        r.sp.material.color.setRGB(1, 1, 1);
      }
    }
  }

  // 漫步：走到一个随机点 → 停下歇几秒 → 再挑一个点；速度缓入缓出，不会「啪」地起步或急停。
  function stepWander(r, dt) {
    const dx = r.tx - r.x, dz = r.tz - r.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) {
      r.idle -= dt;
      if (r.idle <= 0) {
        const a = Math.random() * 6.283;
        let rad = r.range * (0.35 + Math.random() * 0.65);
        // 恐龙挤在一条道上，相邻出生点只差 5~6 米，而强度 10 的立绘宽 8 米（站着就已经互相压住了）。
        // 所以把漫游压在「站定时还剩的空隙」的一半以内：两只一起朝对方走也不会比原来更挤。
        let room = Infinity;
        for (let i = 0; i < foes.length; i++) {
          const o = foes[i];
          if (o === r || o.dead || o.gone) continue;
          const gap = Math.hypot(o.hx - r.hx, o.hz - r.hz) - (r.w + o.w) / 2;
          if (gap < room) room = gap;
        }
        if (room < Infinity) rad = Math.min(rad, Math.max(0.8, room * 0.5));
        r.tx = r.hx + Math.cos(a) * rad;
        r.tz = r.hz + Math.sin(a) * rad;
        r.idle = 2.5 + Math.random() * 5;
      }
      r.v = approach(r.v, 0, dt * 2.2);
    } else {
      r.v = approach(r.v, r.vmax, dt * 1.1);
      if (r.v > 0.01) {
        r.dirx = dx / d; r.dirz = dz / d;
        r.x += r.dirx * r.v * dt;
        r.z += r.dirz * r.v * dt;
      }
    }
    setFace(r);
  }

  // 立绘天生朝左，往屏幕右边挪就得整张图水平翻过来，不然看着像在倒着太空步。
  // Sprite 永远正对镜头，所以「往哪边」只能用镜头右向量来判。
  function setFace(r) {
    const m = r.sp.material.map;
    if (!m) return;
    if (r.v <= 0.05) return;                       // 停着的时候保持最后一次朝向，转身不算回头
    const right = FP.right();
    const s = r.dirx * right.x + r.dirz * right.y;
    const want = s > 0.2 ? 1 : s < -0.2 ? 0 : r.flip;
    if (want === r.flip) return;
    r.flip = want;
    m.repeat.x = want ? -1 : 1;
    m.offset.x = want ? 1 : 0;
  }

  function animateHerbs() {
    for (let i = 0; i < herbs.length; i++) {
      const h = herbs[i];
      if (h.taken) continue;
      const p = 1 + Math.sin(time * 2.4 + h.ph) * 0.16;
      h.glow.scale.set(2.4 * p, 2.4 * p, 1);
      h.glow.position.y = 0.9 + Math.sin(time * 1.7 + h.ph) * 0.12;
    }
  }

  function syncAnchors() {
    if (!el.foe || !el.me) return;
    const r = canvas.getBoundingClientRect();
    if (lock && !lock.gone) {
      const c = lockSp();
      const cx = camera.position.x, cz = camera.position.z;
      const dist = Math.hypot(lock.x - cx, lock.z - cz) || 1;
      const frac = lock.h / (2 * Math.tan((FOV * Math.PI / 180) / 2) * dist);
      const hpx = Math.max(20, Math.min(vh * 1.4, frac * vh));
      const wpx = hpx * 0.62, hgt = hpx * 0.72;
      // 居中靠 left/top 减半尺寸，不借 transform：特效给锚点加位移动画时才不会歪
      el.foe.style.left = (r.left + c.x * r.width - wpx / 2) + "px";
      el.foe.style.top = (r.top + c.y * r.height - hgt / 2) + "px";
      el.foe.style.width = wpx + "px";
      el.foe.style.height = hgt + "px";
      el.foe.style.display = "block";
    } else {
      el.foe.style.display = "none";
    }
    // 锚点必须真的占住尺寸，FX.visible() 才认它，否则飘字和粒子会整个跳过
    el.me.style.display = lock ? "block" : "none";
    el.me.style.left = (r.left + r.width * 0.5 - 60) + "px";
    el.me.style.top = (r.top + r.height * 0.72 - 60) + "px";
  }

  // 恐龙胸口的屏幕坐标：粒子和飘字都靠它定位
  function lockSp() {
    const v = V(lock.x, lock.h * 0.5, lock.z).project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  function approach(cur, want, k) {
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur + d * Math.min(1, k);
  }

  function regionOfX(px) {
    const tier = Math.max(1, Math.min(10, Math.floor((px - 200) / 520) + 1));
    let idx = 0;
    spec.regions.forEach(function (r, i) { if (r.tier <= tier) idx = i; });
    return idx;
  }

  function setRegion(idx) {
    const r = spec.regions[idx];
    if (!r) return;
    FP.regionName = r.name;
    if (idx === regionIdx) return;
    regionIdx = idx;
    const th = THEME[r.theme] || THEME.plains;
    scene.background = skyTex(th.sky);
    scene.fog.color.setHex(th.fog);
    scene.fog.near = th.near; scene.fog.far = th.far;
  }

  /* ---------------- 战斗钩子 ---------------- */
  FP.lockFoe = function (e) {
    const rec = e.fp;
    if (!rec) return;
    lock = rec;
    rec.v = 0;
    // 对峙时改回素材原本的朝向：正对着玩家才是设计那张立绘时的姿势，别带着漫步时的镜像进战斗
    if (rec.flip && rec.sp.material.map) { rec.sp.material.map.repeat.x = 1; rec.sp.material.map.offset.x = 0; }
    rec.flip = 0;
    // 对峙时镜头贴得很近，头顶那块大牌子会戳出画面外，面板上本来就有名字和血条
    rec.lb.visible = false;
  };
  FP.release = function () {
    lock = null; smooth = 1; pitchRet = 1;
    for (let i = 0; i < foes.length; i++) {
      const r = foes[i];
      if (!r.gone) r.lb.visible = true;
    }
  };
  // 被打倒：视线垂下去，回到地面视角前玩家自己拖回来
  FP.lookDown = function () { FP.pitch = -0.4; };
  FP.punch = function (dir) { kick = 1; kickDir = dir > 0 ? 1 : -1; };
  FP.hitFoe = function (e) { if (e.fp) { e.fp.flash = 1; e.fp.hurt = 0.9; } };
  FP.roarFoe = function (e) { if (e.fp) e.fp.hurt = 1; };
  FP.shakeIt = function (k) { shake = k === "l" ? 1 : k === "m" ? 0.55 : 0.3; };
  FP.killFoe = function (e, instant) {
    if (!e.fp) return;
    const r = e.fp;
    r.dead = true;
    r.lb.material.map = tex(labelFor(e, true));
    r.lb.material.needsUpdate = true;
    if (!instant) { r.dying = 0; return; }
    // 读档时已经是尸体，就别再演一遍倒下动画
    r.dying = 1.1; r.gone = true; r.sp.visible = false; r.lb.visible = false;
    if (lock === r) lock = null;
  };

  // 草药：踩进去就摘掉，返回值是存档用的编号
  FP.takeHerb = function (px, py, rangePx) {
    for (let i = 0; i < herbs.length; i++) {
      const h = herbs[i];
      if (h.taken) continue;
      if (Math.hypot(h.x - px * S, h.z - py * S) < rangePx * S) {
        h.taken = true;
        scene.remove(h.glow); scene.remove(h.body);
        return h.key;
      }
    }
    return null;
  };
  FP.dropHerbs = function (keys) {
    (keys || []).forEach(function (k) {
      for (let i = 0; i < herbs.length; i++) {
        if (herbs[i].key === String(k) && !herbs[i].taken) {
          herbs[i].taken = true;
          scene.remove(herbs[i].glow); scene.remove(herbs[i].body);
        }
      }
    });
  };

  /* ---------------- 主角形态：身前偏右跟着走的化身，背面立绘所以天生面朝前方 ---------------- */
  FP.setForm = function (src, tier, backSrc) {
    if (!scene) return;
    emblemTier = tier || 1;
    if (!emblem) {
      // 正对镜头的 Sprite + 「从背后看」的立绘：第一人称里你永远站在化身身后，
      // 所以它只要画成背面就一定是朝前走。侧面立绘绕竖轴怎么转都还是侧身，这是上一版无解的原因。
      emblem = new window.THREE.Sprite(new window.THREE.SpriteMaterial({
        transparent: true, opacity: 0.85, depthWrite: false
      }));
      emblem.center.set(0.5, 0);   // 锚点在脚底，站在地上而不是浮着
      emblem.renderOrder = 3;
      scene.add(emblem);
    }
    function paint(uri, onfail) {
      const img = new Image();
      img.onload = function () {
        const t = new window.THREE.Texture(img);
        t.needsUpdate = true;
        emblem.material.map = t;
        emblem.material.needsUpdate = true;
      };
      img.onerror = onfail;
      img.src = uri;      // 多文件版是相对路径，单文件版是 data URI
    }
    // 背面图还没生成（或没拷全）时退回侧面图，别让玩家低头看见一片空地
    paint(backSrc || src, function () { if (backSrc) paint(src, null); });
  };

  FP.setPose = function (px, py) { FP.px = px; FP.py = py; };
  FP.speed = function () { return WALK; };
  FP.turnSpeed = function () { return TURN; };
  FP.stickVec = function () {
    const s = FP.stick, dz = 0.14;
    let x = Math.abs(s.x) < dz ? 0 : s.x, y = Math.abs(s.y) < dz ? 0 : s.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x: x, y: y };
  };

  // 触屏摇杆：拇指推多远就走多快，松手归零
  FP.bindStick = function (node, knob) {
    let id = null, cx = 0, cy = 0;
    const rad = 46;
    function set(x, y) {
      let dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy);
      if (len > rad) { dx = dx / len * rad; dy = dy / len * rad; }
      FP.stick.x = dx / rad; FP.stick.y = dy / rad;
      if (knob) knob.style.transform = "translate(" + dx + "px," + dy + "px)";
    }
    function zero(ev) {
      if (id !== ev.pointerId) return;
      id = null; FP.stick.x = FP.stick.y = 0;
      if (knob) knob.style.transform = "translate(0,0)";
    }
    node.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      const r = node.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      id = ev.pointerId;
      try { node.setPointerCapture(ev.pointerId); } catch (e) { }
      set(ev.clientX, ev.clientY);
    });
    node.addEventListener("pointermove", function (ev) { if (id === ev.pointerId) set(ev.clientX, ev.clientY); });
    node.addEventListener("pointerup", zero);
    node.addEventListener("pointercancel", zero);
  };

  window.FP = FP;
})();
