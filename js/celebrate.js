// Finishing a workout: confetti, a buzz, and a summary card.

// ---------- haptics ----------
// Android: the Vibration API. iPhone has no vibration API for websites; on
// iOS 18+, toggling a native "switch" checkbox plays a system haptic, so we
// tap a hidden one. Elsewhere this quietly does nothing.
export function buzz() {
  if (navigator.vibrate) {
    navigator.vibrate([40, 60, 80]);
    return;
  }
  try {
    const label = document.createElement("label");
    label.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:-100px";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    setTimeout(() => label.remove(), 500);
  } catch {
    /* no haptics available */
  }
}

// ---------- confetti ----------

export function confetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const css = getComputedStyle(document.documentElement);
  const colors = ["--accent", "--good", "--warn", "--bad", "--text"].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);

  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Two bursts from the bottom corners, angled toward the middle.
  const pieces = [];
  for (let i = 0; i < 140; i++) {
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const speed = 9 + Math.random() * 9;
    pieces.push({
      x: left ? 0 : w,
      y: h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
    });
  }

  const start = performance.now();
  const DURATION = 2800;
  function frame(t) {
    const elapsed = t - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION * 0.65) / (DURATION * 0.35));
    for (const p of pieces) {
      p.vy += 0.28;      // gravity
      p.vx *= 0.99;      // drag
      p.vy *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
