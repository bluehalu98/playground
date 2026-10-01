/*
 * run-juice-fx-common-v2.js — ⛔ 동결 사본(v2 · 2026-09-29 main 128f67fd 시점) — 고치지 말 것
 * ──────────────────────────────────────────────────────────────────────
 * v3 고퀄 드로잉(html/run-juice-fx-common.js)과 **정직하게 나란히 비교**하려고 남긴 v2 원본이다.
 * 전역 이름만 JuiceFx → JuiceFxV2 로 바꿨고 드로잉 코드는 한 글자도 안 바꿨다.
 * 쓰는 곳: run-juice-fx-sprites.html §E(v2 vs v3) · run-vfx-juice-compare.html?fx=v2
 * ──────────────────────────────────────────────────────────────────────
 * (이하 v2 원문 헤더)
 * run-juice-fx-common.js — 런 타격감(주스) VFX 프레임 드로잉 모듈 (공용)
 * ──────────────────────────────────────────────────────────────────────
 * ⚠ 동기화 필수 — 이 파일이 **유일한 정본**이다.
 *   - html/run-juice-fx-sprites.html  : 이 함수로 시트를 굽고 PNG 로 내보낸다(에셋 생성기)
 *   - html/run-vfx-juice-compare.html : 이 함수로 「강화안」 패널을 그린다(비교 목업)
 *   두 페이지가 같은 파일을 <script src> 로 읽으므로 **목업에서 보는 프레임 = 내보내는 프레임**이다.
 *   그림을 바꾸려면 이 파일만 고친다. 페이지 쪽에 드로잉 사본을 두지 말 것.
 *
 * 플랜: docs/plans/03-qa-pending/phase-1/run-vfx-juice-plan.md §3 T1~T4 · §10(에셋 파이프라인)
 * 색  : html/ui-prototype.html 토큰(:62-104)만 쓴다. 명암은 토큰끼리/토큰과 흰색·배경색의 **혼합**으로 만든다(신규 색 0).
 * 결정성: 모든 난수는 시트 이름으로 시드한 mulberry32 — 몇 번을 구워도 같은 픽셀이 나온다.
 */
(function (global) {
  'use strict';

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
  function rgba(h, a) { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

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

  // ───────────────────────── 팔레트 ─────────────────────────
  // 불꽃 램프(가산 시트 공용): 흰 코어 → 금 → 호박 → 적 — 뜨거운 것일수록 안쪽.
  const HOT = {
    core: TOK.white,
    hot: mix(TOK.white, TOK.gold, 0.35),
    gold: TOK.gold,
    amber: TOK.amber,
    red: TOK.red,
  };
  // 티어 팔레트 — 맵 1~4 의 광물 색. 토큰 1개 + 흰색/배경 혼합으로 5단 명암을 만든다.
  function tierPal(base, glint) {
    return {
      base,
      light: mix(base, TOK.white, 0.55),
      hi: mix(base, TOK.white, 0.82),
      mid: mix(base, TOK.bg, 0.25),
      dark: mix(base, TOK.bg, 0.62),
      deep: mix(base, TOK.bgDeep, 0.84),
      glint: glint || TOK.white,
      rock: mix(TOK.muted, TOK.bg, 0.45),
      rockLight: mix(TOK.muted, TOK.white, 0.15),
      rockDark: mix(TOK.muted, TOK.bgDeep, 0.78),
    };
  }
  const TIERS = {
    t1: Object.assign(tierPal(TOK.teal), { label: 'T1 · 맵 1 · teal' }),
    t2: Object.assign(tierPal(TOK.purple), { label: 'T2 · 맵 2 · purple' }),
    t3: Object.assign(tierPal(TOK.amber, mix(TOK.gold, TOK.white, 0.5)), { label: 'T3 · 맵 3 · amber' }),
    t4: Object.assign(tierPal(TOK.red, TOK.gold), { label: 'T4 · 맵 4 · red+gold' }),
  };

  // ───────────────────────── 드로잉 프리미티브 ─────────────────────────
  function glow(ctx, x, y, r, color, a, stops) {
    if (r <= 0 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    (stops || [[0, 1], [0.25, 0.6], [0.6, 0.18], [1, 0]]).forEach(([o, k]) => g.addColorStop(o, rgba(color, a * k)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 가시(스파이크) — 뿌리 넓고 끝 뾰족한 연 모양. 뿌리→끝 선형 경사(흰→금→호박→투명).
  function spike(ctx, ang, r0, len, w, a, ramp) {
    if (len <= 0 || a <= 0) return;
    const c = Math.cos(ang), s = Math.sin(ang), px = -s, py = c;
    const x0 = c * r0, y0 = s * r0, x1 = c * (r0 + len), y1 = s * (r0 + len);
    const xm = c * (r0 + len * 0.22), ym = s * (r0 + len * 0.22);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    const R = ramp || [HOT.core, HOT.gold, HOT.amber];
    g.addColorStop(0, rgba(R[0], a)); g.addColorStop(0.35, rgba(R[1], a * 0.95)); g.addColorStop(0.75, rgba(R[2], a * 0.6)); g.addColorStop(1, rgba(R[2], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - c * w * 0.3, y0 - s * w * 0.3);
    ctx.lineTo(xm + px * w / 2, ym + py * w / 2);
    ctx.lineTo(x1, y1);
    ctx.lineTo(xm - px * w / 2, ym - py * w / 2);
    ctx.closePath(); ctx.fill();
  }
  // 충격 링 — 안쪽은 비고, 안쪽 가장자리가 **딱딱하게 밝고**, 바깥으로 부드럽게 사라진다.
  function shockRing(ctx, r, th, a, inner, outer, arcs) {
    if (r <= 0 || a <= 0 || th <= 0) return;
    const r0 = Math.max(0.01, r - th), r1 = r + th * 0.9;
    const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
    g.addColorStop(0, rgba(inner, 0));
    g.addColorStop(0.28, rgba(inner, a * 0.5));
    g.addColorStop(0.46, rgba(TOK.white, a));
    g.addColorStop(0.56, rgba(inner, a * 0.9));
    g.addColorStop(0.8, rgba(outer, a * 0.35));
    g.addColorStop(1, rgba(outer, 0));
    ctx.fillStyle = g;
    if (!arcs) {
      ctx.beginPath(); ctx.arc(0, 0, r1, 0, Math.PI * 2); ctx.arc(0, 0, r0, 0, Math.PI * 2, true); ctx.fill('evenodd');
      return;
    }
    // 부서지는 링 — 호 조각만
    for (const [a0, a1] of arcs) {
      ctx.beginPath(); ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, r0, a1, a0, true); ctx.closePath(); ctx.fill();
    }
  }
  function blobPath(ctx, pts, r) {
    ctx.beginPath();
    const n = pts.length;
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], q = pts[(i + 1) % n];
      const x = Math.cos(p[0]) * r * p[1], y = Math.sin(p[0]) * r * p[1];
      const mx = (x + Math.cos(q[0]) * r * q[1]) / 2, my = (y + Math.sin(q[0]) * r * q[1]) / 2;
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(x, y, mx, my);
    }
    ctx.closePath();
  }

  // ───────────────────────── 시트 정의 ─────────────────────────
  // draw(ctx, f, S, opt): ctx 원점 = 셀 중심(pivot 적용 전), S = 셀 한 변(px). 셀 밖으로 안 나가게 그린다.
  const SHEETS = {};

  // ① 피격 흰 플래시 — 노드 실루엣 위에 얹는 가산 섬광. 흰색 고정(런타임 색 곱 가능).
  SHEETS.juice_hit_flash = {
    frames: 4, cell: 64, fps: 50, pivot: [0.5, 0.5], blend: 'additive', tint: 'runtime',
    use: '비치명·치명 **모든** 타격(막타 포함 — T2). 노드 지름 ×1.5 로 얹는다. 노드 스프라이트 자체의 흰 가산(머티리얼 _FlashAmount)과 **같이** 쓴다',
    draw(ctx, f, S) {
      const rnd = mulberry32(seedOf('hit_flash'));
      const pts = []; const n = 9;
      for (let i = 0; i < n; i++) pts.push([(i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4, 0.82 + rnd() * 0.22]);
      const t = f / 3;
      const R = S * 0.36 * (1 + 0.14 * easeOutQuad(t));
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, S * 0.5, TOK.white, [0.9, 0.6, 0.3, 0.1][f], [[0, 1], [0.55, 0.55], [0.8, 0.2], [1, 0]]);
      // 실루엣 판 — f0 꽉 찬 흰, 이후 속이 빈다
      const fillA = [1, 0.62, 0.22, 0.06][f];
      const fg = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R * 1.05);
      fg.addColorStop(0, rgba(TOK.white, fillA)); fg.addColorStop(0.7, rgba(TOK.white, fillA * 0.85)); fg.addColorStop(1, rgba(mix(TOK.white, TOK.cyan, 0.3), fillA * 0.6));
      ctx.fillStyle = fg; blobPath(ctx, pts, R * (f === 0 ? 0.92 : 1)); ctx.fill();
      // 딱딱한 테두리
      ctx.lineWidth = S * [0.05, 0.06, 0.045, 0.025][f];
      ctx.strokeStyle = rgba(TOK.white, [1, 0.95, 0.7, 0.35][f]);
      blobPath(ctx, pts, R); ctx.stroke();
      // 십자 글린트
      const gl = [0.5, 0.42, 0.22, 0][f];
      if (gl > 0) for (let k = 0; k < 4; k++) spike(ctx, k * Math.PI / 2 + Math.PI / 4, S * 0.04, S * gl * (k % 2 ? 0.7 : 1), S * 0.07, [1, 0.8, 0.5][f], [TOK.white, TOK.white, TOK.white]);
    },
  };

  // ② 타격 임팩트 별 — 맞은 점에서 튀는 작은 섬광. 흰 코어 → 금 → 호박.
  SHEETS.juice_impact_star = {
    frames: 6, cell: 64, fps: 30, pivot: [0.5, 0.5], blend: 'additive', tint: 'baked',
    use: '비치명 타격 지점(해머 착지점). 크리는 ×1.4 + 회전 무작위. 강도 I 로 크기 34→54px',
    draw(ctx, f, S) {
      const rnd = mulberry32(seedOf('impact_star'));
      const t = f / 5;
      const sc = [0.45, 0.9, 1, 1.05, 1.08, 1.1][f];
      const coreA = [1, 1, 0.8, 0.5, 0.25, 0.08][f];
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, S * 0.46 * sc, HOT.amber, coreA * 0.55);
      glow(ctx, 0, 0, S * 0.26 * sc, HOT.gold, coreA * 0.9);
      // 가시 — 굵은 4개(십자를 15° 돌림) + 가는 4개
      const ang0 = 0.26;
      const w = [0.2, 0.15, 0.1, 0.065, 0.045, 0.03][f];
      const lenK = [0.55, 1, 1, 0.85, 0.6, 0.4][f];
      const off = [0, 0, 0.04, 0.12, 0.2, 0.26][f];   // 뿌리가 떨어져 나가 **줄무늬**가 된다
      for (let k = 0; k < 8; k++) {
        const major = k % 2 === 0;
        const a = ang0 + k * Math.PI / 4 + (rnd() - 0.5) * 0.18;
        const L = S * (major ? 0.44 : 0.27) * lenK * (0.9 + rnd() * 0.2);
        spike(ctx, a, S * off, L, S * w * (major ? 1 : 0.6), coreA > 0.2 ? 1 : 0.6);
      }
      // 코어 — 딱딱한 흰 원
      if (f < 4) { ctx.fillStyle = rgba(TOK.white, [1, 1, 0.85, 0.4][f]); ctx.beginPath(); ctx.arc(0, 0, S * [0.1, 0.11, 0.08, 0.05][f], 0, Math.PI * 2); ctx.fill(); }
      // 불티
      if (f >= 2) {
        const r2 = mulberry32(seedOf('impact_star_emb'));
        for (let i = 0; i < 6; i++) {
          const a = r2() * Math.PI * 2, d = S * (0.18 + 0.26 * t) * (0.8 + r2() * 0.4);
          const x = Math.cos(a) * d, y = Math.sin(a) * d;
          ctx.fillStyle = rgba(i % 2 ? HOT.gold : TOK.white, 1 - t * 0.8);
          ctx.beginPath(); ctx.arc(x, y, S * 0.022 * (1.2 - t), 0, Math.PI * 2); ctx.fill();
        }
      }
    },
  };

  // ③ 처치 버스트 — 가장 큰 사건. 전면 섬광 → 가시 → 충격 링 확장 → 링이 호로 부서지며 소멸.
  SHEETS.juice_kill_burst = {
    frames: 8, cell: 128, fps: 24, pivot: [0.5, 0.5], blend: 'additive', tint: 'baked',
    use: '처치(막타) — **해머가 없는 자리**를 이것이 채운다. 강도 I 로 크기 68→176px · 티어 글로우를 아래에 곱해 깐다',
    draw(ctx, f, S) {
      const t = f / 7;
      ctx.globalCompositeOperation = 'lighter';
      // 전면 섬광(f0~f1)
      if (f === 0) {
        glow(ctx, 0, 0, S * 0.5, HOT.gold, 0.9, [[0, 1], [0.45, 0.7], [0.75, 0.25], [1, 0]]);
        ctx.fillStyle = TOK.white; ctx.beginPath(); ctx.arc(0, 0, S * 0.24, 0, Math.PI * 2); ctx.fill();
        glow(ctx, 0, 0, S * 0.34, TOK.white, 1, [[0, 1], [0.7, 0.8], [1, 0]]);
        return;
      }
      // 코어 잔광
      const coreA = [0, 1, 0.8, 0.55, 0.35, 0.2, 0.1, 0.04][f];
      glow(ctx, 0, 0, S * (0.32 + 0.1 * t), HOT.amber, coreA * 0.7);
      glow(ctx, 0, 0, S * (0.18 + 0.04 * t), HOT.gold, coreA);
      if (f <= 3) { ctx.fillStyle = rgba(TOK.white, [0, 1, 0.8, 0.45][f]); ctx.beginPath(); ctx.arc(0, 0, S * [0, 0.13, 0.1, 0.06][f], 0, Math.PI * 2); ctx.fill(); }
      // 가시 8개 → 떨어져 나가 줄무늬
      const rnd = mulberry32(seedOf('kill_burst'));
      const off = [0, 0, 0.05, 0.12, 0.2, 0.27, 0.33, 0.38][f];
      const lenK = [0, 1, 0.95, 0.75, 0.55, 0.38, 0.24, 0.12][f];
      const wK = [0, 0.13, 0.1, 0.07, 0.05, 0.035, 0.025, 0.02][f];
      for (let k = 0; k < 10; k++) {
        const major = k % 2 === 0;
        const a = k * Math.PI / 5 + 0.12 + (rnd() - 0.5) * 0.3;
        const L = S * (major ? 0.4 : 0.26) * lenK * (0.85 + rnd() * 0.3);
        spike(ctx, a, S * off, L, S * wK * (major ? 1 : 0.6), 1);
      }
      // 충격 링 — 반경 easeOutCubic, 두께는 얇아지고 f5 부터 호로 부서진다
      const rr = S * 0.47 * (0.28 + 0.72 * easeOutCubic((f - 1) / 6));
      const th = S * [0, 0.09, 0.075, 0.06, 0.048, 0.036, 0.026, 0.018][f];
      const ra = [0, 1, 1, 0.95, 0.8, 0.6, 0.4, 0.22][f];
      let arcs = null;
      if (f >= 5) {
        const r3 = mulberry32(seedOf('kill_ring_arcs'));
        arcs = []; const n = 7; const gap = [0, 0, 0, 0, 0, 0.25, 0.42, 0.6][f];
        for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2 + r3() * 0.2; const span = (Math.PI * 2 / n) * (1 - gap * (0.7 + r3() * 0.6)); arcs.push([a0, a0 + span]); }
      }
      shockRing(ctx, rr, th, ra, HOT.gold, HOT.amber, arcs);
      // 두 번째 얇은 링(적색 외곽 — 무게)
      if (f >= 2 && f <= 6) shockRing(ctx, rr * 0.72, th * 0.45, ra * 0.5, HOT.amber, HOT.red, null);
      // 불티 12개 — 꼬리 달린 점
      const r4 = mulberry32(seedOf('kill_embers'));
      for (let i = 0; i < 12; i++) {
        const a = r4() * Math.PI * 2, sp = 0.6 + r4() * 0.4;
        if (f < 2) break;
        const d = S * (0.12 + 0.36 * easeOutQuad(t) * sp), d0 = d - S * 0.06 * (1.2 - t);
        const x = Math.cos(a) * d, y = Math.sin(a) * d, x0 = Math.cos(a) * d0, y0 = Math.sin(a) * d0;
        const col = i % 3 === 0 ? TOK.white : i % 3 === 1 ? HOT.gold : HOT.amber;
        const al = 1 - easeInQuad(t);
        ctx.strokeStyle = rgba(col, al * 0.7); ctx.lineWidth = S * 0.018 * (1.2 - t); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = rgba(col, al); ctx.beginPath(); ctx.arc(x, y, S * 0.014 * (1.3 - t), 0, Math.PI * 2); ctx.fill();
      }
    },
  };

  // ④ 파편 칩 — 티어별. 행 = 모양 3종(바위 덩이 · 결정 조각 · 보석 부스러기), 열 = 회전 8프레임.
  //   회전 프레임은 **입자 각속도로 고른다**(애니메이션 재생이 아니라 인덱스 선택) — fps 는 참고값.
  const DEBRIS_SHAPES = ['rock', 'shard', 'sliver'];
  function debrisDraw(tierKey) {
    return function (ctx, f, S) {
      const P = TIERS[tierKey];
      const shape = DEBRIS_SHAPES[Math.floor(f / 8)], rot = f % 8;
      const rnd = mulberry32(seedOf('debris_' + shape));
      // 윤곽 꼭짓점(단위원 기준)
      let verts;
      if (shape === 'rock') { verts = []; const n = 7; for (let i = 0; i < n; i++) verts.push([(i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5, 0.72 + rnd() * 0.28]); }
      else if (shape === 'shard') verts = [[-Math.PI / 2, 1.0], [-0.35, 0.42], [0.5, 0.55], [Math.PI / 2, 0.95], [Math.PI - 0.45, 0.4], [Math.PI + 0.35, 0.5]];
      else verts = [[-Math.PI / 2 + 0.2, 0.95], [0.55, 0.8], [Math.PI - 0.4, 0.75]];
      const a = (rot / 8) * Math.PI * 2;
      // 가짜 3D 텀블 — 회전에 따라 폭이 접힌다(동전 뒤집기) + 꼭대기(peak)가 돈다
      const fold = 0.62 + 0.38 * Math.abs(Math.cos(a * 0.5 + 0.4));
      const R = S * (shape === 'rock' ? 0.36 : shape === 'shard' ? 0.42 : 0.3);
      const pts = verts.map(([ang, k]) => {
        let x = Math.cos(ang) * k * R, y = Math.sin(ang) * k * R;
        x *= fold;
        const c = Math.cos(a), s = Math.sin(a);
        return [x * c - y * s, x * s + y * c];
      });
      const pk = [Math.cos(a * 2 + 1) * R * 0.22, Math.sin(a * 2 + 1) * R * 0.18 - R * 0.08];
      // 그림자 판(두께감) — 1px 아래·오른쪽
      ctx.fillStyle = shape === 'rock' ? P.rockDark : P.deep;
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + S * 0.03, y + S * 0.045) : ctx.moveTo(x + S * 0.03, y + S * 0.045)); ctx.closePath(); ctx.fill();
      // 면 — peak 에서 각 변으로 삼각형. 법선·광원(좌상단)으로 명암
      const L = [-0.6, -0.8];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const mx = (p[0] + q[0]) / 2 - pk[0], my = (p[1] + q[1]) / 2 - pk[1];
        const len = Math.hypot(mx, my) || 1;
        const lit = clamp01(0.5 + 0.62 * ((mx / len) * L[0] + (my / len) * L[1]));
        let col;
        if (shape === 'rock') col = lit > 0.72 ? P.rockLight : lit > 0.45 ? P.rock : lit > 0.22 ? mix(P.rock, P.rockDark, 0.5) : P.rockDark;
        else col = lit > 0.78 ? P.hi : lit > 0.55 ? P.light : lit > 0.3 ? P.base : lit > 0.14 ? P.mid : P.dark;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(pk[0], pk[1]); ctx.lineTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke(); // 면 사이 틈 메움
      }
      // 바위에 박힌 광맥(티어색 반점)
      if (shape === 'rock') {
        const r2 = mulberry32(seedOf('rock_vein'));
        for (let i = 0; i < 2; i++) {
          const vx = (r2() - 0.5) * R * 0.9, vy = (r2() - 0.5) * R * 0.8;
          const c = Math.cos(a), s = Math.sin(a);
          const x = vx * fold * c - vy * s, y = vx * fold * s + vy * c;
          ctx.fillStyle = i ? P.light : P.base;
          ctx.beginPath(); ctx.moveTo(x, y - R * 0.2); ctx.lineTo(x + R * 0.13, y); ctx.lineTo(x, y + R * 0.2); ctx.lineTo(x - R * 0.13, y); ctx.closePath(); ctx.fill();
        }
      }
      // 외곽선 — 작은 크기에서 실루엣이 읽히게(짙은 1px)
      ctx.strokeStyle = shape === 'rock' ? mix(P.rockDark, TOK.bgDeep, 0.5) : P.deep;
      ctx.lineWidth = Math.max(1, S * 0.04); ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
      // 밝은 모서리 하이라이트(광원 쪽 변 하나)
      let best = 0, bi = 0;
      for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const nx = (p[1] - q[1]), ny = (q[0] - p[0]); const d = -(nx * L[0] + ny * L[1]) / (Math.hypot(nx, ny) || 1); if (d > best) { best = d; bi = i; } }
      const p = pts[bi], q = pts[(bi + 1) % pts.length];
      ctx.strokeStyle = shape === 'rock' ? rgba(TOK.white, 0.55) : rgba(P.glint, 0.95);
      ctx.lineWidth = Math.max(1, S * 0.035);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      // 결정·보석 글린트(회전 위상에 따라 반짝임)
      if (shape !== 'rock') {
        const tw = Math.max(0, Math.cos(a * 2));
        if (tw > 0.2) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, pk[0], pk[1], S * 0.16 * tw, P.glint, 0.85 * tw);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba(TOK.white, tw); ctx.beginPath(); ctx.arc(pk[0], pk[1], S * 0.035, 0, Math.PI * 2); ctx.fill();
        }
      }
    };
  }
  for (const k of Object.keys(TIERS)) {
    SHEETS['juice_debris_' + k] = {
      frames: 24, cols: 8, rows: 3, cell: 32, fps: 0, pivot: [0.5, 0.5], blend: 'alpha', tint: 'baked', tier: k,
      use: `처치 파편 입자(${TIERS[k].label}). 행 0 바위 · 1 결정 · 2 보석 — 입자마다 행 하나를 고르고 **회전각으로 열(0~7)을 고른다**(재생 아님). 중력·바운스는 코드`,
      draw: debrisDraw(k),
    };
  }

  // ⑤ 먼지 퍼프 — 알파 블렌드, 회백. 퍼프마다 좌상단 하이라이트 · 우하단 그림자 · 후반엔 갉아먹혀 사라진다.
  SHEETS.juice_dust_puff = {
    frames: 8, cell: 64, fps: 20, pivot: [0.5, 0.62], blend: 'alpha', tint: 'runtime',
    use: '처치 바닥 먼지(파편 아래 깔림). 회백으로 구워 티어색을 **살짝**(30%) 곱한다',
    draw(ctx, f, S) {
      const t = f / 7;
      const rnd = mulberry32(seedOf('dust_puff'));
      const base = mix(TOK.muted, TOK.white, 0.35), shade = mix(TOK.muted, TOK.bg, 0.4), hi = mix(TOK.muted, TOK.white, 0.8);
      const puffs = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rnd() * 0.6;
        const d = i === 0 ? 0 : S * (0.08 + rnd() * 0.12);
        puffs.push({ a, d, r: S * (0.1 + rnd() * 0.07) * (i === 0 ? 1.3 : 1), up: rnd() });
      }
      const alpha = [0.95, 0.92, 0.85, 0.72, 0.55, 0.38, 0.22, 0.1][f];
      const grow = 0.55 + 0.75 * easeOutCubic(t);
      for (const p of puffs) {
        const d = p.d * (0.6 + 1.3 * easeOutQuad(t)) + S * 0.05 * t;
        const x = Math.cos(p.a) * d, y = Math.sin(p.a) * d * 0.7 - S * 0.07 * t * (0.5 + p.up);
        const r = p.r * grow;
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        g.addColorStop(0, rgba(hi, alpha)); g.addColorStop(0.45, rgba(base, alpha * 0.9)); g.addColorStop(0.85, rgba(shade, alpha * 0.55)); g.addColorStop(1, rgba(shade, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      // 갉아먹기(후반) — 구멍이 늘며 흩어져 보인다
      if (f >= 3) {
        const r2 = mulberry32(seedOf('dust_erode'));
        ctx.globalCompositeOperation = 'destination-out';
        const holes = (f - 2) * 9;
        for (let i = 0; i < holes; i++) {
          // 부드러운 가장자리 구멍 — 딱딱한 구멍은 어두운 배경 위에서 "검은 점"으로 읽힌다
          const x = (r2() - 0.5) * S * 0.8, y = (r2() - 0.5) * S * 0.6, r = S * (0.04 + r2() * 0.07) * (0.6 + t);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(0,0,0,${0.35 + 0.45 * t})`); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  };

  // ⑥ 균열 — 노드 안에서 **빛이 새는** 금. 가산 · 흰 코어 + 청록 번짐. 시드 고정 분기.
  SHEETS.juice_crack = {
    frames: 4, cell: 64, fps: 30, pivot: [0.5, 0.5], blend: 'additive', tint: 'runtime',
    use: '막타 직후 노드 위 0.13s — "안에서 터진다". 흰색 코어는 그대로, 번짐은 티어색 곱',
    draw(ctx, f, S) {
      const rnd = mulberry32(seedOf('crack'));
      const branches = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const base = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
        const pts = [[0, 0]]; let x = 0, y = 0, ang = base;
        const segs = 3 + (rnd() * 2 | 0), len = S * (0.3 + rnd() * 0.14);
        for (let s = 0; s < segs; s++) { ang += (rnd() - 0.5) * 0.9; x += Math.cos(ang) * len / segs; y += Math.sin(ang) * len / segs; pts.push([x, y]); }
        const sub = [];
        if (rnd() < 0.8) { const k = 1 + (rnd() * (segs - 1) | 0); const [sx, sy] = pts[k]; const sa = ang + (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.5); sub.push([[sx, sy], [sx + Math.cos(sa) * S * 0.1, sy + Math.sin(sa) * S * 0.1]]); }
        branches.push({ pts, sub, w: 0.7 + rnd() * 0.5 });
      }
      const reveal = [0.45, 1, 1, 1][f];
      const coreA = [1, 1, 0.75, 0.35][f];
      const glowA = [0.5, 0.8, 1, 0.45][f];
      const glowW = [0.07, 0.09, 0.13, 0.12][f];
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      glow(ctx, 0, 0, S * 0.22, TOK.cyan, glowA * 0.6);
      const path = (b) => {
        ctx.beginPath();
        const total = b.pts.length - 1, upto = total * reveal;
        ctx.moveTo(0, 0);
        for (let i = 1; i <= Math.ceil(upto); i++) {
          const p = b.pts[i], q = b.pts[i - 1], k = Math.min(1, upto - (i - 1));
          ctx.lineTo(q[0] + (p[0] - q[0]) * k, q[1] + (p[1] - q[1]) * k);
        }
        if (reveal >= 1) for (const [a, c] of b.sub) { ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
      };
      for (const b of branches) { path(b); ctx.strokeStyle = rgba(TOK.cyan, glowA * 0.45); ctx.lineWidth = S * glowW * b.w; ctx.stroke(); }
      for (const b of branches) { path(b); ctx.strokeStyle = rgba(mix(TOK.cyan, TOK.white, 0.5), glowA * 0.8); ctx.lineWidth = S * 0.045 * b.w; ctx.stroke(); }
      for (const b of branches) { path(b); ctx.strokeStyle = rgba(TOK.white, coreA); ctx.lineWidth = S * 0.022 * b.w; ctx.stroke(); }
      ctx.fillStyle = rgba(TOK.white, coreA); ctx.beginPath(); ctx.arc(0, 0, S * 0.05, 0, Math.PI * 2); ctx.fill();
    },
  };

  // ⑦ 스파크 줄무늬 — 머리 흰 · 꼬리 금→호박. 입자가 속도 방향으로 돌려 쓴다(오른쪽 = 진행 방향).
  SHEETS.juice_spark_trail = {
    frames: 4, cell: 32, fps: 16, pivot: [0.8, 0.5], blend: 'additive', tint: 'baked',
    use: '처치·크리 타격에서 튀는 불티. **pivot = 머리**(0.8,0.5) · 입자 속도 방향으로 회전 · 수명에 맞춰 프레임 진행',
    draw(ctx, f, S) {
      const hx = S * 0.3;             // 셀 중심 기준 머리 x (pivot 0.8)
      const len = S * [0.7, 0.6, 0.42, 0.24][f];
      const w = S * [0.16, 0.13, 0.1, 0.07][f];
      const a = [1, 0.9, 0.7, 0.45][f];
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(hx, 0, hx - len, 0);
      g.addColorStop(0, rgba(TOK.white, a)); g.addColorStop(0.2, rgba(HOT.gold, a * 0.95)); g.addColorStop(0.6, rgba(HOT.amber, a * 0.55)); g.addColorStop(1, rgba(HOT.red, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(hx + w * 0.3, 0); ctx.quadraticCurveTo(hx, -w / 2, hx - len * 0.3, -w * 0.3); ctx.lineTo(hx - len, 0); ctx.lineTo(hx - len * 0.3, w * 0.3); ctx.quadraticCurveTo(hx, w / 2, hx + w * 0.3, 0); ctx.fill();
      glow(ctx, hx, 0, w * 1.4, HOT.gold, a * 0.7);
      ctx.fillStyle = rgba(TOK.white, a); ctx.beginPath(); ctx.arc(hx, 0, w * 0.32, 0, Math.PI * 2); ctx.fill();
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
      blend: d.blend, tint: d.tint, loop: false, use: d.use,
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
  // 데미지 숫자 한 개. px = 표시 크기(이미 축척 반영), scale = 펀치 배율.
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

  global.JuiceFxV2 = {
    TOK, HOT, TIERS, SHEETS, ORDER, DEBRIS_SHAPES, DMG,
    mix, rgba, clamp01, lerp, easeOutCubic, easeOutQuad, easeInQuad, mulberry32, seedOf,
    meta, frame, sheet, drawFrame, frameAt, lifeOf, intensity, killRecipe, hitRecipe, drawDamageNumber, fmtNum, glow,
  };
})(window);
