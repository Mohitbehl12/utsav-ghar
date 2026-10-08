/**
 * Small looping "video" of Diwali crackers — rockets, anaar (flower pot), chakri and
 * phuljhadi — drawn live on a canvas. Weighs a few KB instead of a multi-MB video file,
 * stays sharp on every screen, pauses when off-screen, and respects reduced-motion.
 * Sound is off by default (synthesised pops/whistles, no audio file) and only plays after a tap.
 */
import { useEffect, useRef, useState } from 'react';

const LOOP = 12; // seconds, for the progress bar
const COLORS = ['#FFD36E', '#FF7A45', '#FF4D8D', '#8FE3FF', '#B98CFF', '#7CFF9B', '#FFF4D6'];

function makeAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination);
  const noise = (dur) => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    return b;
  };
  return {
    ctx,
    boom(size = 1) {
      const s = ctx.createBufferSource(); s.buffer = noise(0.9);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700 + 500 * size;
      const g = ctx.createGain(); g.gain.value = 0.6 * size;
      s.connect(f).connect(g).connect(master); s.start();
    },
    whistle() {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain(); g.gain.value = 0.05;
      const t = ctx.currentTime;
      o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.9);
      g.gain.setValueAtTime(0.05, t); g.gain.linearRampToValueAtTime(0, t + 0.9);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.95);
    },
    close() { ctx.close().catch(() => {}); },
  };
}

export default function FireworksVideo({ title = 'Diwali night', className = '' }) {
  const canvas = useRef(null);
  const wrap = useRef(null);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [playing, setPlaying] = useState(!reduce);
  const [sound, setSound] = useState(false);
  const bar = useRef(null);
  const st = useRef({ visible: true, audio: null, sound: false });
  st.current.sound = sound;

  useEffect(() => {
    const c = canvas.current; const g = c.getContext('2d');
    let W = 0; let H = 0; let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = c.clientWidth; H = c.clientHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintSky(true);
    };
    const stars = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.1 + 0.3, t: Math.random() * 6 }));
    const parts = []; const rockets = [];
    let last = performance.now(); let clock = 0; let nextRocket = 0.3; let raf = 0;

    function paintSky(full) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0B0718'); sky.addColorStop(0.7, '#2A1236'); sky.addColorStop(1, '#4A1A2E');
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = full ? 1 : 0.28; // leaves soft trails
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    function burst(x, y, big) {
      const col = COLORS[Math.floor(Math.random() * COLORS.length)];
      const col2 = Math.random() < 0.4 ? COLORS[Math.floor(Math.random() * COLORS.length)] : col;
      const n = big ? 70 : 44; const sp = (big ? 95 : 70) * (H / 180);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.1; const v = sp * (0.55 + Math.random() * 0.45);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.4 + Math.random() * 0.6, age: 0, col: i % 2 ? col : col2, size: 1.6, drag: 0.985, grav: 38, twinkle: Math.random() < 0.3 });
      }
      if (st.current.sound && st.current.audio) st.current.audio.boom(big ? 1 : 0.7);
    }
    function spark(x, y, vx, vy, col, life, size = 1.2) { parts.push({ x, y, vx, vy, life, age: 0, col, size, drag: 0.97, grav: 60, twinkle: false }); }

    function ground() {
      const gy = H * 0.86;
      // rooftop + houses silhouette
      g.fillStyle = '#12091A';
      g.beginPath(); g.moveTo(0, H); g.lineTo(0, gy - H * 0.06); g.lineTo(W * 0.12, gy - H * 0.16); g.lineTo(W * 0.24, gy - H * 0.06);
      g.lineTo(W * 0.24, gy - H * 0.02); g.lineTo(W * 0.72, gy - H * 0.02); g.lineTo(W * 0.72, gy - H * 0.1); g.lineTo(W * 0.84, gy - H * 0.2); g.lineTo(W * 0.96, gy - H * 0.1); g.lineTo(W, gy - H * 0.1); g.lineTo(W, H); g.fill();
      // diya string lights on the roofline
      for (let i = 0; i < 14; i++) {
        const x = W * (0.26 + i * 0.033); const y = gy - H * 0.02 + Math.sin(i * 0.9) * 1.5;
        const f = 0.7 + 0.3 * Math.sin(clock * 6 + i);
        g.fillStyle = `rgba(255,${170 + 40 * f | 0},70,${0.5 + 0.5 * f})`; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill();
      }
      // windows
      g.fillStyle = 'rgba(255,190,90,.55)'; g.fillRect(W * 0.1, gy - H * 0.05, W * 0.04, H * 0.035); g.fillRect(W * 0.82, gy - H * 0.08, W * 0.04, H * 0.04);
    }

    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!playing || !st.current.visible || document.hidden) { raf = requestAnimationFrame(step); return; }
      clock += dt;
      paintSky(false);
      // stars
      for (const s of stars) { g.fillStyle = `rgba(255,240,210,${0.35 + 0.35 * Math.sin(clock * 2 + s.t)})`; g.fillRect(s.x * W, s.y * H, s.r, s.r); }
      // moon
      g.fillStyle = 'rgba(255,236,200,.85)'; g.beginPath(); g.arc(W * 0.9, H * 0.14, H * 0.05, 0, 7); g.fill();
      g.fillStyle = '#120A1F'; g.beginPath(); g.arc(W * 0.9 + H * 0.02, H * 0.13, H * 0.045, 0, 7); g.fill();

      // rockets
      nextRocket -= dt;
      if (nextRocket <= 0) {
        nextRocket = 0.45 + Math.random() * 0.9;
        const x = W * (0.15 + Math.random() * 0.7);
        rockets.push({ x, y: H * 0.84, vx: (Math.random() - 0.5) * 20, vy: -H * (0.85 + Math.random() * 0.3), fuse: 0.5 + Math.random() * 0.3, big: Math.random() < 0.35 });
        if (st.current.sound && st.current.audio) st.current.audio.whistle();
      }
      g.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.fuse -= dt; r.x += r.vx * dt; r.y += r.vy * dt; r.vy += H * 0.6 * dt;
        spark(r.x, r.y, (Math.random() - 0.5) * 12, 18 + Math.random() * 10, '#FFC46B', 0.35, 1);
        if (r.fuse <= 0) { burst(r.x, r.y, r.big); rockets.splice(i, 1); }
      }
      const gy = H * 0.86;
      // anaar (flower pots) — two fountains
      for (const [fx, hue] of [[0.33, '#FFD36E'], [0.63, '#FF9B5A']]) {
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.55; const v = H * (0.55 + Math.random() * 0.35);
          spark(W * fx, gy - H * 0.04, Math.cos(a) * v, Math.sin(a) * v, Math.random() < 0.2 ? '#FFF4D6' : hue, 0.7 + Math.random() * 0.3, 1.1);
        }
      }
      // chakri (spinner)
      const cx = W * 0.48; const cy = gy - H * 0.01; const ang = clock * 18;
      for (let k = 0; k < 3; k++) {
        const a = ang + (k * Math.PI * 2) / 3; const tx = Math.cos(a); const ty = Math.sin(a);
        spark(cx + tx * 4, cy + ty * 2, -ty * 90 + (Math.random() - 0.5) * 20, tx * 30 - 10, k ? '#8FE3FF' : '#FFF4D6', 0.35, 1);
      }
      // phuljhadi (sparkler) on the left roof
      const px = W * 0.12 + Math.sin(clock * 3) * 6; const py = gy - H * 0.27 + Math.cos(clock * 3) * 4;
      g.strokeStyle = 'rgba(180,160,150,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(W * 0.12, gy - H * 0.15); g.lineTo(px, py); g.stroke();
      for (let k = 0; k < 6; k++) { const a = Math.random() * 7; const v = 30 + Math.random() * 50; spark(px, py, Math.cos(a) * v, Math.sin(a) * v, '#FFF4D6', 0.18 + Math.random() * 0.15, 0.9); }

      // particles
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt; if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = 1 - p.age / p.life; let a = k * k;
        if (p.twinkle && Math.random() < 0.3) a *= 0.2;
        g.globalAlpha = a; g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.6 + 0.4 * k), 0, 7); g.fill();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (parts.length > 2200) parts.splice(0, parts.length - 2200);
      ground();
      if (bar.current) bar.current.style.transform = `scaleX(${(clock % LOOP) / LOOP})`;
      raf = requestAnimationFrame(step);
    }

    resize();
    if (!playing) { // reduced-motion / paused: one still frame with a burst
      clock = 2; burst(W * 0.5, H * 0.35, true);
      for (let i = 0; i < 40; i++) { for (const p of parts) { p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * 0.02; p.x += p.vx * 0.02; p.y += p.vy * 0.02; } }
      g.globalCompositeOperation = 'lighter'; for (const p of parts) { g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, 1.4, 0, 7); g.fill(); }
      g.globalCompositeOperation = 'source-over'; ground(); parts.length = 0;
    }
    raf = requestAnimationFrame(step);
    const ro = new ResizeObserver(resize); ro.observe(c);
    const io = new IntersectionObserver(([e]) => { st.current.visible = e.isIntersecting; }, { threshold: 0.05 });
    io.observe(wrap.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [playing]);

  useEffect(() => () => st.current.audio?.close(), []);

  const toggleSound = () => {
    if (!st.current.audio) st.current.audio = makeAudio();
    st.current.audio?.ctx.resume?.();
    setSound((s) => !s);
    if (!playing) setPlaying(true);
  };

  return (
    <figure ref={wrap} className={`fwv ${className}`}>
      <canvas ref={canvas} className="fwv__c" role="img" aria-label="Animated video of Diwali crackers: rockets, flower pots, chakri and sparklers over a lit-up rooftop" />
      <span className="fwv__live" aria-hidden="true"><i /> {title}</span>
      <div className="fwv__bar" aria-hidden="true"><span ref={bar} /></div>
      <div className="fwv__ctl">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause cracker video' : 'Play cracker video'}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" onClick={toggleSound} aria-label={sound ? 'Mute cracker sounds' : 'Turn on cracker sounds'} aria-pressed={sound}>{sound ? '🔊' : '🔇'}</button>
      </div>
    </figure>
  );
}
