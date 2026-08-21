(function () {
  "use strict";

  const BIT_OD = 4.5;
  const FIXED = 1 / 60;
  const UTILS = {
    gas: { short: "GAS", color: "#d6b325" },
    electric: { short: "ELEC", color: "#c44536" },
    water: { short: "H2O", color: "#3b7eb5" },
    sewer: { short: "SEW", color: "#5d8f4e" },
    fiber: { short: "FO", color: "#c36b2a" },
    storm: { short: "STM", color: "#6a8b86" },
  };
  const KINDS = Object.keys(UTILS);

  const JOBS = [
    {
      id: "service", name: "Backyard Service", sub: "160 ft gas drop", length: 160, maxDepth: 22,
      target: 8.5, entry: 3.4, exit: 4.0, utilities: 6, bend: 9, cruise: 15,
      product: { name: "2 in PE gas", odIn: 2.375, color: "#d6b325" },
      reamers: [6, 8, 10],
      pipes: [
        { name: "2 in PE gas", odIn: 2.375, color: "#d6b325" },
        { name: "4 in PE water", odIn: 4.5, color: "#3b7eb5" },
      ],
      brief: "Pilot to the meter pit, pre-ream, then pull product. Bigger iron, tighter locates.",
    },
    {
      id: "fiber", name: "Neighborhood Fiber", sub: "240 ft mainline", length: 240, maxDepth: 26,
      target: 10, entry: 3.6, exit: 4.2, utilities: 11, bend: 10, cruise: 16,
      product: { name: "1.25 in HDPE duct", odIn: 1.66, color: "#c36b2a" },
      reamers: [6, 8, 10],
      pipes: [
        { name: "1.25 in HDPE duct", odIn: 1.66, color: "#c36b2a" },
        { name: "2 in PE gas", odIn: 2.375, color: "#d6b325" },
      ],
      brief: "Tight easement. Gas, fiber, and storm stack mid-shot - a fat reamer will kiss them.",
    },
    {
      id: "downtown", name: "Main Street", sub: "320 ft crossing", length: 320, maxDepth: 32,
      target: 14, entry: 4.0, exit: 4.5, utilities: 17, bend: 11, cruise: 17,
      product: { name: "6 in C900 water", odIn: 6.9, color: "#3b7eb5" },
      reamers: [8, 10, 12, 16],
      pipes: [
        { name: "4 in PE water", odIn: 4.5, color: "#3b7eb5" },
        { name: "6 in C900 water", odIn: 6.9, color: "#3b7eb5" },
        { name: "8 in HDPE sewer", odIn: 8.625, color: "#5d8f4e" },
      ],
      brief: "Downtown nest. 6 in C900 wants a solid hole. 16 in is a hog.",
    },
  ];

  function radiusFt(od) { return od / 24; }
  function recommendedReamOd(od) { return Math.max(6, Math.ceil((od * 1.5) / 2) * 2); }
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function designY(x, job) {
    const L = job.length, down = Math.min(48, L * 0.2), up = L * 0.78;
    if (x <= 0) return job.entry;
    if (x < down) return job.entry + (job.target - job.entry) * smooth(x / down);
    if (x > up) return job.target + (job.exit - job.target) * smooth((x - up) / Math.max(1, L - up));
    return job.target + Math.sin(x * 0.045) * 0.35;
  }
  function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function turnToward(cur, want, max) {
    const d = wrap(want - cur);
    return wrap(cur + Math.max(-max, Math.min(max, d)));
  }
  function distCapsule(px, py, x, y, half) {
    const ax = x - half, bx = x + half;
    const t = Math.max(0, Math.min(1, (px - ax) / Math.max(1e-4, bx - ax)));
    return Math.hypot(px - (ax + (bx - ax) * t), py - y);
  }
  function distPoly(x, y, path) {
    if (path.length < 2) return 0;
    let best = 999;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (Math.max(a.x, b.x) < x - 5 || Math.min(a.x, b.x) > x + 5) continue;
      const abx = b.x - a.x, aby = b.y - a.y, len2 = abx * abx + aby * aby || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
      const d = Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
      if (d < best) best = d;
    }
    return best;
  }
  function remainingClear(path, pipes, toolR) {
    let dist = 99, kind = null, sta = 0;
    for (const p of pipes) {
      const rem = distPoly(p.x, p.y, path) - p.r - toolR;
      if (rem < dist) { dist = rem; kind = p.kind; sta = p.x; }
    }
    return { dist, kind, sta };
  }

  let mode = "menu";
  let job = JOBS[0];
  let sim = null;
  let view = { camX: 0, camY: 0, trauma: 0, freeze: 0, flash: 0, time: 0, particles: [], floaters: [] };
  let muted = false;
  let keys = new Set();
  let joy = { x: 0, y: 0 };
  let yawBtn = 0;
  let coarse = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  let acc = 0, last = performance.now();

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const uiEl = document.getElementById("ui");
  const hudEl = document.getElementById("hud");
  const hudbar = document.getElementById("hudbar");
  const nearEl = document.getElementById("near");
  const stickEl = document.getElementById("stick");
  const knobEl = document.getElementById("knob");
  const yawEl = document.getElementById("yaw");

  function fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
  }

  function placePipes(job, rng) {
    const pipes = [];
    let guard = 0;
    while (pipes.length < job.utilities && guard++ < job.utilities * 20) {
      const x = 18 + rng() * (job.length - 30);
      const gy = designY(x, job);
      const r = 0.3 + rng() * 0.5;
      const half = rng() < 0.2 ? 1.2 + rng() * 3 : 0;
      let y = rng() < 0.34 ? gy : rng() < 0.72 ? gy + (rng() < 0.5 ? -1 : 1) * (1.2 + rng() * 2.2) : 2.8 + rng() * (job.maxDepth - 4.5);
      y = Math.max(r + 1.7, Math.min(job.maxDepth - r - 0.7, y));
      let ok = true;
      for (const p of pipes) {
        if (distCapsule(x, y, p.x, p.y, p.half + half) < p.r + r + 1.5) { ok = false; break; }
      }
      if (!ok) continue;
      pipes.push({ kind: KINDS[Math.floor(rng() * KINDS.length)], x, y, r, half, cleared: false, minClear: 99 });
    }
    return pipes;
  }

  function createSim(jobDef, seed) {
    const j = JSON.parse(JSON.stringify(jobDef));
    const rng = mulberry(seed);
    return {
      job: j, x: 5.2, y: j.entry, heading: 0.38, speed: j.cruise * 0.8,
      path: [{ x: 5.2, y: j.entry }], trail: [{ x: 5.2, y: j.entry }],
      pipes: placePipes(j, rng), score: 0, footage: 0, clears: 0,
      onGradeAcc: 0, onGradeSamples: 0, alive: true, won: false, failReason: "",
      nearestDist: 99, nearestKind: null, lastPathX: 5.2,
      phase: "pilot", phaseGate: null,
      tool: { kind: "head", name: "4.5 in bit", odIn: BIT_OD, color: "#c5ccd1" },
      toolR: radiusFt(BIT_OD), holeR: radiusFt(BIT_OD), stuckTime: 0, reamPasses: 0,
    };
  }

  function beginPass(tool) {
    const end = sim.path[sim.path.length - 1];
    sim.tool = tool;
    sim.toolR = radiusFt(tool.odIn);
    sim.phase = tool.kind === "pipe" ? "pull" : "ream";
    sim.phaseGate = null;
    sim.alive = true; sim.won = false; sim.failReason = ""; sim.stuckTime = 0;
    sim.x = end ? end.x : sim.job.length - 2;
    sim.y = end ? end.y : sim.job.exit;
    sim.heading = Math.PI;
    sim.speed = sim.job.cruise * (tool.kind === "pipe" ? 0.62 : 0.72);
    sim.trail = [{ x: sim.x, y: sim.y }];
    sim.lastPathX = sim.x;
    sim.nearestDist = 99; sim.nearestKind = null;
    view.floaters.push({ x: sim.x, y: sim.y - 2, text: "HOOKED " + tool.name, life: 1.1, max: 1.1 });
    view.freeze = 0.16;
  }

  function fail(reason) {
    sim.alive = false; sim.won = false; sim.failReason = reason; sim.phaseGate = null;
    view.trauma = 1; view.freeze = 0.12; view.flash = 0.65;
  }

  // CONTINUED IN game.part2.js
