import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const paths = [
  "src/App.tsx",
  "components/",
  "package.json",
  "api/",
  "hooks/",
  "utils/",
  "auth.ts",
  "lib/",
  "index.ts",
  "router.tsx",
  "styles.css",
  "services/",
];
export function LandingConstellation({
  quiet = false,
  departing = false,
}: {
  quiet?: boolean;
  departing?: boolean;
}) {
  // Keep the density and eight cluster regions, but rotate each pattern afresh
  // on a page visit. The values stay stable through hover, resize and departure.
  const [clusterRotations] = useState(() =>
    Array.from({ length: 8 }, () => Math.random() * Math.PI * 2),
  );
  const departure = useRef<number | null>(null);
  useEffect(() => {
    departure.current = departing ? performance.now() : null;
    if (departing) setTooltip(null);
  }, [departing]);
  const reduced = !!useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0,
      h = 0,
      frame = 0,
      time = 0;
    const startedAt = performance.now();
    let mouse = { x: -9999, y: -9999 };
    let hover = -1;
    const css = getComputedStyle(canvas);
    const colors = {
      node: css.getPropertyValue("--graph-node").trim(),
      blue: css.getPropertyValue("--graph-blue").trim(),
      primary: css.getPropertyValue("--primary").trim(),
    };
    const nodes = Array.from({ length: 118 }, (_, i) => {
      const upperCluster = i >= 85;
      const cornerCluster = i >= 102;
      const cluster = cornerCluster
        ? i < 110
          ? 6
          : 7
        : upperCluster
          ? 5
          : i % 5;
      const angle = i * 2.39996 + clusterRotations[cluster];
      const r = Math.sqrt(
        cornerCluster ? (((i - 102) % 8) + 0.5) / 8 : (i % 17) / 17,
      );
      const centers = [
        [0.13, 0.33],
        [0.83, 0.32],
        [0.51, 0.83],
        [0.06, 0.8],
        [0.96, 0.76],
        [0.5, 0.13],
        [0.1, 0.095],
        [0.9, 0.095],
      ];
      // Reflect edge points back inside the viewport rather than clipping stars
      // or piling them against a clamped edge. Every layout keeps 118 stars, including eight in each upper corner.
      const inside = (coordinate: number) =>
        coordinate < 0.02
          ? 0.04 - coordinate
          : coordinate > 0.98
            ? 1.96 - coordinate
            : coordinate;
      return {
        x: inside(
          (centers[cluster]?.[0] ?? 0.5) +
            Math.cos(angle) *
              r *
              (cornerCluster ? 0.085 : upperCluster ? 0.22 : 0.21),
        ),
        y: inside(
          (centers[cluster]?.[1] ?? 0.5) +
            Math.sin(angle) *
              r *
              (cornerCluster ? 0.065 : upperCluster ? 0.08 : 0.23),
        ),
        r: i % 13 === 0 ? 3 : i % 4 === 0 ? 1.8 : 1,
        phase: i * 0.7,
        name: paths[i % paths.length] ?? "index.ts",
        sparkleAt: Math.random() * 14,
        sparkleDuration: 0.8 + Math.random() * 1.2,
      };
    });
    const links: [number, number][] = [];
    nodes.forEach((n, i) =>
      nodes.slice(i + 1).forEach((b, j) => {
        if (Math.hypot(n.x - b.x, n.y - b.y) < 0.13) links.push([i, i + j + 1]);
      }),
    );
    const pulses = links.map(() => ({
      start: Math.random() * 20,
      duration: 1.4 + Math.random() * 1.4,
      reverse: Math.random() > 0.5,
    }));
    const hoverLight = links.map(() => 0);
    let previousFrame = performance.now();
    let redraw = () => {};
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) redraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = () => {
      const now = performance.now();
      const dt = Math.min((now - previousFrame) / 1000, 0.05);
      previousFrame = now;
      const elapsed = (now - startedAt) / 1000;
      const departureAge =
        departure.current === null ? -1 : (now - departure.current) / 1000;
      const fade = (index: number) => {
        if (departureAge < 0) return 1;
        const delay = 0.12 + (((index * 73 + 19) % 101) / 101) * 1.05;
        const t = Math.max(0, Math.min(1, (departureAge - delay) / 1.05));
        return 1 - t * t * (3 - 2 * t);
      };
      time = elapsed * 0.09;
      ctx.clearRect(0, 0, w, h);
      const points = nodes.map((n) => ({
        x:
          n.x * w +
          (reduced ? 0 : Math.sin(time + n.phase) * 5) +
          (!reduced && mouse.x > 0 ? (mouse.x - w / 2) * 0.009 : 0),
        y: n.y * h + (reduced ? 0 : Math.cos(time + n.phase) * 4),
      }));
      const nextHover =
        quiet || departureAge >= 0
          ? -1
          : points.findIndex(
              (p) => Math.hypot(p.x - mouse.x, p.y - mouse.y) < 15,
            );
      if (nextHover !== hover) {
        hover = nextHover;
        const p = points[hover];
        const hoveredNode = nodes[hover];
        setTooltip(
          p && hoveredNode
            ? {
                name: hoveredNode.name,
                x: Math.min(p.x + 12, w - 145),
                y: p.y - 30,
              }
            : null,
        );
      }
      const neighbors = new Set<number>();
      links.forEach(([a, b]) => {
        if (a === hover || b === hover) {
          neighbors.add(a);
          neighbors.add(b);
        }
      });
      ctx.lineWidth = 0.6;
      links.forEach(([a, b], index) => {
        if (w < 760 && (a % 2 || b % 2)) return;
        const pa = points[a],
          pb = points[b];
        if (!pa || !pb) return;
        const dx = pb.x - pa.x,
          dy = pb.y - pa.y;
        const along = Math.max(
          0,
          Math.min(
            1,
            ((mouse.x - pa.x) * dx + (mouse.y - pa.y) * dy) /
              Math.max(1, dx * dx + dy * dy),
          ),
        );
        const nearLine =
          Math.hypot(
            mouse.x - (pa.x + along * dx),
            mouse.y - (pa.y + along * dy),
          ) < 9;
        const active =
          !quiet &&
          departureAge < 0 &&
          (nearLine || a === hover || b === hover);
        hoverLight[index] +=
          ((active ? 1 : 0) - hoverLight[index]) *
          (reduced ? 1 : 1 - Math.exp(-dt / (active ? 0.075 : 0.14)));
        const glow = hoverLight[index];
        const visibility = Math.min(fade(a), fade(b), fade(index + 91));
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        // The connection exists for pulses and hover hit-testing only at rest.
        if (glow > 0.001) {
          ctx.globalAlpha = glow * 0.9 * visibility;
          ctx.strokeStyle = colors.primary;
          ctx.shadowColor = colors.primary;
          ctx.shadowBlur = glow * 5;
          ctx.lineWidth = 0.6 + glow * 0.5;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.lineWidth = 0.6;
        }
      });
      if (!reduced)
        links.forEach(([a, b], index) => {
          if (w < 760 && (a % 2 || b % 2)) return;
          const pulse = pulses[index];
          if (!pulse) return;
          const progress = (elapsed - pulse.start) / pulse.duration;
          if (progress > 1) {
            pulse.start = elapsed + 8 + Math.random() * 20;
            pulse.reverse = Math.random() > 0.5;
            return;
          }
          if (progress < 0) return;
          const from = points[pulse.reverse ? b : a],
            to = points[pulse.reverse ? a : b];
          if (!from || !to) return;
          ctx.strokeStyle = colors.node;
          ctx.lineWidth = 1.1;
          const envelope = Math.sin(progress * Math.PI);
          for (let segment = 0; segment < 8; segment++) {
            const end = progress - segment * 0.014;
            const start = Math.max(0, end - 0.018);
            if (end <= 0) continue;
            ctx.globalAlpha =
              envelope *
              (1 - segment / 8) *
              (quiet ? 0.22 : 0.65) *
              Math.min(fade(a), fade(b));
            ctx.beginPath();
            ctx.moveTo(
              from.x + (to.x - from.x) * start,
              from.y + (to.y - from.y) * start,
            );
            ctx.lineTo(
              from.x + (to.x - from.x) * end,
              from.y + (to.y - from.y) * end,
            );
            ctx.stroke();
          }
        });
      points.forEach((p, i) => {
        if (w < 760 && i % 2) return;
        const n = nodes[i];
        if (!n) return;
        const progress = (elapsed - n.sparkleAt) / n.sparkleDuration;
        if (progress > 1) {
          n.sparkleAt = elapsed + 5 + Math.random() * 16;
          n.sparkleDuration = 0.8 + Math.random() * 1.2;
        }
        const sparkle =
          !reduced && progress >= 0 && progress <= 1
            ? Math.sin(progress * Math.PI) ** 3
            : 0;
        ctx.globalAlpha = Math.min(
          1,
          (quiet ? 0.28 : neighbors.has(i) ? 1 : 0.5) +
            sparkle * (quiet ? 0.25 : 0.5),
        );
        ctx.globalAlpha *= fade(i);
        ctx.fillStyle =
          sparkle > 0.1 ? colors.node : i % 5 === 0 ? colors.blue : colors.node;
        ctx.shadowColor = colors.node;
        ctx.shadowBlur = sparkle * 9;
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          n.r * (i === hover ? 1.5 : 1) * (1 + sparkle * 0.45),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.shadowBlur = 0;
        if (sparkle > 0.2 && n.r > 1) {
          ctx.globalAlpha = sparkle * (quiet ? 0.15 : 0.4) * fade(i);
          ctx.strokeStyle = colors.node;
          ctx.lineWidth = 0.65;
          const reach = n.r + sparkle * 4;
          ctx.beginPath();
          ctx.moveTo(p.x - reach, p.y);
          ctx.lineTo(p.x + reach, p.y);
          ctx.moveTo(p.x, p.y - reach);
          ctx.lineTo(p.x, p.y + reach);
          ctx.stroke();
        }
        if (!quiet && i % 17 === 0) {
          ctx.globalAlpha = 0.33 * fade(i);
          ctx.font = "9px monospace";
          ctx.fillText(n.name, p.x + 9, p.y + 3);
        }
      });
      ctx.globalAlpha = 1;
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    redraw = draw;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (reduced) draw();
    };
    const onLeave = () => {
      mouse = { x: -9999, y: -9999 };
      hover = -1;
      setTooltip(null);
      if (reduced) draw();
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [quiet, reduced, clusterRotations]);
  return (
    <div className="landing-constellation">
      <canvas ref={canvasRef} aria-label="Animated repository constellation" />
      {tooltip && (
        <div
          className="landing-star-tooltip"
          ref={(el) => {
            if (el) {
              el.style.left = `${tooltip.x}px`;
              el.style.top = `${tooltip.y}px`;
            }
          }}
        >
          {tooltip.name}
        </div>
      )}
    </div>
  );
}
