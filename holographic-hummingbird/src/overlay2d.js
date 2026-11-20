import { clamp, easeInOutCubic, easeOutCubic, hash11, hash12, lerp, smoothstep } from "./math.js";

const GLYPHS = [
  "◈", "◇", "⊹", "△", "▽", "⟁", "⌖", "▫", "+",
  "0", "1", "3", "7", "9", "A", "C", "E", "F", "X",
  "λ", "ψ", "Ξ", "─", "╱", "╲",
];

function drawBracketBox(ctx, cx, cy, size, color, alpha, cornerLen = 8) {
  if (alpha <= 0.01) return;
  const h = size * 0.5;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  ctx.beginPath();
  // Top-left
  ctx.moveTo(cx - h, cy - h + cornerLen);
  ctx.lineTo(cx - h, cy - h);
  ctx.lineTo(cx - h + cornerLen, cy - h);
  // Top-right
  ctx.moveTo(cx + h - cornerLen, cy - h);
  ctx.lineTo(cx + h, cy - h);
  ctx.lineTo(cx + h, cy - h + cornerLen);
  // Bottom-right
  ctx.moveTo(cx + h, cy + h - cornerLen);
  ctx.lineTo(cx + h, cy + h);
  ctx.lineTo(cx + h - cornerLen, cy + h);
  // Bottom-left
  ctx.moveTo(cx - h + cornerLen, cy + h);
  ctx.lineTo(cx - h, cy + h);
  ctx.lineTo(cx - h, cy + h - cornerLen);
  ctx.stroke();

  // Crisp micro crosshair inside box
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy);
  ctx.lineTo(cx + 4, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.restore();
}

function drawTrackedTarget(ctx, pt, label, color, alpha, boxSize, leaderDist, biasDirX = 0, biasDirY = 0) {
  if (!pt || alpha <= 0.01) return;
  const { x, y } = pt;

  // Box around projected 3D coordinate
  drawBracketBox(ctx, x, y, boxSize, color, alpha, Math.round(boxSize * 0.28));

  // Direction away from composition center (540, 520) + optional anatomical bias
  let dx = x - 540 + biasDirX * 140;
  let dy = y - 520 + biasDirY * 140;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  const startX = x + dx * (boxSize * 0.56);
  const startY = y + dy * (boxSize * 0.56);
  let elbowX = clamp(x + dx * (boxSize * 0.56 + leaderDist), 90, 990);
  let elbowY = clamp(y + dy * (boxSize * 0.56 + leaderDist), 68, 1012);

  // Guarantee vertical clearance from the bracket whenever the label flips inward or sits near horizontal
  const vertClearance = boxSize * 0.5 + 22;
  if (Math.abs(elbowY - y) < vertClearance) {
    const pushY = biasDirY !== 0 ? Math.sign(biasDirY) : (y < 520 ? -1 : 1);
    elbowY = clamp(y + pushY * (vertClearance + 14), 68, 1012);
  }

  // Extend outward into open canvas margin unless very close to the 1080px edge
  const safeHorizDir = elbowX > 945 ? -1 : elbowX < 145 ? 1 : (dx >= 0 ? 1 : -1);
  const endX = clamp(elbowX + safeHorizDir * 84, 48, 1032);
  const endY = elbowY;

  ctx.save();
  ctx.globalAlpha = alpha * 0.88;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(elbowX, endY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Small anchor diamond at elbow
  ctx.fillStyle = color;
  ctx.fillRect(elbowX - 2, endY - 2, 4, 4);

  // Crisp coordinate readout tag
  ctx.font = '500 12px "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", monospace';
  ctx.fillStyle = color;
  ctx.textBaseline = "bottom";
  ctx.textAlign = safeHorizDir > 0 ? "left" : "right";
  const textX = safeHorizDir > 0 ? elbowX + 6 : elbowX - 6;
  ctx.fillText(label, textX, endY - 5);

  ctx.globalAlpha = alpha * 0.62;
  ctx.font = '400 11px "IBM Plex Mono", "JetBrains Mono", monospace';
  ctx.textBaseline = "top";
  const cxInt = clamp(Math.round(x), 0, 1080).toString().padStart(4, "0");
  const cyInt = clamp(Math.round(y), 0, 1080).toString().padStart(4, "0");
  ctx.fillText(`${cxInt},${cyInt}`, textX, endY + 4);
  ctx.restore();
}

export function createOverlayRenderer(canvas, webglCanvas) {
  const ctx = canvas.getContext("2d");
  const W = 1080;
  const H = 1080;

  function renderWebGLWithGlitch(glitch) {
    // Pure black base
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    if (!glitch.active || glitch.intensity <= 0.01) {
      ctx.drawImage(webglCanvas, 0, 0, W, H);
      return;
    }

    // Horizontal scan-signal slice tearing across the full frame
    const slices = 18;
    let yCursor = 0;
    for (let i = 0; i < slices; i++) {
      const sliceH = i === slices - 1
        ? H - yCursor
        : Math.round(lerp(24, 96, hash12(i, glitch.seed)));
      if (yCursor >= H) break;
      const h = Math.min(sliceH, H - yCursor);

      const r = hash12(i * 3.17, glitch.seed);
      let dx = 0;
      if (r > 0.52) {
        const dir = hash12(i * 7.1, glitch.seed + 2.0) > 0.5 ? 1 : -1;
        dx = dir * lerp(14, 58, hash12(i, glitch.seed + 5.0)) * glitch.intensity;
      }

      ctx.drawImage(webglCanvas, 0, yCursor, W, h, dx, yCursor, W, h);

      // Brief cyan/magenta chromatic separation & scan tear bars on strong displaced slices
      if (Math.abs(dx) > 16) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.28 * glitch.intensity;
        ctx.fillStyle = dx > 0 ? "#38e8ff" : "#ec4899";
        ctx.fillRect(0, yCursor, W, 2);
        ctx.globalAlpha = 0.22 * glitch.intensity;
        ctx.drawImage(webglCanvas, 0, yCursor, W, h, dx - 11 * Math.sign(dx), yCursor, W, h);
        ctx.restore();
      }

      yCursor += h;
    }
  }

  function renderPhase1ArcAndGlyphs(choreo, contour2D) {
    const t = choreo.t;
    const arcAlpha = choreo.arcAlpha;
    if (arcAlpha <= 0.01) return;

    const cx = 540;
    const cy = 525;
    const baseRadius = 335;

    // 1. Blue-violet luminous ribbon arc sweeping around center
    const sweepProgress = easeInOutCubic(clamp(t / 1.08, 0, 1));
    const startAngle = -Math.PI * 0.82;
    const totalArc = Math.PI * 1.68;
    const headAngle = startAngle + totalArc * sweepProgress;
    const tailAngle = startAngle + Math.max(0, totalArc * (sweepProgress - 0.52));

    if (headAngle > tailAngle + 0.01) {
      ctx.save();
      ctx.globalAlpha = arcAlpha;
      ctx.globalCompositeOperation = "lighter";

      const grad = ctx.createLinearGradient(
        cx + Math.cos(tailAngle) * baseRadius,
        cy + Math.sin(tailAngle) * baseRadius,
        cx + Math.cos(headAngle) * baseRadius,
        cy + Math.sin(headAngle) * baseRadius
      );
      grad.addColorStop(0.0, "rgba(37, 99, 235, 0.0)");
      grad.addColorStop(0.35, "rgba(59, 130, 246, 0.72)");
      grad.addColorStop(0.75, "rgba(139, 92, 246, 0.95)");
      grad.addColorStop(1.0, "rgba(103, 232, 249, 1.0)");

      // Outer luminous violet-blue glow band
      ctx.strokeStyle = grad;
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.shadowColor = "#7c3aed";
      ctx.shadowBlur = 34;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, tailAngle, headAngle);
      ctx.stroke();

      // Razor-sharp inner plasma ribbon
      ctx.lineWidth = 3.2;
      ctx.shadowColor = "#38e8ff";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, tailAngle, headAngle);
      ctx.stroke();

      // Counter-sweeping secondary harmonic violet arc
      const innerTail = Math.PI * 0.25 - totalArc * 0.55 * sweepProgress;
      const innerHead = innerTail + Math.PI * 0.55 * Math.min(1, sweepProgress * 1.4);
      ctx.strokeStyle = "rgba(168, 85, 247, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, 272, innerTail, innerHead);
      ctx.stroke();

      // Leading flare orb at the arc head
      const hx = cx + Math.cos(headAngle) * baseRadius;
      const hy = cy + Math.sin(headAngle) * baseRadius;
      const flare = ctx.createRadialGradient(hx, hy, 0, hx, hy, 38);
      flare.addColorStop(0, "rgba(224, 247, 255, 0.95)");
      flare.addColorStop(0.35, "rgba(139, 92, 246, 0.65)");
      flare.addColorStop(1, "rgba(59, 130, 246, 0)");
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(hx, hy, 38, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 2. Glowing glyphs emerging from the arc & assembling the hummingbird silhouette
    const glyphFadeOut = 1 - smoothstep(0.95, 1.38, t);
    if (glyphFadeOut <= 0.01 || !contour2D || contour2D.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const assembledPts = [];
    const n = contour2D.length;

    for (let i = 0; i < n; i++) {
      const target = contour2D[i];
      const u = i / n;
      const spawnTime = u * 0.44;
      const arriveTime = 0.66 + u * 0.42;

      if (t < spawnTime) continue;

      const localMove = easeInOutCubic(clamp((t - spawnTime) / (arriveTime - spawnTime), 0, 1));
      const arcAngle = startAngle + totalArc * clamp(u * 0.92 + 0.06, 0, 1);
      const rOffset = (hash11(i * 3.7) - 0.5) * 44;
      const startX = cx + Math.cos(arcAngle) * (baseRadius + rOffset);
      const startY = cy + Math.sin(arcAngle) * (baseRadius + rOffset);

      // Gentle spiral curl mid-flight before locking onto silhouette vertex
      const spiral = Math.sin(localMove * Math.PI) * (hash11(i * 9.1) - 0.5) * 75;
      const px = lerp(startX, target.x, localMove) + spiral * 0.4;
      const py = lerp(startY, target.y, localMove) - Math.abs(spiral) * 0.25;

      assembledPts.push({ x: px, y: py, settled: localMove, idx: i });

      const glyphChar = GLYPHS[(i * 7 + Math.floor(t * 14 * (1 - localMove * 0.85))) % GLYPHS.length];
      const isViolet = i % 3 === 0 || target.isGorget;
      const gColor = target.isGorget
        ? `rgba(244, 63, 184, ${0.9 * glyphFadeOut})`
        : isViolet
        ? `rgba(167, 139, 250, ${0.9 * glyphFadeOut})`
        : `rgba(56, 232, 255, ${0.92 * glyphFadeOut})`;

      ctx.font = `${localMove > 0.8 ? 600 : 500} ${Math.round(lerp(16, 13, localMove))}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = gColor;
      ctx.shadowColor = isViolet ? "#a855f7" : "#38bdf8";
      ctx.shadowBlur = 10;
      ctx.fillText(glyphChar, px, py);
    }

    // Connect settled contour glyphs with fine holographic vector silhouette filaments
    const lineAlpha = smoothstep(0.45, 0.92, t) * (1 - smoothstep(1.02, 1.38, t));
    if (lineAlpha > 0.01 && assembledPts.length > 4) {
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.05;
      ctx.strokeStyle = `rgba(96, 165, 250, ${0.55 * lineAlpha})`;
      ctx.beginPath();
      for (let i = 1; i < assembledPts.length; i++) {
        const a = assembledPts[i - 1];
        const b = assembledPts[i];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist < 140) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function renderAmbientCalibrationFrame(choreo) {
    // Subtle corner alignment ticks and faint circular holographic ring
    const ringAlpha = smoothstep(0.35, 1.35, choreo.t) * 0.20;
    if (ringAlpha <= 0.005) return;

    ctx.save();
    ctx.strokeStyle = `rgba(99, 102, 241, ${ringAlpha})`;
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 10]);
    ctx.beginPath();
    ctx.arc(540, 525, 392, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4 clean corner framing marks (top-left, top-right, bottom-left, bottom-right)
    const m = 48;
    const len = 22;
    ctx.strokeStyle = `rgba(56, 189, 248, ${ringAlpha * 1.4})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    // TL
    ctx.moveTo(m, m + len); ctx.lineTo(m, m); ctx.lineTo(m + len, m);
    // TR
    ctx.moveTo(W - m - len, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + len);
    // BR
    ctx.moveTo(W - m, H - m - len); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m - len, H - m);
    // BL
    ctx.moveTo(m + len, H - m); ctx.lineTo(m, H - m); ctx.lineTo(m, H - m - len);
    ctx.stroke();
    ctx.restore();
  }

  function renderPhase2And3Tracking(choreo, projectedMarkers) {
    const hudAlpha = choreo.hudAlpha;
    if (hudAlpha <= 0.01) return;

    const turnT = choreo.turnT;
    const glitchDx = choreo.glitch.active
      ? (hash11(choreo.glitch.seed + 9.2) - 0.5) * 18 * choreo.glitch.intensity
      : 0;

    ctx.save();
    ctx.translate(glitchDx, 0);

    // Track Eye (stays sharp throughout Phase 2 & 3)
    drawTrackedTarget(
      ctx,
      projectedMarkers.eye,
      "EYE · ORBIT",
      "#e879f9",
      hudAlpha * 0.95,
      26,
      58,
      0.1,
      -0.8
    );

    // Track Near Wingtip (Right wing +Z)
    drawTrackedTarget(
      ctx,
      projectedMarkers.wingTipRight,
      "WING · PRIMARIES R",
      "#38e8ff",
      hudAlpha * 0.92,
      30,
      54,
      -0.6,
      -0.4
    );

    // Track Far Wingtip (Left wing -Z, steps cleanly right in side profile away from Gorget & Beak)
    drawTrackedTarget(
      ctx,
      projectedMarkers.wingTipLeft,
      "WING · PRIMARIES L",
      "#818cf8",
      hudAlpha * lerp(0.88, 0.58, turnT),
      28,
      56,
      lerp(0.5, 0.95, turnT),
      lerp(-0.6, 0.15, turnT)
    );

    // Track Tail Feathers
    drawTrackedTarget(
      ctx,
      projectedMarkers.tailTip,
      "RECTRIX · TAIL",
      "#60a5fa",
      hudAlpha * 0.90,
      30,
      58,
      -0.35,
      0.95
    );

    // Phase 3 Side Profile Focus: Gorget Iridescence & Slender Beak Axis
    const sideFocusAlpha = smoothstep(2.75, 3.35, choreo.t);
    if (sideFocusAlpha > 0.01) {
      drawTrackedTarget(
        ctx,
        projectedMarkers.gorget,
        "GORGET · IRIDESCENCE",
        "#f43f9e",
        sideFocusAlpha * 0.92,
        34,
        74,
        0.25,
        1.0
      );

      // Fine holographic measurement arc from eye/head out to needle beak tip
      if (projectedMarkers.eye && projectedMarkers.beakTip) {
        const ex = projectedMarkers.eye.x;
        const ey = projectedMarkers.eye.y;
        const bx = projectedMarkers.beakTip.x;
        const by = projectedMarkers.beakTip.y;
        ctx.save();
        ctx.globalAlpha = sideFocusAlpha * 0.65;
        ctx.strokeStyle = "#38e8ff";
        ctx.lineWidth = 1.0;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        drawBracketBox(ctx, bx, by, 18, "#38e8ff", sideFocusAlpha * 0.85, 5);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  function render(choreo, projectedMarkers, contour2D) {
    renderWebGLWithGlitch(choreo.glitch);
    renderAmbientCalibrationFrame(choreo);
    renderPhase1ArcAndGlyphs(choreo, contour2D);
    renderPhase2And3Tracking(choreo, projectedMarkers);
  }

  return { render };
}
