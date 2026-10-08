import { useEffect, useRef } from 'react';
import { useMotion } from '../state/store.jsx';

/**
 * Lightweight canvas atmosphere: twinkling gold sparkles, slowly rising embers
 * and a rare, soft firework bloom. Pauses when off-screen or when the visitor
 * prefers reduced motion (renders a single still frame instead).
 */
export default function FestiveSky({ density = 1, fireworks = true, className = '' }) {
  const ref = useRef(null);
  const { reduced } = useMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, raf = 0, visible = true, last = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const stars = [];
    const embers = [];
    const bursts = [];

    function resize() {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars.length = 0; embers.length = 0;
      const n = Math.min(160, Math.round((w * h) / 14000 * density));
      for (let i = 0; i < n; i++) stars.push({ x: Math.random() * w, y: Math.random() * h * 0.85, r: Math.random() * 1.4 + 0.3, p: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 1.6 });
      for (let i = 0; i < n / 3; i++) embers.push(newEmber(true));
    }
    function newEmber(anywhere) {
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : h + 10, vy: 0.15 + Math.random() * 0.35, vx: (Math.random() - 0.5) * 0.15, r: Math.random() * 1.8 + 0.6, life: 0.4 + Math.random() * 0.6 };
    }
    function burst() {
      const x = w * (0.15 + Math.random() * 0.7), y = h * (0.12 + Math.random() * 0.3);
      const hue = [42, 28, 340, 280][Math.floor(Math.random() * 4)];
      const parts = Array.from({ length: 34 }, (_, i) => {
        const a = (i / 34) * Math.PI * 2, sp = 0.6 + Math.random() * 0.9;
        return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: 1 };
      });
      bursts.push({ parts, hue });
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (t - last < 30) return; // ~30 fps is plenty for twinkles and keeps the page light
      const dt = Math.min(50, t - last || 16) / 16; last = t;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.p += 0.02 * s.s * dt;
        const a = 0.35 + 0.65 * Math.abs(Math.sin(s.p));
        ctx.fillStyle = `rgba(255, 221, 150, ${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
        if (s.r > 1.4 && a > 0.9) {
          ctx.strokeStyle = `rgba(255, 230, 170, ${a * 0.5})`; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y); ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x, s.y + 4); ctx.stroke();
        }
      }
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.y -= e.vy * dt; e.x += e.vx * dt + Math.sin((e.y + i) / 30) * 0.1;
        const fade = Math.max(0, Math.min(1, e.y / h)) * e.life;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4);
        g.addColorStop(0, `rgba(255, 190, 90, ${fade})`); g.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 4, 0, 7); ctx.fill();
        if (e.y < -10) embers[i] = newEmber(false);
      }
      if (fireworks && Math.random() < 0.004 * dt && bursts.length < 2) burst();
      for (let b = bursts.length - 1; b >= 0; b--) {
        const bu = bursts[b];
        let alive = false;
        for (const p of bu.parts) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.012 * dt; p.vx *= 0.99; p.a -= 0.009 * dt;
          if (p.a > 0) {
            alive = true;
            ctx.fillStyle = `hsla(${bu.hue}, 95%, 70%, ${p.a * 0.55})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, 7); ctx.fill();
          }
        }
        if (!alive) bursts.splice(b, 1);
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    if (reduced) {
      frame(16); cancelAnimationFrame(raf); // one still frame
    } else raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [reduced, density, fireworks]);

  return <canvas ref={ref} className={`sky ${className}`} aria-hidden="true" />;
}
