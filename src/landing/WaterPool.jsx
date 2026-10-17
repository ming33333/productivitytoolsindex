import { useEffect, useImperativeHandle, useRef } from "react";

function sizeFor(cssW, cssH) {
  const aspect = Math.max(cssW, 1) / Math.max(cssH, 1);
  const target = 180000;
  let h = Math.max(48, Math.round(Math.sqrt(target / aspect)));
  let w = Math.max(48, Math.round(h * aspect));
  if (w * h > target * 1.15) {
    const scale = Math.sqrt((target * 1.15) / (w * h));
    w = Math.max(48, Math.floor(w * scale));
    h = Math.max(48, Math.floor(h * scale));
  }
  return { w, h };
}

export default function WaterPool({ waterRef = null }) {
  const canvasRef = useRef(null);

  useImperativeHandle(waterRef, () => ({
    disturb(nx = 0.5, ny = 0.5, radius = 6, strength = 1.4) {
      const api = canvasRef.current?.__water;
      api?.dropNorm(nx, ny, radius, strength);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const view = canvas.getContext("2d", { alpha: false });
    const field = document.createElement("canvas");
    const fieldCtx = field.getContext("2d", { alpha: false, willReadFrequently: true });

    const sim = {
      w: 0,
      h: 0,
      curr: null,
      prev: null,
      image: null,
    };

    let raf = 0;
    let running = true;
    let nextRain = 0;

    function drop(x, y, radius, strength) {
      const { w, h, prev } = sim;
      if (!prev) return;
      const r = Math.max(1, radius | 0);
      for (let j = -r; j <= r; j += 1) {
        const py = y + j;
        if (py <= 0 || py >= h - 1) continue;
        for (let i = -r; i <= r; i += 1) {
          const px = x + i;
          if (px <= 0 || px >= w - 1) continue;
          const dist = Math.hypot(i, j);
          if (dist > r) continue;
          prev[py * w + px] += Math.cos((dist / r) * Math.PI * 0.5) * strength;
        }
      }
    }

    function dropNorm(nx, ny, radius, strength) {
      drop(
        Math.round(nx * (sim.w - 1)),
        Math.round(ny * (sim.h - 1)),
        radius,
        strength,
      );
    }

    function seed() {
      dropNorm(0.72, 0.3, 4, 0.45);
    }

    function resize() {
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const { w, h } = sizeFor(cssW, cssH);
      sim.w = w;
      sim.h = h;
      sim.curr = new Float32Array(w * h);
      sim.prev = new Float32Array(w * h);
      field.width = w;
      field.height = h;
      sim.image = fieldCtx.createImageData(w, h);
      seed();
    }

    function paint() {
      const { w, h, curr, image } = sim;
      const prev = sim.prev;
      const data = image.data;

      for (let y = 1; y < h - 1; y += 1) {
        const row = y * w;
        for (let x = 1; x < w - 1; x += 1) {
          const i = row + x;
          let next =
            (prev[i - 1] + prev[i + 1] + prev[i - w] + prev[i + w]) * 0.5 - curr[i];
          next *= 0.992;
          if (next > 6) next = 6;
          else if (next < -6) next = -6;
          curr[i] = next;
        }
      }

      sim.prev = curr;
      sim.curr = prev;
      const height = sim.prev;

      for (let y = 0; y < h; y += 1) {
        const row = y * w;
        for (let x = 0; x < w; x += 1) {
          const i = row + x;
          const left = height[x > 0 ? i - 1 : i];
          const right = height[x < w - 1 ? i + 1 : i];
          const up = height[y > 0 ? i - w : i];
          const down = height[y < h - 1 ? i + w : i];
          const slope = Math.hypot(right - left, down - up);
          const crest = Math.max(0, slope - 0.02) * 0.95;
          const ink = Math.min(1, Math.pow(crest, 1.05));
          const shade = 255 - ink * 245;
          const tone = shade | 0;
          const p = i * 4;
          data[p] = tone;
          data[p + 1] = tone;
          data[p + 2] = tone;
          data[p + 3] = 255;
        }
      }

      fieldCtx.putImageData(image, 0, 0);
      view.imageSmoothingEnabled = true;
      view.drawImage(field, 0, 0, canvas.width, canvas.height);
    }

    function onDown(event) {
      if (!sim.prev || event.button !== 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest("a, button, input, textarea, select, label, summary, form")) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.round(((event.clientX - rect.left) / rect.width) * (sim.w - 1));
      const y = Math.round(((event.clientY - rect.top) / rect.height) * (sim.h - 1));
      drop(x, y, 4, 0.85);
    }

    function tick(time) {
      if (!running) return;
      if (sim.prev) {
        if (nextRain === 0) {
          nextRain = time + 16000 + Math.random() * 16000;
        } else if (time > nextRain) {
          dropNorm(
            0.12 + Math.random() * 0.76,
            0.12 + Math.random() * 0.76,
            3 + ((Math.random() * 3) | 0),
            0.4 + Math.random() * 0.25,
          );
          nextRain = time + 16000 + Math.random() * 16000;
        }
        paint();
      }
      raf = requestAnimationFrame(tick);
    }

    canvas.__water = { dropNorm };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointerdown", onDown);
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("pointerdown", onDown);
      delete canvas.__water;
    };
  }, []);

  return <canvas ref={canvasRef} className="lp-water" aria-hidden="true" />;
}
