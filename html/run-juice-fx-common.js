/*
 * run-juice-fx-common.js — 런 타격감(주스) VFX 프레임 드로잉 모듈 (공용) · v3 고퀄
 * ──────────────────────────────────────────────────────────────────────
 * ⚠ 동기화 필수 — 이 파일이 **유일한 정본**이다.
 *   - html/run-juice-fx-sprites.html  : 이 함수로 시트를 굽고 PNG 로 내보낸다(에셋 생성기)
 *   - html/run-vfx-juice-compare.html : 이 함수로 「강화안」 패널을 그린다(비교 목업)
 *   두 페이지가 같은 파일을 <script src> 로 읽으므로 **목업에서 보는 프레임 = 내보내는 프레임**이다.
 *   그림을 바꾸려면 이 파일만 고친다. 페이지 쪽에 드로잉 사본을 두지 말 것.
 *   v2(평면 벡터판)는 html/run-juice-fx-common-v2.js 에 **동결** — 비교 전용(전역 JuiceFxV2).
 *
 * v3(2026-09-29 owner "메타데이터로 만든 에셋을 고퀄리티로") — 장르 기준 품질 바:
 *   해상도 ×2(셀 64→128 · 버스트 128→256 · 파편/스파크 32→64) · 프레임 ≈×2(길이 유지 · fps 상승)
 *   · 결정적 값 노이즈(fbm)로 질감(불꽃 링·연기·먼지 덩이·광맥·균열 지터) · 5단 이상 램프.
 *   C# 포팅 제약: Canvas2D 중 SkiaSharp 에 1:1 대응하는 것만 — 경로·선형/원형 경사·lighter(Plus)
 *   ·destination-out(DstOut)·globalAlpha·clip. ctx.filter/getImageData(픽셀 조작) 안 씀.
 *   블러는 겹친 원형 경사(softDot)로 흉내 낸다(shadowBlur 도 안 씀 — 엔진 간 커널 차이 방지).
 *
 * 플랜: docs/plans/03-qa-pending/phase-1/run-vfx-juice-plan.md §3 T1~T4 · §10(에셋 파이프라인)
 *       docs/plans/02-in-progress/phase-1/asset-recipe-importer-plan.md §10(v3 진행 기록)
 * 색  : html/ui-prototype.html 토큰(:62-104)만 쓴다. 명암은 토큰끼리/토큰과 흰색·배경색의 **혼합**으로 만든다(신규 색 0).
 * 결정성: 모든 난수·노이즈는 시트 이름으로 시드한 mulberry32 — 몇 번을 구워도 같은 픽셀이 나온다(Math.random 0).
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  // ───────────────────────── 토큰 ─────────────────────────
  const TOK = {
    bg: '#0b1218', bgDeep: '#070c11', white: '#ffffff',
    teal: '#57d1b8', cyan: '#52ffce', gold: '#f5e859', purple: '#bf9cfe',
    red: '#ff6b6b', amber: '#fbb03b', green: '#34d399', muted: '#8c99ad',
    num: '#cfdae6', raisedA: '#16202c', hairline: '#1b2836',
  };

  // ───────────────────────── 색 유틸 ─────────────────────────
  function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, t) {
    const x = hex(a), y = hex(b);
    const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function rgba(h, a) { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a})`; }

  // 결정적 난수
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutQuad = t => 1 - (1 - t) * (1 - t);
  const easeInQuad = t => t * t;
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  // ───────────────────────── 결정적 값 노이즈(v3) ─────────────────────────
  // 격자 256 값(mulberry32) + 순열 해시 · smoothstep 보간 · fbm(옥타브 합). 출력 ≈ 0..1(평균 0.5).
  // C# 포팅: 같은 mulberry32·같은 셔플 순서면 같은 값이 나온다(부동소수 오차 ≤1e-6 수준).
  const noiseCache = new Map();
  function makeNoise(name) {
    let N = noiseCache.get(name);
    if (N) return N;
    const rnd = mulberry32(seedOf('noise:' + name));
    const p = []; for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const tmp = p[i]; p[i] = p[j]; p[j] = tmp; }
    const perm = new Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const val = new Array(256); for (let i = 0; i < 256; i++) val[i] = rnd();
    const fade = t => t * t * (3 - 2 * t);
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      const v00 = val[perm[X + perm[Y]]], v10 = val[perm[X + 1 + perm[Y]]];
      const v01 = val[perm[X + perm[Y + 1]]], v11 = val[perm[X + 1 + perm[Y + 1]]];
      const u = fade(xf), v = fade(yf);
      return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
    }
    function fbm(x, y, oct) {
      oct = oct || 4; let s = 0, a = 0.5, f = 1, n = 0;
      for (let i = 0; i < oct; i++) { s += a * n2(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; }
      return s / n;
    }
    // 원 둘레를 이음새 없이 도는 노이즈(각 a, 반경 계수 k, 시간 오프셋 z)
    function ring(a, k, z, oct) { return fbm(Math.cos(a) * k + 31.7 + z, Math.sin(a) * k + 11.3 - z * 0.7, oct); }
    N = { n2, fbm, ring };
    noiseCache.set(name, N);
    return N;
  }
  // 노이즈 대비 늘리기(fbm 은 가운데로 몰린다) — 0..1 로 다시 편다
  const spread = v => clamp01((v - 0.5) * 2.2 + 0.5);

  // ───────────────────────── 팔레트 ─────────────────────────
  // 불꽃 램프(가산 시트 공용 · 7단): 흰 코어 → 흰금 → 금 → 호박 → 잉걸 → 적 → 그을음. x=0 이 가장 뜨겁다.
  const HOT = {
    core: TOK.white,
    hot: mix(TOK.white, TOK.gold, 0.35),
    gold: TOK.gold,
    amber: TOK.amber,
    ember: mix(TOK.amber, TOK.red, 0.5),
    red: TOK.red,
    soot: mix(TOK.red, TOK.bgDeep, 0.6),
    ash: mix(TOK.muted, TOK.amber, 0.22),
  };
  const HOT_RAMP = [HOT.core, HOT.hot, HOT.gold, HOT.amber, HOT.ember, HOT.red, HOT.soot];
  function ramp(R, x) {
    x = clamp01(x) * (R.length - 1);
    const i = Math.min(R.length - 2, Math.floor(x));
    return mix(R[i], R[i + 1], x - i);
  }
  // 티어 팔레트 — 맵 1~4 의 광물 색. 토큰 1개 + 흰색/배경 혼합으로 7단 명암 + 티어 기운이 든 바위 6단.
  function tierPal(base, glint) {
    const rockTone = mix(TOK.muted, base, 0.14);      // 바위도 맵 색을 아주 살짝 먹는다(한 화면의 통일감)
    const P = {
      base,
      hi: mix(base, TOK.white, 0.82),
      light: mix(base, TOK.white, 0.52),
      soft: mix(base, TOK.white, 0.24),
      mid: mix(base, TOK.bg, 0.28),
      dark: mix(base, TOK.bg, 0.58),
      deep: mix(base, TOK.bgDeep, 0.82),
      glint: glint || TOK.white,
      rockHi: mix(rockTone, TOK.white, 0.42),
      rockLight: mix(rockTone, TOK.white, 0.12),
      rock: mix(rockTone, TOK.bg, 0.38),
      rockMid: mix(rockTone, TOK.bg, 0.6),
      rockDark: mix(rockTone, TOK.bgDeep, 0.78),
      rockDeep: mix(rockTone, TOK.bgDeep, 0.9),
    };
    P.ramp = [P.hi, P.light, P.soft, P.base, P.mid, P.dark, P.deep];               // 밝음 → 어둠
    P.rockRamp = [P.rockHi, P.rockLight, P.rock, P.rockMid, P.rockDark, P.rockDeep];
    return P;
  }
  const TIERS = {
    t1: Object.assign(tierPal(TOK.teal, mix(TOK.cyan, TOK.white, 0.5)), { label: 'T1 · 맵 1 · teal' }),
    t2: Object.assign(tierPal(TOK.purple, mix(TOK.purple, TOK.white, 0.7)), { label: 'T2 · 맵 2 · purple' }),
    t3: Object.assign(tierPal(TOK.amber, mix(TOK.gold, TOK.white, 0.5)), { label: 'T3 · 맵 3 · amber' }),
    t4: Object.assign(tierPal(TOK.red, TOK.gold), { label: 'T4 · 맵 4 · red+gold' }),
  };
  // 먼지 램프(알파 시트 · 6단): 볕 받은 면 → 그늘
  const DUST_RAMP = [mix(TOK.muted, TOK.white, 0.86), mix(TOK.muted, TOK.white, 0.6), mix(TOK.muted, TOK.white, 0.32), TOK.muted, mix(TOK.muted, TOK.bg, 0.42), mix(TOK.muted, TOK.bgDeep, 0.7)];
  // 균열 램프(가산): 흰 코어 → 청록 번짐
  const CRACK_RAMP = [TOK.white, mix(TOK.white, TOK.cyan, 0.35), mix(TOK.white, TOK.cyan, 0.7), TOK.cyan, mix(TOK.cyan, TOK.teal, 0.6), mix(TOK.teal, TOK.bg, 0.4)];

  // ───────────────────────── 드로잉 프리미티브 ─────────────────────────
  function glow(ctx, x, y, r, color, a, stops) {
    if (r <= 0 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    (stops || [[0, 1], [0.25, 0.6], [0.6, 0.18], [1, 0]]).forEach(([o, k]) => g.addColorStop(o, rgba(color, a * k)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // 부드러운 덩이 — 블러 대용(가우시안 근사 경사). 불꽃·연기·먼지 질감의 기본 단위.
  function softDot(ctx, x, y, r, color, a, edge) {
    if (r <= 0 || a <= 0.003) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(0.35, rgba(color, a * 0.78));
    g.addColorStop(0.7, rgba(edge || color, a * 0.26)); g.addColorStop(1, rgba(edge || color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // 4갈래 반짝이(글린트) — 가는 마름모 두 개 + 코어. 광물·불티의 "반짝" 한 점.
  function sparkle(ctx, x, y, r, a, col, rot) {
    if (r <= 0 || a <= 0.01) return;
    glow(ctx, x, y, r * 0.75, col || TOK.white, a * 0.55);
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.fillStyle = rgba(TOK.white, a);
    const w = r * 0.13;
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(0, -w); ctx.lineTo(r, 0); ctx.lineTo(0, w); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(w, 0); ctx.lineTo(0, r * 0.8); ctx.lineTo(-w, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // 가시(스파이크) — 뿌리 넓고 끝 뾰족한 연 모양 · 램프 4단 + 흰 심지선.
  function spike(ctx, ang, r0, len, w, a, R) {
    if (len <= 0 || a <= 0) return;
    const c = Math.cos(ang), s = Math.sin(ang), px = -s, py = c;
    const x0 = c * r0, y0 = s * r0, x1 = c * (r0 + len), y1 = s * (r0 + len);
    const xm = c * (r0 + len * 0.2), ym = s * (r0 + len * 0.2);
    R = R || [HOT.core, HOT.hot, HOT.gold, HOT.amber];
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(R[0], a)); g.addColorStop(0.22, rgba(R[1], a)); g.addColorStop(0.5, rgba(R[2], a * 0.85));
    g.addColorStop(0.8, rgba(R[3], a * 0.45)); g.addColorStop(1, rgba(R[3], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - c * w * 0.3, y0 - s * w * 0.3);
    ctx.quadraticCurveTo(xm + px * w * 0.62, ym + py * w * 0.62, x1, y1);
    ctx.quadraticCurveTo(xm - px * w * 0.62, ym - py * w * 0.62, x0 - c * w * 0.3, y0 - s * w * 0.3);
    ctx.closePath(); ctx.fill();
    // 심지 — 가운데 흰 선(뿌리 60%)
    const gl = ctx.createLinearGradient(x0, y0, x0 + c * len * 0.6, y0 + s * len * 0.6);
    gl.addColorStop(0, rgba(TOK.white, a)); gl.addColorStop(1, rgba(TOK.white, 0));
    ctx.strokeStyle = gl; ctx.lineWidth = Math.max(0.6, w * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + c * len * 0.6, y0 + s * len * 0.6); ctx.stroke();
  }
  // 충격 링 — 안쪽은 비고, 안쪽 가장자리가 딱딱하게 밝고, 바깥으로 부드럽게 사라진다.
  function shockRing(ctx, r, th, a, inner, outer) {
    if (r <= 0 || a <= 0 || th <= 0) return;
    const r0 = Math.max(0.01, r - th), r1 = r + th * 0.9;
    const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
    g.addColorStop(0, rgba(inner, 0));
    g.addColorStop(0.3, rgba(inner, a * 0.45));
    g.addColorStop(0.46, rgba(TOK.white, a));
    g.addColorStop(0.56, rgba(inner, a * 0.85));
    g.addColorStop(0.8, rgba(outer, a * 0.3));
    g.addColorStop(1, rgba(outer, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r1, 0, TAU); ctx.arc(0, 0, r0, 0, TAU, true); ctx.fill('evenodd');
  }
  // 불티(꼬리 달린 점)
  function ember(ctx, x0, y0, x, y, w, col, a) {
    if (a <= 0.01) return;
    const g = ctx.createLinearGradient(x0, y0, x, y);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a * 0.85));
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
    softDot(ctx, x, y, w * 1.9, col, a * 0.6);
    ctx.fillStyle = rgba(mix(col, TOK.white, 0.6), a); ctx.beginPath(); ctx.arc(x, y, w * 0.6, 0, TAU); ctx.fill();
  }
  // 노이즈 가장자리 덩이 경로(극좌표)
  function noisyBlob(ctx, N, r, amp, k, z, n) {
    n = n || 56;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rr = r * (1 + amp * (spread(N.ring(a, k, z, 3)) - 0.5) * 2);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // ───────────────────────── 시트 정의 ─────────────────────────
  // draw(ctx, f, S): ctx 원점 = 셀 중심(pivot 적용 전), S = 셀 한 변(px). 셀 밖으로 안 나가게 그린다.
  // 모든 수치는 S 비율 — 굽는 배율과 무관하게 같은 그림이다. t = f/(frames-1) 로 연속 곡선을 쓴다(프레임 표 0).
  const SHEETS = {};

  // ① 피격 흰 플래시 — 노드 실루엣 위에 얹는 가산 섬광. 흰색 위주(런타임 색 곱 가능).
  SHEETS.juice_hit_flash = {
    frames: 6, cell: 128, fps: 60, pivot: [0.5, 0.5], blend: 'additive', tint: 'runtime',
    use: '비치명·치명 **모든** 타격(막타 포함 — T2). 노드 지름 ×1.5 로 얹는다. 노드 스프라이트 자체의 흰 가산(머티리얼 _FlashAmount)과 **같이** 쓴다',
    draw(ctx, f, S) {
      const t = f / (this.frames - 1), N = makeNoise('hit_flash');
      const R = S * 0.3 * (1 + 0.16 * easeOutCubic(t));
      const fade = Math.pow(1 - t, 1.4);
      ctx.globalCompositeOperation = 'lighter';
      // 번짐 2겹(흰 + 청록기)
      glow(ctx, 0, 0, S * 0.5, TOK.white, 0.8 * fade, [[0, 1], [0.45, 0.55], [0.75, 0.16], [1, 0]]);
      glow(ctx, 0, 0, S * 0.48, mix(TOK.white, TOK.cyan, 0.55), 0.3 * fade);
      // 실루엣 판 — 노이즈 가장자리 · f0 꽉 찬 흰, 이후 속이 빈다
      const fillA = Math.pow(1 - t, 1.9);
      const fg = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R * 1.1);
      fg.addColorStop(0, rgba(TOK.white, fillA)); fg.addColorStop(0.6, rgba(TOK.white, fillA * 0.85));
      fg.addColorStop(0.9, rgba(mix(TOK.white, TOK.cyan, 0.3), fillA * 0.7)); fg.addColorStop(1, rgba(mix(TOK.white, TOK.cyan, 0.5), fillA * 0.4));
      ctx.fillStyle = fg; noisyBlob(ctx, N, R * (0.94 + 0.06 * t), 0.08, 1.7, 0); ctx.fill();
      if (t > 0) {   // 속 비우기 — 가운데부터 사라져 테두리만 남는다
        ctx.globalCompositeOperation = 'destination-out';
        const hr = R * 0.98 * easeOutCubic(Math.min(1, t * 1.5));
        const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, hr);
        hg.addColorStop(0, `rgba(0,0,0,${0.85 * clamp01(t * 1.6)})`); hg.addColorStop(0.7, `rgba(0,0,0,${0.5 * clamp01(t * 1.6)})`); hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      }
      // 겹 테두리 — 안쪽 딱딱한 흰 · 바깥 번지는 청록흰(조금 늦게 퍼진다)
      ctx.lineJoin = 'round';
      ctx.lineWidth = S * lerp(0.045, 0.012, t); ctx.strokeStyle = rgba(TOK.white, 1 - t * t);
      noisyBlob(ctx, N, R, 0.08, 1.7, 0); ctx.stroke();
      ctx.lineWidth = S * lerp(0.03, 0.008, t); ctx.strokeStyle = rgba(mix(TOK.white, TOK.cyan, 0.5), 0.65 * fade);
      noisyBlob(ctx, N, R * 1.06 + S * 0.08 * easeOutCubic(t), 0.1, 2.3, 1.9); ctx.stroke();
      // 방사 결 — 가는 광선 20개(노이즈 길이) · 섬광에 "재질"을 준다
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU + 0.11, nv = spread(N.ring(a, 3.1, 4.2, 2));
        const r0 = R * 0.45, r1 = R * (0.95 + 0.5 * nv) * (1 + 0.25 * t);
        const g = ctx.createLinearGradient(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
        g.addColorStop(0, rgba(TOK.white, 0)); g.addColorStop(0.6, rgba(TOK.white, 0.5 * fade * nv)); g.addColorStop(1, rgba(TOK.white, 0));
        ctx.strokeStyle = g; ctx.lineWidth = S * 0.012; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
      }
      // 십자 글린트(대각 굵게 · 수평수직 가늘게)
      const gl = Math.pow(1 - t, 1.2);
      if (gl > 0.05) {
        for (let k = 0; k < 4; k++) spike(ctx, k * Math.PI / 2 + Math.PI / 4, S * 0.03, S * 0.44 * gl * (k % 2 ? 0.72 : 1), S * 0.06, gl, [TOK.white, TOK.white, mix(TOK.white, TOK.cyan, 0.3), mix(TOK.white, TOK.cyan, 0.6)]);
        for (let k = 0; k < 4; k++) spike(ctx, k * Math.PI / 2, S * 0.03, S * 0.24 * gl, S * 0.028, gl * 0.8, [TOK.white, TOK.white, TOK.white, mix(TOK.white, TOK.cyan, 0.5)]);
        sparkle(ctx, 0, 0, S * 0.1 * gl, gl, TOK.white);
      }
    },
  };

  // ② 타격 임팩트 별 — 맞은 점에서 튀는 작은 섬광. 흰 코어 → 금 → 호박 → 잉걸.
  SHEETS.juice_impact_star = {
    frames: 12, cell: 128, fps: 60, pivot: [0.5, 0.5], blend: 'additive', tint: 'baked',
    use: '비치명 타격 지점(해머 착지점). 크리는 ×1.4 + 회전 무작위. 강도 I 로 크기 34→54px',
    draw(ctx, f, S) {
      const t = f / (this.frames - 1), N = makeNoise('impact_star');
      const rnd = mulberry32(seedOf('impact_star'));
      const pop = f === 0 ? 0.5 : f === 1 ? 0.88 : 1 + 0.1 * easeOutCubic(t);
      const coreA = t < 0.12 ? 1 : Math.pow(1 - (t - 0.12) / 0.88, 1.5);
      ctx.globalCompositeOperation = 'lighter';
      // 번짐 3겹 — 호박(넓게) · 금 · 흰
      glow(ctx, 0, 0, S * 0.46 * pop, HOT.amber, coreA * 0.45);
      glow(ctx, 0, 0, S * 0.28 * pop, HOT.gold, coreA * 0.8);
      glow(ctx, 0, 0, S * 0.14 * pop, TOK.white, coreA);
      // 열 아지랑이 — 노이즈 덩이 링(뜨거운 공기)
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU, nv = spread(N.ring(a, 2.4, t * 2, 3));
        const rr = S * (0.12 + 0.2 * easeOutCubic(t)) * (0.85 + 0.3 * nv);
        softDot(ctx, Math.cos(a) * rr, Math.sin(a) * rr, S * 0.07 * (0.6 + nv), ramp(HOT_RAMP, 0.25 + 0.5 * t + 0.2 * (1 - nv)), 0.28 * coreA * nv);
      }
      // 가는 충격 링
      if (t > 0.04) shockRing(ctx, S * (0.1 + 0.3 * easeOutCubic(t)), S * 0.028 * (1 - t), Math.pow(1 - t, 1.6) * 0.9, HOT.gold, HOT.ember);
      // 가시 — 굵은 4(15° 돌린 십자) + 중간 4 + 머리카락 8. 후반엔 뿌리가 떨어져 줄무늬가 된다
      const lenK = t < 0.15 ? lerp(0.55, 1, t / 0.15) : 1 - 0.72 * easeInQuad((t - 0.15) / 0.85);
      const wK = lerp(0.19, 0.03, easeOutQuad(t));
      const off = S * 0.28 * smooth(0.2, 1, t);
      const twist = 0.08 * t;
      for (let k = 0; k < 16; k++) {
        const tier = k < 4 ? 0 : k < 8 ? 1 : 2;
        const a = 0.26 + twist + (tier === 0 ? k * Math.PI / 2 : tier === 1 ? (k - 4) * Math.PI / 2 + Math.PI / 4 : rnd() * TAU) + (rnd() - 0.5) * 0.14;
        const L = S * [0.46, 0.3, 0.36][tier] * lenK * (0.88 + rnd() * 0.24);
        const w = S * wK * [1, 0.62, 0.22][tier];
        spike(ctx, a, off * (tier === 2 ? 1.2 : 1), L, w, coreA > 0.2 ? 1 : 0.65);
      }
      // 코어 — 딱딱한 흰 원
      if (coreA > 0.25) { ctx.fillStyle = rgba(TOK.white, coreA); ctx.beginPath(); ctx.arc(0, 0, S * 0.085 * pop * (0.5 + 0.5 * coreA), 0, TAU); ctx.fill(); }
      // 불티 12 — 꼬리 · 약한 중력 · 식어가는 색
      const r2 = mulberry32(seedOf('impact_star_emb'));
      for (let i = 0; i < 12; i++) {
        const a = r2() * TAU, sp = 0.6 + r2() * 0.5, w = S * (0.012 + r2() * 0.014);
        if (t < 0.1) continue;
        const u = (t - 0.1) / 0.9;
        const d = S * (0.1 + 0.32 * easeOutQuad(u) * sp), d0 = d - S * 0.07 * (1.1 - u);
        const gy = S * 0.05 * u * u;
        ember(ctx, Math.cos(a) * d0, Math.sin(a) * d0 + gy * 0.6, Math.cos(a) * d, Math.sin(a) * d + gy, w * (1.2 - u * 0.6), ramp(HOT_RAMP, 0.15 + 0.55 * u + (i % 3) * 0.08), 1 - easeInQuad(u));
      }
      // 반짝이 3 — 중반에 잠깐
      for (let i = 0; i < 3; i++) {
        const a = 0.9 + i * 2.2, d = S * (0.18 + 0.06 * i);
        const tw = Math.max(0, Math.sin((t - 0.2 - i * 0.12) * Math.PI / 0.45));
        if (t > 0.2 + i * 0.12 && t < 0.65 + i * 0.12) sparkle(ctx, Math.cos(a) * d, Math.sin(a) * d, S * 0.05, tw, HOT.gold);
      }
    },
  };

  // ③ 처치 버스트 — 가장 큰 사건. 전면 섬광 → 불덩이·가시 → 노이즈 불꽃 링 확장 → 링이 식으며 찢어지고 → 연기 가닥.
  SHEETS.juice_kill_burst = {
    frames: 16, cell: 256, fps: 48, pivot: [0.5, 0.5], blend: 'additive', tint: 'baked',
    use: '처치(막타) — **해머가 없는 자리**를 이것이 채운다. 강도 I 로 크기 68→176px · 티어 글로우를 아래에 곱해 깐다',
    draw(ctx, f, S) {
      const N = makeNoise('kill_burst');
      ctx.globalCompositeOperation = 'lighter';
      // f0 — 전면 섬광(흰 원판 + 노이즈 코로나)
      if (f === 0) {
        glow(ctx, 0, 0, S * 0.5, HOT.gold, 0.9, [[0, 1], [0.45, 0.7], [0.75, 0.22], [1, 0]]);
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * TAU, nv = spread(N.ring(a, 2.6, 0, 3));
          const rr = S * (0.2 + 0.07 * nv);
          softDot(ctx, Math.cos(a) * rr, Math.sin(a) * rr, S * (0.06 + 0.05 * nv), ramp(HOT_RAMP, 0.1 + 0.3 * (1 - nv)), 0.55);
        }
        ctx.fillStyle = TOK.white; ctx.beginPath(); ctx.arc(0, 0, S * 0.2, 0, TAU); ctx.fill();
        glow(ctx, 0, 0, S * 0.32, TOK.white, 1, [[0, 1], [0.7, 0.8], [1, 0]]);
        return;
      }
      const u = (f - 1) / (this.frames - 2);          // 0..1 (섬광 이후)
      const life = 1 - u;
      // 1. 바닥 번짐
      glow(ctx, 0, 0, S * (0.34 + 0.12 * u), HOT.amber, 0.55 * Math.pow(life, 1.5));
      glow(ctx, 0, 0, S * 0.47, HOT.red, 0.22 * life);
      // 2. 불덩이 코어 — 노이즈로 자리 잡은 덩이 26개 · 식으면서(램프 아래로) 부풀고 흩어진다
      const rc = mulberry32(seedOf('kill_core'));
      for (let i = 0; i < 26; i++) {
        const a = rc() * TAU, dk = rc(), sz = rc();
        const nv = N.fbm(Math.cos(a) * 1.3 + u * 1.8, Math.sin(a) * 1.3 + dk * 3, 3);
        const d = S * (0.03 + 0.14 * dk) * (0.5 + 1.1 * easeOutCubic(u));
        const x = Math.cos(a) * d, y = Math.sin(a) * d - S * 0.04 * u * u;
        const r = S * (0.035 + 0.05 * sz) * (1 + 0.9 * u);
        // 가산이 겹쳐 흰 떡이 되지 않게 알파를 낮게 · 램프는 금부터(흰 코어는 3.에서 따로)
        softDot(ctx, x, y, r, ramp(HOT_RAMP, 0.2 + 0.75 * u + 0.35 * (1 - spread(nv)) * u), 0.28 * Math.pow(life, 1.8) * (0.35 + 0.65 * spread(nv)));
      }
      // 3. 흰 코어(초반)
      if (u < 0.2) { const k = 1 - u / 0.2; ctx.fillStyle = rgba(TOK.white, k); ctx.beginPath(); ctx.arc(0, 0, S * (0.05 + 0.05 * k), 0, TAU); ctx.fill(); glow(ctx, 0, 0, S * 0.15, TOK.white, k * 0.7); }
      // 4. 가시 12 → 떨어져 나가 줄무늬
      const rs = mulberry32(seedOf('kill_burst'));
      const off = S * 0.36 * smooth(0.05, 1, u);
      const lenK = u < 0.08 ? 1 : 1 - 0.9 * easeOutQuad((u - 0.08) / 0.92);
      const wK = lerp(0.12, 0.018, easeOutQuad(u));
      for (let k = 0; k < 14; k++) {
        const major = k % 2 === 0;
        const a = k * TAU / 14 + 0.12 + (rs() - 0.5) * 0.3;
        const L = S * (major ? 0.4 : 0.26) * lenK * (0.85 + rs() * 0.3);
        spike(ctx, a, off * (major ? 1 : 0.85), L, S * wK * (major ? 1 : 0.55), Math.min(1, life * 1.6));
      }
      // 5. 노이즈 불꽃 링 — 덩이 96개가 원을 이룬다. 두께·밝기·반경을 fbm 이 흔들고, 후반엔 임계값이 올라가 찢어진다
      const ringR = S * 0.43 * (0.2 + 0.8 * easeOutCubic(u));
      const th = S * lerp(0.08, 0.022, u);
      const thr = lerp(0.2, 0.78, smooth(0.3, 1, u));
      const dens = clamp01(ringR / (S * 0.3));        // 반경이 작을 땐 덩이 96개가 겹쳐 흰 떡이 된다 — 둘레 밀도만큼 알파를 깎는다
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * TAU;
        const nv = spread(N.ring(a, 2.4, u * 1.6, 4));
        const keep = u < 0.3 ? 1 : smooth(thr - 0.1, thr + 0.1, nv);
        if (keep <= 0.01) continue;
        const r = ringR + (nv - 0.5) * th * 1.3;
        softDot(ctx, Math.cos(a) * r, Math.sin(a) * r, th * (0.35 + 0.65 * nv), ramp(HOT_RAMP, 0.18 + 0.68 * u + (0.5 - nv) * 0.55), keep * (1 - u * u) * 0.3 * dens * (0.3 + 0.7 * nv));
      }
      // 링의 딱딱한 안쪽 가장자리(초반만) — "충격"의 선명함
      if (u < 0.7) shockRing(ctx, ringR, th * 0.5, (1 - u / 0.7) * 0.95, HOT.gold, HOT.amber);
      // 6. 두 번째 링(적색 외곽 — 무게) — 더 느리고 얇게, 역시 노이즈로 끊긴다
      if (u > 0.06 && u < 0.85) {
        const r2 = ringR * 0.72, a2 = Math.sin((u - 0.06) / 0.79 * Math.PI) * 0.5;
        for (let i = 0; i < 64; i++) {
          const a = (i / 64) * TAU + 0.05, nv = spread(N.ring(a, 3.3, 7 + u, 3));
          softDot(ctx, Math.cos(a) * r2, Math.sin(a) * r2, th * 0.5 * (0.6 + nv), ramp(HOT_RAMP, 0.45 + 0.4 * u), a2 * nv);
        }
      }
      // 7. 불티 26 — 꼬리 · 중력 · 식는 색 · 굵은 것 몇 개는 반짝이 머리
      const re = mulberry32(seedOf('kill_embers'));
      for (let i = 0; i < 26; i++) {
        const a = re() * TAU, sp = 0.55 + re() * 0.5, w = S * (0.008 + re() * 0.012), big = re() < 0.2;
        if (u < 0.04) continue;
        const d = S * (0.1 + 0.36 * easeOutQuad(u) * sp), d0 = d - S * 0.07 * (1.15 - u);
        const gy = S * 0.06 * u * u;
        const x = Math.cos(a) * d, y = Math.sin(a) * d + gy;
        const al = 1 - easeInQuad(u);
        ember(ctx, Math.cos(a) * d0, Math.sin(a) * d0 + gy * 0.5, x, y, w * (1.3 - u * 0.6), ramp(HOT_RAMP, 0.1 + 0.6 * u + (i % 4) * 0.06), al);
        if (big && u < 0.7) sparkle(ctx, x, y, S * 0.035 * (1 - u), al, HOT.gold, a);
      }
      // 8. 연기 가닥(후반) — 가산이라 "빛받은 재" 로 읽힌다. 링 반경에서 바깥·위로 번진다
      if (u > 0.3) {
        const rw = mulberry32(seedOf('kill_smoke'));
        const sa = smooth(0.3, 0.55, u) * (1 - smooth(0.7, 1, u));
        for (let i = 0; i < 16; i++) {
          const a = rw() * TAU, k = rw();
          const nv = N.fbm(a * 2, u * 2 + k, 3);
          const d = ringR * (0.7 + 0.35 * k) + S * 0.03 * u;
          softDot(ctx, Math.cos(a) * d, Math.sin(a) * d - S * 0.05 * u, S * (0.05 + 0.05 * nv) * (1 + u), mix(HOT.ash, HOT.ember, 0.3 * (1 - u)), 0.2 * sa * spread(nv));
        }
      }
    },
  };

  // ④ 파편 칩 — 티어별. 행 = 모양 3종(바위 덩이 · 결정 조각 · 보석 부스러기), 열 = 회전 16프레임.
  //   회전 프레임은 **입자 각속도로 고른다**(애니메이션 재생이 아니라 인덱스 선택) — fps 는 참고값.
  const DEBRIS_SHAPES = ['rock', 'shard', 'sliver'];
  const DEBRIS_COLS = 16;
  const debrisGeo = new Map();
  function debrisBase(shape) {   // 모양 원형(단위원) + 이 빠진 가장자리 + 광맥 경로 — 시드 고정 · 한 번만 만든다
    let G = debrisGeo.get(shape);
    if (G) return G;
    const rnd = mulberry32(seedOf('debris3_' + shape)), N = makeNoise('debris3_' + shape);
    let verts;
    if (shape === 'rock') { verts = []; const n = 11; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (rnd() - 0.5) * 0.35; verts.push([a, 0.7 + 0.3 * spread(N.ring(a, 1.5, 0, 3))]); } }
    else if (shape === 'shard') verts = [[-Math.PI / 2, 1.0], [-0.75, 0.46], [-0.2, 0.4], [0.45, 0.58], [Math.PI / 2, 0.96], [Math.PI - 0.5, 0.42], [Math.PI + 0.25, 0.52], [Math.PI + 0.85, 0.44]];
    else verts = [[-Math.PI / 2 + 0.2, 0.95], [0.05, 0.6], [0.55, 0.82], [Math.PI - 0.55, 0.76], [Math.PI - 0.1, 0.48]];
    // 극 → 직교 + 이 빠짐(모서리 사이 작은 홈)
    const pts = [];
    for (let i = 0; i < verts.length; i++) {
      const [a, k] = verts[i], [b, m] = verts[(i + 1) % verts.length];
      const p = [Math.cos(a) * k, Math.sin(a) * k], q = [Math.cos(b) * m, Math.sin(b) * m];
      pts.push(p);
      if (rnd() < (shape === 'rock' ? 0.45 : 0.55)) {
        const s = 0.35 + rnd() * 0.3, dep = 0.07 + rnd() * 0.08;
        const mx = lerp(p[0], q[0], s), my = lerp(p[1], q[1], s), l = Math.hypot(mx, my) || 1;
        pts.push([lerp(p[0], q[0], s - 0.08), lerp(p[1], q[1], s - 0.08)]);
        pts.push([mx - (mx / l) * dep, my - (my / l) * dep]);
        pts.push([lerp(p[0], q[0], s + 0.08), lerp(p[1], q[1], s + 0.08)]);
      }
    }
    // 광맥(바위: 티어색 광석 줄 2~3 · 결정: 내부 결 1)
    const veins = [];
    const nv = shape === 'rock' ? 2 : 1;
    for (let v = 0; v < nv; v++) {
      let x = (rnd() - 0.5) * 0.7, y = (rnd() - 0.5) * 0.7, ang = rnd() * TAU;
      const line = [[x, y]];
      for (let s = 0; s < 6; s++) { ang += (N.n2(x * 3 + v * 5, y * 3) - 0.5) * 1.2; x += Math.cos(ang) * 0.11; y += Math.sin(ang) * 0.11; line.push([x, y]); }
      veins.push({ line, w: 0.035 + rnd() * 0.02 });
    }
    // 알갱이(바위 표면 입자)
    const grain = []; for (let i = 0; i < 26; i++) grain.push([(rnd() - 0.5) * 1.6, (rnd() - 0.5) * 1.6, rnd(), 0.018 + rnd() * 0.03]);
    G = { pts, veins, grain };
    debrisGeo.set(shape, G);
    return G;
  }
  function debrisDraw(tierKey) {
    return function (ctx, f, S) {
      const P = TIERS[tierKey];
      const shape = DEBRIS_SHAPES[Math.floor(f / DEBRIS_COLS)], rot = f % DEBRIS_COLS;
      const G = debrisBase(shape);
      const rock = shape === 'rock';
      const a = (rot / DEBRIS_COLS) * TAU;
      // 가짜 3D 텀블 — 회전에 따라 폭이 접힌다(동전 뒤집기) + 꼭대기(peak)가 돈다
      const fold = 0.6 + 0.4 * Math.abs(Math.cos(a * 0.5 + 0.4));
      const R = S * (rock ? 0.35 : shape === 'shard' ? 0.41 : 0.31);
      const ca = Math.cos(a), sa = Math.sin(a);
      const tf = (x, y) => { x *= fold * R; y *= R; return [x * ca - y * sa, x * sa + y * ca]; };
      const pts = G.pts.map(([x, y]) => tf(x, y));
      const pk = [Math.cos(a * 2 + 1) * R * 0.22, Math.sin(a * 2 + 1) * R * 0.18 - R * 0.08];
      const L = [-0.6, -0.8];
      const RR = rock ? P.rockRamp : P.ramp;
      const silhouette = (dx, dy) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)); ctx.closePath(); };
      // 그림자 판(두께감) — 아래·오른쪽
      ctx.fillStyle = rock ? P.rockDeep : P.deep;
      silhouette(S * 0.028, S * 0.042); ctx.fill();
      // 면 — peak 에서 각 변으로 삼각형. 법선·광원(좌상단)으로 램프를 고르고, 면 안에서 peak→변 방향으로 한 단 어두워진다(베벨)
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        const dx = mx - pk[0], dy = my - pk[1], len = Math.hypot(dx, dy) || 1;
        const lit = clamp01(0.5 + 0.62 * ((dx / len) * L[0] + (dy / len) * L[1]));
        const x0 = 1 - lit;                                   // 0 = 가장 밝음
        const g = ctx.createLinearGradient(pk[0], pk[1], mx, my);
        g.addColorStop(0, ramp(RR, x0 * 0.85 - 0.08)); g.addColorStop(1, ramp(RR, x0 * 0.85 + 0.12));
        ctx.fillStyle = g; ctx.strokeStyle = ramp(RR, x0 * 0.85 + 0.02); ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(pk[0], pk[1]); ctx.lineTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // 질감 — 실루엣으로 클립
      ctx.save(); silhouette(0, 0); ctx.clip();
      if (rock) {
        // 알갱이(밝은/어두운 점 — 거친 표면)
        for (const [gx, gy, k, r] of G.grain) { const [x, y] = tf(gx, gy); ctx.fillStyle = k > 0.5 ? rgba(P.rockHi, 0.35) : rgba(P.rockDeep, 0.55); ctx.beginPath(); ctx.arc(x, y, S * r * 0.8, 0, TAU); ctx.fill(); }
        // 광맥 — 짙은 홈 → 티어색 광석 → 밝은 심 → 가산 번짐
        for (const v of G.veins) {
          const line = v.line.map(([x, y]) => tf(x, y));
          const stroke = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); line.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
          stroke(S * v.w * 1.1, rgba(P.deep, 0.9));
          stroke(S * v.w * 0.75, P.mid);
          stroke(S * v.w * 0.45, P.base);
          stroke(S * v.w * 0.18, P.hi);
          ctx.globalCompositeOperation = 'lighter';
          stroke(S * v.w * 1.4, rgba(P.base, 0.18));
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        // 결정 — 속빛(가산) · peak→꼭짓점 내부 결선 · 반대편 속그늘
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, pk[0], pk[1], R * 0.9, P.light, 0.32);
        ctx.globalCompositeOperation = 'source-over';
        const far = [-pk[0] * 1.6 + R * 0.25, -pk[1] * 1.6 + R * 0.3];
        glow(ctx, far[0], far[1], R * 0.8, P.deep, 0.45);
        ctx.lineWidth = Math.max(0.6, S * 0.012);
        for (let i = 0; i < pts.length; i += 2) { ctx.strokeStyle = rgba(P.hi, 0.35); ctx.beginPath(); ctx.moveTo(pk[0], pk[1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
        for (const v of G.veins) {
          const line = v.line.map(([x, y]) => tf(x * 0.8, y * 0.8));
          ctx.strokeStyle = rgba(P.hi, 0.55); ctx.lineWidth = S * 0.018; ctx.lineCap = 'round';
          ctx.beginPath(); line.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        }
      }
      ctx.restore();
      // 외곽선 — 작은 크기에서 실루엣이 읽히게
      ctx.strokeStyle = rock ? P.rockDeep : P.deep;
      ctx.lineWidth = Math.max(1, S * 0.035); ctx.lineJoin = 'round';
      silhouette(0, 0); ctx.stroke();
      // 테두리 조명(rim light) — 광원 쪽 변마다 법선 정렬도만큼 밝게, 반대쪽 변은 짙은 AO
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const nx = (p[1] - q[1]), ny = (q[0] - p[0]), nl = Math.hypot(nx, ny) || 1;
        const d = -(nx * L[0] + ny * L[1]) / nl;
        if (d > 0.25) { ctx.strokeStyle = rock ? rgba(P.rockHi, 0.7 * d) : rgba(P.glint, 0.95 * d); ctx.lineWidth = Math.max(1, S * 0.03); }
        else if (d < -0.4) { ctx.strokeStyle = rgba(TOK.bgDeep, 0.5 * -d); ctx.lineWidth = Math.max(1, S * 0.025); }
        else continue;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      // 반짝이 — 회전 위상에 따라(결정은 peak, 바위는 광맥 한 점)
      const tw = Math.max(0, Math.cos(a * 2 + (rock ? 1.3 : 0)));
      if (tw > 0.25) {
        ctx.globalCompositeOperation = 'lighter';
        if (rock) { const v = G.veins[0].line[3]; const [x, y] = tf(v[0], v[1]); sparkle(ctx, x, y, S * 0.13 * tw, tw * 0.85, P.light); }
        else { glow(ctx, pk[0], pk[1], S * 0.18 * tw, P.glint, 0.7 * tw); sparkle(ctx, pk[0], pk[1], S * 0.2 * tw, tw, P.glint, 0.3); }
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }
  for (const k of Object.keys(TIERS)) {
    SHEETS['juice_debris_' + k] = {
      frames: DEBRIS_COLS * 3, cols: DEBRIS_COLS, rows: 3, cell: 64, fps: 0, pivot: [0.5, 0.5], blend: 'alpha', tint: 'baked', tier: k,
      use: `처치 파편 입자(${TIERS[k].label}). 행 0 바위 · 1 결정 · 2 보석 — 입자마다 행 하나를 고르고 **회전각으로 열(0~${DEBRIS_COLS - 1})을 고른다**(재생 아님). 중력·바운스는 코드`,
      draw: debrisDraw(k),
    };
  }

  // ⑤ 먼지 퍼프 — 알파 블렌드, 회백. 덩이마다 볕(좌상단)·그늘(우하단)·노이즈 혹 · 후반엔 노이즈 구멍으로 흩어진다.
  SHEETS.juice_dust_puff = {
    frames: 16, cell: 128, fps: 40, pivot: [0.5, 0.62], blend: 'alpha', tint: 'runtime',
    use: '처치 바닥 먼지(파편 아래 깔림). 회백으로 구워 티어색을 **살짝**(30%) 곱한다',
    draw(ctx, f, S) {
      const t = f / (this.frames - 1), N = makeNoise('dust_puff');
      const rnd = mulberry32(seedOf('dust_puff3'));
      const alpha = t < 0.08 ? lerp(0.75, 1, t / 0.08) : Math.pow(1 - (t - 0.08) / 0.92, 1.25);
      const grow = 0.5 + 0.8 * easeOutCubic(t);
      const puffs = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU + rnd() * 0.5;
        const d = i < 3 ? S * 0.03 * rnd() : S * (0.07 + rnd() * 0.14);
        puffs.push({ a, d, r: S * (0.075 + rnd() * 0.055) * (i < 3 ? 1.45 : 1), up: rnd(), ph: rnd() * TAU });
      }
      const pos = puffs.map(p => {
        const d = p.d * (0.55 + 1.35 * easeOutQuad(t)) + S * 0.05 * t;
        return { p, x: Math.cos(p.a) * d, y: Math.sin(p.a) * d * 0.62 - S * 0.08 * t * (0.4 + p.up), r: p.r * grow };
      }).sort((A, B) => A.y - B.y);   // 뒤(위)부터 — 앞 덩이가 뒤를 덮는다
      // 바닥 치마 — 넓고 납작한 그늘
      ctx.save(); ctx.scale(1, 0.34);
      softDot(ctx, 0, S * 0.18, S * 0.42 * grow, DUST_RAMP[4], 0.35 * alpha);
      ctx.restore();
      const body = (x, y, r, a) => {
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.05, x, y, r);
        // 볕 받은 점만 밝고 몸통은 중간 회색 — 여러 개가 겹쳐도 흰 떡이 안 되게(v2 와 같은 명도대)
        g.addColorStop(0, rgba(DUST_RAMP[1], a)); g.addColorStop(0.25, rgba(DUST_RAMP[2], a * 0.95));
        g.addColorStop(0.55, rgba(DUST_RAMP[3], a * 0.85)); g.addColorStop(0.82, rgba(DUST_RAMP[4], a * 0.55)); g.addColorStop(1, rgba(DUST_RAMP[4], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      };
      for (const { p, x, y, r } of pos) {
        // 그늘 로브(우하단) → 몸통 → 노이즈 혹 3개(가장자리 요철)
        softDot(ctx, x + r * 0.18, y + r * 0.22, r * 1.02, DUST_RAMP[5], 0.42 * alpha);
        body(x, y, r, alpha * 0.92);
        for (let k = 0; k < 3; k++) {
          const ka = p.ph + k * 2.1, nv = spread(N.fbm(Math.cos(ka) * 2 + p.a, Math.sin(ka) * 2 + t * 1.5, 3));
          const kx = x + Math.cos(ka) * r * 0.62, ky = y + Math.sin(ka) * r * 0.5;
          body(kx, ky, r * (0.35 + 0.3 * nv), alpha * 0.7 * nv);
        }
      }
      // 떠오르는 가닥(후반) — 작은 덩이가 위로 풀려 나간다
      if (t > 0.25) {
        const rw = mulberry32(seedOf('dust_wisp'));
        for (let i = 0; i < 6; i++) {
          const x = (rw() - 0.5) * S * 0.5, k = rw();
          const u = (t - 0.25) / 0.75;
          body(x + Math.sin(u * 3 + k * 6) * S * 0.03, -S * (0.06 + 0.22 * u * (0.6 + 0.6 * k)), S * (0.035 + 0.03 * k) * (1 + u), alpha * 0.5 * (1 - u));
        }
      }
      // 갉아먹기 — 노이즈가 높은 자리부터 부드러운 구멍 · 결 고운 점 구멍(입자감)
      // (작은 점 구멍은 어두운 배경 위에서 "곰보"로 읽혀 뺐다 — 크고 부드러운 구멍만, 후반에만)
      if (t > 0.3) {
        const u = (t - 0.3) / 0.7;
        ctx.globalCompositeOperation = 'destination-out';
        const r2 = mulberry32(seedOf('dust_erode3'));
        for (let i = 0; i < 26; i++) {
          const x = (r2() - 0.5) * S * 0.8, y = (r2() - 0.5) * S * 0.55 - S * 0.04, rk = r2();
          const nv = spread(N.fbm(x / S * 4 + 3, y / S * 4 - 2, 3));
          if (nv < 0.62 - 0.5 * u) continue;
          const r = S * (0.07 + rk * 0.07) * (0.7 + 0.8 * u);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(0,0,0,${0.2 + 0.6 * u})`); g.addColorStop(0.5, `rgba(0,0,0,${0.1 + 0.3 * u})`); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  };

  // ⑥ 균열 — 노드 안에서 **빛이 새는** 금. 가산 · 흰 코어 + 청록 번짐 · 가지 치는 지터 균열 · 잉걸 반짝이.
  const crackGeo = { segs: null, joints: null };
  function crackBase() {
    if (crackGeo.segs) return crackGeo;
    const rnd = mulberry32(seedOf('crack3')), N = makeNoise('crack');
    const segs = [], joints = [];
    function grow(x, y, ang, len, w, depth, dist) {
      const n = 4 + (rnd() * 3 | 0), step = len / n;
      for (let s = 0; s < n; s++) {
        ang += (rnd() - 0.5) * 0.7 + (N.n2(x * 6 + depth, y * 6) - 0.5) * 0.9;
        const nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
        const k = s / n;
        segs.push({ x0: x, y0: y, x1: nx, y1: ny, w0: w * (1 - 0.55 * k), w1: w * (1 - 0.55 * (k + 1 / n)), d0: dist, d1: dist + step, depth });
        dist += step; x = nx; y = ny;
        if (depth < 2 && s > 0 && s < n - 1 && rnd() < 0.42) {
          joints.push([x, y, dist]);
          grow(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.55 + rnd() * 0.5), len * (0.38 + rnd() * 0.15), w * 0.55, depth + 1, dist);
        }
      }
      joints.push([x, y, dist]);
    }
    const n = 7;
    for (let i = 0; i < n; i++) grow(0, 0, (i / n) * TAU + (rnd() - 0.5) * 0.5, 0.34 + rnd() * 0.12, 0.7 + rnd() * 0.4, 0, 0);
    crackGeo.segs = segs; crackGeo.joints = joints;
    return crackGeo;
  }
  SHEETS.juice_crack = {
    frames: 8, cell: 128, fps: 60, pivot: [0.5, 0.5], blend: 'additive', tint: 'runtime',
    use: '막타 직후 노드 위 0.13s — "안에서 터진다". 흰색 코어는 그대로, 번짐은 티어색 곱',
    draw(ctx, f, S) {
      const t = f / (this.frames - 1), G = crackBase(), N = makeNoise('crack');
      const front = lerp(0.16, 0.52, easeOutCubic(Math.min(1, t / 0.38)));   // 균열 앞머리(중심에서의 경로 거리)
      const coreA = t < 0.4 ? 1 : 1 - 0.85 * smooth(0.4, 1, t);
      const glowA = t < 0.5 ? lerp(0.7, 1, t / 0.5) : lerp(1, 0.4, (t - 0.5) / 0.5);
      const glowW = lerp(0.11, 0.17, smooth(0, 0.7, t));
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      glow(ctx, 0, 0, S * 0.28, TOK.cyan, glowA * 0.45);
      glow(ctx, 0, 0, S * 0.12, TOK.white, coreA * 0.6);
      const pass = (wk, col, a) => {
        for (const s of G.segs) {
          if (s.d0 >= front) continue;
          const k = Math.min(1, (front - s.d0) / (s.d1 - s.d0));
          const x1 = lerp(s.x0, s.x1, k) * S, y1 = lerp(s.y0, s.y1, k) * S;
          ctx.strokeStyle = rgba(col, a * (s.depth ? 0.8 : 1)); ctx.lineWidth = Math.max(0.5, S * wk * (s.w0 + s.w1) / 2);
          ctx.beginPath(); ctx.moveTo(s.x0 * S, s.y0 * S); ctx.lineTo(x1, y1); ctx.stroke();
        }
      };
      pass(glowW, CRACK_RAMP[4], glowA * 0.3);
      pass(glowW * 0.6, CRACK_RAMP[3], glowA * 0.5);
      pass(0.05, CRACK_RAMP[2], glowA * 0.8);
      pass(0.03, CRACK_RAMP[1], glowA);
      pass(0.017, ramp(CRACK_RAMP, 0.25 * smooth(0.4, 1, t)), coreA);
      // 잉걸 반짝이 — 가지 갈림점에서 명멸(노이즈)
      for (let i = 0; i < G.joints.length; i++) {
        const [x, y, d] = G.joints[i];
        if (d > front) continue;
        const fl = N.n2(i * 3.7, f * 0.85);
        if (fl < 0.45) continue;
        sparkle(ctx, x * S, y * S, S * (0.03 + 0.04 * fl) * (1 - 0.4 * t), (fl - 0.45) * 1.8 * Math.max(0.35, coreA), mix(TOK.white, TOK.cyan, 0.4), i);
      }
      // 튀는 부스러기 빛(후반) — 금에서 바깥으로
      if (t > 0.3) {
        const r2 = mulberry32(seedOf('crack_chips'));
        const u = (t - 0.3) / 0.7;
        for (let i = 0; i < 12; i++) {
          const j = G.joints[(r2() * G.joints.length) | 0], a = Math.atan2(j[1], j[0]) + (r2() - 0.5) * 0.8;
          const d = S * 0.08 * easeOutQuad(u) * (0.6 + r2());
          const x = j[0] * S + Math.cos(a) * d, y = j[1] * S + Math.sin(a) * d;
          if (Math.hypot(x, y) > S * 0.46) continue;
          softDot(ctx, x, y, S * 0.018, CRACK_RAMP[1], 0.8 * (1 - u));
        }
      }
      if (coreA > 0.1) { ctx.fillStyle = rgba(TOK.white, coreA); ctx.beginPath(); ctx.arc(0, 0, S * 0.045, 0, TAU); ctx.fill(); }
    },
  };

  // ⑦ 스파크 줄무늬 — 머리 흰 · 꼬리 금→호박→적. 입자가 속도 방향으로 돌려 쓴다(오른쪽 = 진행 방향).
  SHEETS.juice_spark_trail = {
    frames: 8, cell: 64, fps: 32, pivot: [0.8, 0.5], blend: 'additive', tint: 'baked',
    use: '처치·크리 타격에서 튀는 불티. **pivot = 머리**(0.8,0.5) · 입자 속도 방향으로 회전 · 수명에 맞춰 프레임 진행',
    draw(ctx, f, S) {
      const t = f / (this.frames - 1), N = makeNoise('spark');
      const hx = S * 0.3;             // 셀 중심 기준 머리 x (pivot 0.8)
      const len = S * lerp(0.74, 0.22, Math.pow(t, 1.1));
      const w = S * lerp(0.16, 0.065, t);
      const a = lerp(1, 0.45, Math.pow(t, 1.3));
      const cool = 0.3 * t;           // 식을수록 램프가 아래로
      ctx.globalCompositeOperation = 'lighter';
      const tear = (L, W, stops) => {
        const g = ctx.createLinearGradient(hx, 0, hx - L, 0);
        stops.forEach(([o, c, k]) => g.addColorStop(o, rgba(c, k)));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(hx + W * 0.35, 0);
        ctx.quadraticCurveTo(hx + W * 0.1, -W / 2, hx - L * 0.28, -W * 0.3);
        ctx.quadraticCurveTo(hx - L * 0.7, -W * 0.08, hx - L, 0);
        ctx.quadraticCurveTo(hx - L * 0.7, W * 0.08, hx - L * 0.28, W * 0.3);
        ctx.quadraticCurveTo(hx + W * 0.1, W / 2, hx + W * 0.35, 0); ctx.fill();
      };
      // 바깥 헤일로 → 몸통 램프 → 흰 심지
      tear(len * 1.05, w * 1.9, [[0, ramp(HOT_RAMP, 0.3 + cool), a * 0.35], [0.4, ramp(HOT_RAMP, 0.55 + cool), a * 0.18], [1, HOT.red, 0]]);
      tear(len, w, [[0, TOK.white, a], [0.14, ramp(HOT_RAMP, 0.18 + cool), a], [0.4, ramp(HOT_RAMP, 0.4 + cool), a * 0.8], [0.72, ramp(HOT_RAMP, 0.62 + cool), a * 0.4], [1, HOT.red, 0]]);
      tear(len * 0.55, w * 0.36, [[0, TOK.white, a], [0.5, HOT.hot, a * 0.7], [1, HOT.gold, 0]]);
      // 머리 번짐 + 코어
      glow(ctx, hx, 0, w * 1.5, HOT.gold, a * 0.65);
      ctx.fillStyle = rgba(TOK.white, a); ctx.beginPath(); ctx.arc(hx, 0, w * 0.3, 0, TAU); ctx.fill();
      // 떨어져 나가는 잔불티 3 — 꼬리를 따라 뒤처진다
      for (let i = 0; i < 3; i++) {
        const k = 0.35 + i * 0.22 + 0.1 * t, x = hx - len * k;
        const y = (N.n2(i * 4.1, f * 0.6) - 0.5) * w * 1.6;
        softDot(ctx, x, y, w * (0.32 - i * 0.06), ramp(HOT_RAMP, 0.25 + i * 0.15 + cool), a * (0.9 - i * 0.2));
        ctx.fillStyle = rgba(HOT.hot, a * (0.9 - i * 0.25)); ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, w * 0.08), 0, TAU); ctx.fill();
      }
    },
  };

  // 시트 이름 목록(표시 순서)
  const ORDER = ['juice_hit_flash', 'juice_impact_star', 'juice_kill_burst', 'juice_debris_t1', 'juice_debris_t2', 'juice_debris_t3', 'juice_debris_t4', 'juice_dust_puff', 'juice_crack', 'juice_spark_trail'];

  // ───────────────────────── 굽기 · 캐시 ─────────────────────────
  const frameCache = new Map();
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function meta(name) {
    const d = SHEETS[name];
    const cols = d.cols || d.frames, rows = d.rows || 1;
    return {
      name, file: `${name}_${rows > 1 ? 'sheet' : 'strip'}.png`,
      cell: [d.cell, d.cell], frames: d.frames, cols, rows, size: [d.cell * cols, d.cell * rows],
      fps: d.fps, duration: d.fps ? +(d.frames / d.fps).toFixed(3) : null, pivot: d.pivot,
      blend: d.blend, tint: d.tint, loop: false, use: d.use, version: 'v3',
    };
  }
  // 한 프레임을 scale 배로 구운 캔버스(캐시).
  function frame(name, f, scale) {
    scale = scale || 1;
    const key = name + '|' + f + '|' + scale;
    let c = frameCache.get(key);
    if (c) return c;
    const d = SHEETS[name];
    const S = d.cell * scale;
    c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.translate(S / 2, S / 2);
    d.draw(ctx, f, S);
    ctx.restore();
    frameCache.set(key, c);
    return c;
  }
  // 시트(스트립/그리드) 한 장.
  function sheet(name, scale) {
    scale = scale || 1;
    const m = meta(name), d = SHEETS[name], S = d.cell * scale;
    const c = makeCanvas(S * m.cols, S * m.rows), ctx = c.getContext('2d');
    for (let f = 0; f < m.frames; f++) ctx.drawImage(frame(name, f, scale), (f % m.cols) * S, Math.floor(f / m.cols) * S);
    return c;
  }
  // 게임 좌표에 프레임 하나 그리기 — pivot 을 x,y 에 맞춘다. size = 표시 한 변(px).
  function drawFrame(ctx, name, f, x, y, size, opt) {
    opt = opt || {};
    const d = SHEETS[name];
    f = Math.max(0, Math.min(d.frames - 1, f | 0));
    const scale = size > d.cell * 1.3 ? 2 : 1;           // 크게 그릴 땐 2배 굽기(흐림 방지)
    const img = frame(name, f, scale);
    ctx.save();
    ctx.globalAlpha = (opt.alpha == null ? 1 : opt.alpha) * ctx.globalAlpha;
    if (d.blend === 'additive' && !opt.normal) ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    if (opt.rot) ctx.rotate(opt.rot);
    if (opt.sx) ctx.scale(opt.sx, 1);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -size * d.pivot[0], -size * d.pivot[1], size, size);
    ctx.restore();
  }
  // 경과 시간(초) → 프레임 인덱스. 끝나면 -1.
  function frameAt(name, t, speed) {
    const d = SHEETS[name];
    const f = Math.floor(t * d.fps * (speed || 1));
    return f >= d.frames ? -1 : f;
  }
  function lifeOf(name, speed) { const d = SHEETS[name]; return d.frames / d.fps / (speed || 1); }

  // ───────────────────────── 강도 레시피(T4) ─────────────────────────
  // I = clamp01(log10(reward)/8). 한 함수가 모든 시트의 크기·수·색을 같이 민다(플랜 T4 "단일 함수").
  // v3: 표시 크기(px)는 v2 와 **같다** — 셀 해상도만 올렸다(더 선명, 더 크지 않음).
  function intensity(reward) { return clamp01(Math.log10(Math.max(1, reward)) / 8); }
  function killRecipe(I, lowMotion) {
    const r = {
      burstPx: Math.round(68 + 108 * I),        // juice_kill_burst 표시 크기(목업 축척 0.47× 기준)
      burstSpeed: 1 + 0.25 * (1 - I),            // 작은 처치는 약간 빨리 끝난다
      tierGlowPx: Math.round(40 + 70 * I),       // 버스트 아래 티어색 글로우
      debris: Math.round(4 + 8 * I),             // 원하는 파편 수(T3 예산이 자른다)
      sparks: Math.round(2 + 6 * I),             // 스파크 줄무늬 수(같은 예산)
      chipPx: [13 + 5 * I, 19 + 9 * I],          // 칩 표시 크기 범위
      dustPx: Math.round(44 + 50 * I),
      crackPx: null,                             // 노드 지름 × 1.5 (코드)
      secondRing: I >= 0.6,                      // 적색 외곽 링을 한 겹 더
      tint: I < 0.34 ? '티어색 위주 · 금 가시 약하게(알파 0.7)' : I < 0.67 ? '티어 글로우 + 금 램프 그대로' : '금·호박 램프 + 적 외곽 링 추가',
      burstAlpha: I < 0.34 ? 0.7 : 1,
    };
    if (lowMotion) { r.debris = Math.floor(r.debris * 0.5); r.sparks = Math.floor(r.sparks * 0.5); r.burstPx = Math.round(r.burstPx * 0.7); }
    return r;
  }
  function hitRecipe(I, crit) {
    return {
      starPx: Math.round((34 + 20 * I) * (crit ? 1.4 : 1)),
      flashK: 1.5,                                // 노드 지름 배수
      sparks: crit ? Math.round(1 + 2 * I) : 0,
    };
  }

  // ───────────────────────── 데미지 숫자(T1) — 스프라이트 아님, 폰트 스펙 ─────────────────────────
  const DMG = {
    font: "'BlackHanSansRuntime','Black Han Sans','Noto Sans KR',sans-serif",
    fontName: 'BlackHanSans-Regular (--font-title)',
    sizeMin: 14, sizeMax: 34, critMul: 1.35,
    // size(pt) = (14 + 20·clamp01(log10(dmg)/8)) × (크리 ? 1.35 : 1)
    size(dmg, crit) { return (this.sizeMin + (this.sizeMax - this.sizeMin) * intensity(dmg)) * (crit ? this.critMul : 1); },
    outline: { color: TOK.bgDeep, widthK: 0.2 },    // 외곽선 두께 = 크기 × 0.2 (TMP Outline 0.2 대응)
    fill: { normal: [TOK.white, TOK.num], crit: [mix(TOK.white, TOK.gold, 0.3), TOK.gold, TOK.amber] },
    critGlow: { color: TOK.amber, blurK: 0.45 },    // TMP Underlay(dilate) 대응
    // 펀치: 0 → 1.25 (60ms) → 1.0 (120ms), 이후 상승 easeOutCubic 40px(목업 축척) · 수명 0.8s · 끝 0.25s 페이드
    punchKeys: [[0, 0.2], [0.06, 1.25], [0.12, 1.0]],
    life: 0.8, rise: 40, fadeTail: 0.25,
    punch(t) {
      const k = this.punchKeys;
      if (t >= k[2][0]) return 1;
      if (t < k[1][0]) return lerp(k[0][1], k[1][1], easeOutQuad(t / k[1][0]));
      return lerp(k[1][1], k[2][1], (t - k[1][0]) / (k[2][0] - k[1][0]));
    },
  };
  function fmtNum(n) {
    n = Math.round(n);
    if (n < 10000) return n.toLocaleString('en-US');
    const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, s] of u) if (n >= v) { const x = n / v; return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + s; }
    return String(n);
  }
  // 데미지 숫자 한 개. px = 표시 크기(이미 축척 반영), scale = 펀치 배율. 크리도 느낌표 없음(owner 2026-09-29).
  function drawDamageNumber(ctx, text, x, y, px, crit, alpha, scale) {
    ctx.save();
    ctx.globalAlpha = clamp01(alpha == null ? 1 : alpha) * ctx.globalAlpha;
    ctx.translate(x, y); if (scale && scale !== 1) ctx.scale(scale, scale);
    if (crit) ctx.rotate(-0.06);
    ctx.font = `${px.toFixed(1)}px ${DMG.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (crit) { ctx.shadowColor = rgba(DMG.critGlow.color, 0.9); ctx.shadowBlur = px * DMG.critGlow.blurK; }
    ctx.lineWidth = Math.max(2, px * DMG.outline.widthK); ctx.strokeStyle = DMG.outline.color; ctx.strokeText(text, 0, 0);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, -px * 0.45, 0, px * 0.45);
    const st = crit ? DMG.fill.crit : DMG.fill.normal;
    st.forEach((c, i) => g.addColorStop(i / (st.length - 1), c));
    ctx.fillStyle = g; ctx.fillText(text, 0, 0);
    if (crit) { ctx.lineWidth = Math.max(1, px * 0.04); ctx.strokeStyle = rgba(TOK.white, 0.5); ctx.strokeText(text, 0, -px * 0.02); }
    ctx.restore();
  }

  global.JuiceFx = {
    VERSION: 'v3',
    TOK, HOT, HOT_RAMP, TIERS, SHEETS, ORDER, DEBRIS_SHAPES, DMG,
    mix, rgba, clamp01, lerp, easeOutCubic, easeOutQuad, easeInQuad, mulberry32, seedOf, makeNoise, ramp,
    meta, frame, sheet, drawFrame, frameAt, lifeOf, intensity, killRecipe, hitRecipe, drawDamageNumber, fmtNum, glow,
  };
})(window);
