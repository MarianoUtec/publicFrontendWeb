import { useEffect, useRef, useState, useCallback } from 'react';
import { useMusicMatch } from '../context/MusicMatchContext';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Point3D {
  x: number; y: number; z: number;
  userId: number; userName: string;
  compatibilityScore: number;
  isMe: boolean; isClosest: boolean;
}

// ── 3D projection helpers ─────────────────────────────────────────────────────
function project(
  x: number, y: number, z: number,
  rotX: number, rotY: number,
  W: number, H: number,
  zoom: number,
  centerX: number = 0,
  centerY: number = 0,
  aspectRatio: number = 1, // Nuevo parámetro para controlar el aspecto
) {
  // Primero desplazamos al centro de rotación
  const dx = x - centerX;
  const dy = y - centerY;
  
  // Aplicar estiramiento en X para mejor visualización
  const stretchX = 4; // Factor de estiramiento para el eje X
  const stretchedDx = dx * stretchX;
  
  // Rotate around Y
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const x1 = stretchedDx * cosY - z * sinY;
  const z1 = stretchedDx * sinY + z * cosY;
  // Rotate around X
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const y2 = dy * cosX - z1 * sinX;
  const z2 = dy * sinX + z1 * cosX;
  // Perspective
  const fov = zoom * 300;
  const d = fov / (fov + z2 + 2);
  // Aplicamos el centro de rotación a la proyección
  return { 
    sx: W / 2 + x1 * fov * d, 
    sy: H / 2 + y2 * fov * d, 
    d, 
    z2 
  };
}

// ── 3D Canvas ─────────────────────────────────────────────────────────────────
function Space3D({ points, myCoords }: { points: Point3D[]; myCoords: { x: number; y: number; z: number } | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef({ x: 0.3, y: 0.5 });
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });
  const zoomRef = useRef(1.0);
  const animRef = useRef<number>(0);
  const autoRotRef = useRef(true);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [selectedUser, setSelectedUser] = useState<Point3D | null>(null);

  // Centro de rotación y posición del eje Y
  const centerX = 0.26;
  const centerY = 0;
  const stretchX = 1.8; // Factor de estiramiento para el eje X

  // Filtrar puntos para mostrar solo x >= 0
  const filteredPoints = points.filter(pt => pt.x >= 0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const rotX = rotRef.current.x, rotY = rotRef.current.y, zoom = zoomRef.current;

    // Dibujar el centro de rotación con un marcador
    const center = project(centerX, centerY, 0, rotX, rotY, W, H, zoom, centerX, centerY);
    
    // Círculo grande para el centro
    ctx.beginPath();
    ctx.arc(center.sx, center.sy, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Círculo pequeño
    ctx.beginPath();
    ctx.arc(center.sx, center.sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
    
    // Etiqueta
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('🔄 Centro (0.26, 0, 0)', center.sx + 10, center.sy - 4);

    // Función para dibujar flecha en un punto
    const drawArrow = (x: number, y: number, angle: number, color: string) => {
      const arrowSize = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - arrowSize * Math.cos(angle - 0.5), y - arrowSize * Math.sin(angle - 0.5));
      ctx.lineTo(x - arrowSize * Math.cos(angle + 0.5), y - arrowSize * Math.sin(angle + 0.5));
      ctx.closePath();
      ctx.fill();
    };

    // Dibujar ejes con límites ajustados y flechas en ambos extremos
    const axisLength = 0.5; // Longitud aumentada para mejor visualización
    
    // Eje X: desde 0 hasta axisLength (visualmente estirado)
    const xFrom = [0, 0, 0];
    const xTo = [axisLength, 0, 0];
    const pXFrom = project(xFrom[0], xFrom[1], xFrom[2], rotX, rotY, W, H, zoom, centerX, centerY);
    const pXTo = project(xTo[0], xTo[1], xTo[2], rotX, rotY, W, H, zoom, centerX, centerY);
    
    // Línea del eje X con mayor grosor
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444aa';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.moveTo(pXFrom.sx, pXFrom.sy);
    ctx.lineTo(pXTo.sx, pXTo.sy);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Flechas en ambos extremos del eje X (más grandes)
    const angleX = Math.atan2(pXTo.sy - pXFrom.sy, pXTo.sx - pXFrom.sx);
    drawArrow(pXFrom.sx, pXFrom.sy, angleX + Math.PI, '#ef4444');
    drawArrow(pXTo.sx, pXTo.sy, angleX, '#ef4444');
    
    // Etiqueta X en el extremo positivo (más grande)
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('X', pXTo.sx + 12, pXTo.sy - 6);
    
    // Etiqueta en el extremo negativo
    ctx.fillStyle = '#ef444488';
    ctx.font = '10px monospace';
    ctx.fillText('0', pXFrom.sx - 18, pXFrom.sy - 6);

    // Añadir marcas de medición en el eje X
    for (let val = 0.1; val <= 0.5; val += 0.1) {
      const p = project(val, 0, 0, rotX, rotY, W, H, zoom, centerX, centerY);
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy - 6);
      ctx.lineTo(p.sx, p.sy + 6);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(val.toFixed(1), p.sx, p.sy + 16);
    }

    // Eje Y: desde -axisLength hasta axisLength en x=centerX
    const yFrom = [centerX, -axisLength, 0];
    const yTo = [centerX, axisLength, 0];
    const pYFrom = project(yFrom[0], yFrom[1], yFrom[2], rotX, rotY, W, H, zoom, centerX, centerY);
    const pYTo = project(yTo[0], yTo[1], yTo[2], rotX, rotY, W, H, zoom, centerX, centerY);
    
    // Línea del eje Y
    ctx.beginPath();
    ctx.strokeStyle = '#22c55e88';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.moveTo(pYFrom.sx, pYFrom.sy);
    ctx.lineTo(pYTo.sx, pYTo.sy);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Flechas en ambos extremos del eje Y
    const angleY = Math.atan2(pYTo.sy - pYFrom.sy, pYTo.sx - pYFrom.sx);
    drawArrow(pYFrom.sx, pYFrom.sy, angleY + Math.PI, '#22c55e');
    drawArrow(pYTo.sx, pYTo.sy, angleY, '#22c55e');
    
    // Etiqueta Y en el extremo positivo
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('Y', pYTo.sx + 10, pYTo.sy - 6);
    
    // Etiqueta en el extremo negativo
    ctx.fillStyle = '#22c55e66';
    ctx.font = '10px monospace';
    const negYLabel = project(centerX, -axisLength, 0, rotX, rotY, W, H, zoom, centerX, centerY);
    ctx.fillText('-0.5', negYLabel.sx - 24, negYLabel.sy - 6);

    // Añadir marcas de medición en el eje Y
    for (let val = -0.5; val <= 0.5; val += 0.1) {
      if (Math.abs(val) < 0.01) continue;
      const p = project(centerX, val, 0, rotX, rotY, W, H, zoom, centerX, centerY);
      ctx.beginPath();
      ctx.moveTo(p.sx - 6, p.sy);
      ctx.lineTo(p.sx + 6, p.sy);
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.5)';
      ctx.font = '8px monospace';
      ctx.textAlign = val < 0 ? 'right' : 'left';
      ctx.fillText(val.toFixed(1), p.sx + (val < 0 ? -8 : 8), p.sy + 4);
    }

    // Marcar el origen (0,0)
    const origin = project(0, 0, 0, rotX, rotY, W, H, zoom, centerX, centerY);
    ctx.beginPath();
    ctx.arc(origin.sx, origin.sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('(0,0)', origin.sx + 8, origin.sy - 8);

    // Grid dots en la región x >= 0 (hasta axisLength)
    // Grid más denso en X para mostrar mejor el estiramiento
    for (let xi = 0; xi <= axisLength; xi += 0.1) {
      for (let yi = -axisLength; yi <= axisLength; yi += 0.1) {
        const p = project(xi, yi, 0, rotX, rotY, W, H, zoom, centerX, centerY);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
      }
    }

    // Sort by depth so closer points are on top
    const projected = filteredPoints.map(pt => {
      const p = project(pt.x, pt.y, pt.z, rotX, rotY, W, H, zoom, centerX, centerY);
      return { ...pt, sx: p.sx, sy: p.sy, z2: p.z2 };
    }).sort((a, b) => a.z2 - b.z2);

    // Draw connections from me to nearest
    if (myCoords && myCoords.x >= 0) {
      const me = project(myCoords.x, myCoords.y, myCoords.z, rotX, rotY, W, H, zoom, centerX, centerY);
      filteredPoints.filter(p => p.isClosest && p.x >= 0).forEach(pt => {
        const p = project(pt.x, pt.y, pt.z, rotX, rotY, W, H, zoom, centerX, centerY);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(251,191,36,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(me.sx, me.sy);
        ctx.lineTo(p.sx, p.sy);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // Draw points
    projected.forEach(pt => {
      const isSelected = selectedUser?.userId === pt.userId;
      const r = pt.isMe ? 12 : pt.isClosest ? 10 : isSelected ? 9 : 7;
      const color = pt.isMe ? '#a855f7' : pt.isClosest ? '#fbbf24' : '#6366f1';

      // Glow
      if (pt.isMe || pt.isClosest || isSelected) {
        const grd = ctx.createRadialGradient(pt.sx, pt.sy, 0, pt.sx, pt.sy, r * 3.5);
        grd.addColorStop(0, color + '55');
        grd.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, r * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Dot
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (pt.isMe) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Label
      if (pt.isMe) {
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('YOU', pt.sx + 14, pt.sy - 8);
      } else if (pt.isClosest) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '11px sans-serif';
        ctx.fillText(pt.userName, pt.sx + 12, pt.sy - 6);
      } else if (isSelected) {
        ctx.fillStyle = '#f0f6fc';
        ctx.font = '11px sans-serif';
        ctx.fillText(pt.userName, pt.sx + 10, pt.sy - 6);
      }
    });

    // Mostrar mensaje si no hay puntos visibles
    if (filteredPoints.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No hay usuarios con x ≥ 0', W/2, H/2);
    }

    // Añadir indicador de escala
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('X: 0→0.5 (visualmente estirado ×1.8)', W - 12, H - 8);
  }, [filteredPoints, selectedUser]);

  // Auto-rotate
  useEffect(() => {
    let last = 0;
    const tick = (t: number) => {
      if (autoRotRef.current && !dragRef.current.active) {
        rotRef.current.y += (t - last) * 0.0002;
      }
      last = t;
      draw();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    autoRotRef.current = false;
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.active) {
      // Tooltip
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const W = canvas.width, H = canvas.height;
      let found: Point3D | null = null;
      for (const pt of filteredPoints) {
        const p = project(pt.x, pt.y, pt.z, rotRef.current.x, rotRef.current.y, W, H, zoomRef.current, centerX, centerY);
        if (Math.hypot(p.sx - mx, p.sy - my) < 16) { found = pt; break; }
      }
      setTooltip(found ? { text: `${found.userName} — ${Math.round(found.compatibilityScore)}% compat`, x: e.clientX, y: e.clientY } : null);
      return;
    }
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    rotRef.current.y += dx * 0.01;
    rotRef.current.x += dy * 0.01;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  };
  const onMouseUp = () => { dragRef.current.active = false; };
  const onWheel = (e: React.WheelEvent) => {
    zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current - e.deltaY * 0.001));
  };
  const onClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    for (const pt of filteredPoints) {
      const p = project(pt.x, pt.y, pt.z, rotRef.current.x, rotRef.current.y, W, H, zoomRef.current, centerX, centerY);
      if (Math.hypot(p.sx - mx, p.sy - my) < 16) {
        setSelectedUser(prev => prev?.userId === pt.userId ? null : pt);
        return;
      }
    }
    setSelectedUser(null);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '420px', borderRadius: '10px', overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--border)' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: dragRef.current.active ? 'grabbing' : 'grab', display: 'block' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onClick}
      />

      {/* Controls hint */}
      <div style={{ position: 'absolute', bottom: '12px', left: '12px', fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: '1.6', pointerEvents: 'none' }}>
        🖱 Drag to rotate · Scroll to zoom · Click a dot to inspect
      </div>

      {/* Auto-rotate toggle */}
      <button
        style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '11px', padding: '4px 10px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted-foreground)', cursor: 'pointer' }}
        onClick={() => { autoRotRef.current = !autoRotRef.current; }}
      >
        {autoRotRef.current ? '⏸ Stop rotation' : '▶ Auto-rotate'}
      </button>

      {/* Legend */}
      <div style={{ position: 'absolute', top: '12px', left: '12px', fontSize: '11px', color: 'var(--muted-foreground)', display: 'flex', flexDirection: 'column', gap: '3px', pointerEvents: 'none' }}>
        <span>🟣 You</span>
        <span>🟡 Best match</span>
        <span>🔵 Others</span>
        <span style={{ fontSize: '9px', opacity: 0.5 }}>📌 Rotación en (0.26, 0, 0)</span>
        <span style={{ fontSize: '9px', opacity: 0.4 }}>📐 Ejes: X[0→0.5] · Y[-0.5→0.5]</span>
        <span style={{ fontSize: '9px', opacity: 0.4, color: '#ef4444' }}>⬅️ X visualmente estirado ×1.8</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: 'fixed', top: tooltip.y - 36, left: tooltip.x + 10, background: '#1c2128', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--foreground)', pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap' }}>
          {tooltip.text}
        </div>
      )}

      {/* Selected user panel */}
      {selectedUser && (
        <div style={{ position: 'absolute', bottom: '36px', right: '12px', background: '#1c2128', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', minWidth: '180px' }}>
          <p style={{ fontWeight: '700', marginBottom: '6px' }}>{selectedUser.userName} {selectedUser.isMe && '(You)'}</p>
          <p style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace', fontSize: '11px', marginBottom: '6px' }}>
            [{selectedUser.x.toFixed(3)}, {selectedUser.y.toFixed(3)}, {selectedUser.z.toFixed(3)}]
          </p>
          <p style={{ color: '#9f5ef8', fontWeight: '700' }}>{Math.round(selectedUser.compatibilityScore)}% compatible</p>
          <button onClick={() => setSelectedUser(null)} style={{ position: 'absolute', top: '6px', right: '8px', background: 'none', border: 'none', color: 'var(--muted-foreground)', fontSize: '14px', cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function LatentSpace() {
  const { latentUsers, latentProfile, latentHistory, loadingLatent, fetchLatent } = useMusicMatch();

  useEffect(() => { fetchLatent(); }, []);

  if (loadingLatent) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Forzar Z a 0 para todos los puntos
  const myCoords = latentProfile ? { 
    x: latentProfile.coordX, 
    y: latentProfile.coordY, 
    z: 0
  } : null;
  
  const sortedUsers = [...latentUsers].sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  const distanceTo = (u: { x: number; y: number; z: number }) => {
    if (!myCoords) return 0;
    return Math.hypot(u.x - myCoords.x, u.y - myCoords.y);
  };

  // Build Point3D list - forzamos Z a 0
  const points: Point3D[] = sortedUsers.map(u => ({
    x: u.x, 
    y: u.y, 
    z: 0,
    userId: u.userId, 
    userName: u.userName,
    compatibilityScore: u.compatibilityScore,
    isMe: !!(latentProfile && u.userId === latentProfile.userId),
    isClosest: !!(latentProfile && u.userId === latentProfile.closestUserId),
  }));

  const usersWithXNegative = points.filter(p => p.x < 0).length;

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <h1>🧬 Latent Space</h1>
          <p>SVD-based 2D visualization · Centro de rotación en (0.26, 0, 0) · Ejes: X[0→0.5] Y[-0.5→0.5]</p>
          <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '4px' }}>
            📐 Eje X visualmente estirado ×1.8 para mejor visualización
          </p>
          {usersWithXNegative > 0 && (
            <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', marginTop: '2px' }}>
              ⚠️ {usersWithXNegative} usuarios con x {'<'} 0 están ocultos en esta visualización
            </p>
          )}
        </div>

        {/* My position */}
        {latentProfile && myCoords && (
          <div className="section">
            <h3>Your Position</h3>
            <div className="card" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(6,182,212,0.1) 100%)', border: '1px solid rgba(124,58,237,0.4)' }}>
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                {(['X', 'Y', 'Z'] as const).map((axis, i) => {
                  const val = [myCoords.x, myCoords.y, myCoords.z][i];
                  const colors = ['#ef4444', '#22c55e', '#3b82f6'];
                  return (
                    <div key={axis} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{axis} Axis</p>
                      <p style={{ fontSize: '28px', fontWeight: '700', color: colors[i], fontFamily: 'monospace' }}>{val.toFixed(3)}</p>
                    </div>
                  );
                })}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Best Match</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#fbbf24' }}>{Math.round(latentProfile.compatibilityScore)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2D Space */}
        {points.filter(p => p.x >= 0).length > 0 ? (
          <div className="section">
            <h3>2D Space Map</h3>
            <Space3D points={points} myCoords={myCoords} />
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No users with x ≥ 0</h3>
            <p>Todos los usuarios tienen x {'<'} 0 en el espacio latente</p>
          </div>
        )}

        {/* History */}
        {latentHistory.length > 0 && (
          <div className="section">
            <h3>Your Evolution Over Time</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {latentHistory.slice(0, 10).map((h, i) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', width: '20px', textAlign: 'center' }}>#{i + 1}</span>
                  <code style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'monospace', flex: 1 }}>
                    [{h.coordX.toFixed(3)}, {h.coordY.toFixed(3)}, 0.000]
                  </code>
                  <span className="badge badge-primary">{Math.round(h.compatibilityScore)}% compat</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', flexShrink: 0 }}>{h.ratingsCount} ratings</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User table */}
        <div className="section">
          <h3>All Users ({sortedUsers.length})</h3>
          {sortedUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🧬</div>
              <h3>No latent data</h3>
              <p>Rate songs to compute your latent profile</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sortedUsers.map(u => {
                const isMe = latentProfile && u.userId === latentProfile.userId;
                const isClosest = latentProfile && u.userId === latentProfile.closestUserId;
                const dist = distanceTo(u);
                const isVisible = u.x >= 0;
                return (
                  <div key={u.userId} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                    background: isMe ? 'rgba(124,58,237,0.15)' : isClosest ? 'rgba(251,191,36,0.08)' : 'var(--card)',
                    border: `1px solid ${isMe ? 'rgba(124,58,237,0.5)' : isClosest ? 'rgba(251,191,36,0.4)' : 'var(--border)'}`,
                    borderRadius: '8px',
                    opacity: isVisible ? 1 : 0.4,
                  }}>
                    <div className="avatar avatar-sm">{u.userName[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: '600', fontSize: '14px' }}>
                        {u.userName}
                        {isMe && <span style={{ color: 'var(--primary)', fontSize: '12px' }}> (You)</span>}
                        {isClosest && !isMe && <span style={{ color: '#fbbf24', fontSize: '12px' }}> ⭐ Best match</span>}
                        {!isVisible && <span style={{ color: 'var(--muted-foreground)', fontSize: '11px' }}> (oculto - x &lt; 0)</span>}
                      </p>
                      <code style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                        [{u.x.toFixed(3)}, {u.y.toFixed(3)}, 0.000]
                      </code>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: '700', fontSize: '14px', color: '#9f5ef8' }}>{Math.round(u.compatibilityScore)}%</p>
                      {!isMe && <p style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>d={dist.toFixed(3)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}