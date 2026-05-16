function setupDrawEvents(canvas, svg, key) {
  const container = canvas.parentElement;

  const getPos = (e) => {
    const rect  = canvas.getBoundingClientRect();
    const src   = e.touches ? e.touches[0] : e;
    const dpr   = window.devicePixelRatio || 1;
    const scale = zoomScales[key] || 1;
    const baseW = rect.width  / scale;
    const baseH = rect.height / scale;
    const relX  = (src.clientX - rect.left) / scale;
    const relY  = (src.clientY - rect.top)  / scale;
    return {
      x:  relX * dpr,
      y:  relY * dpr,
      nx: relX / baseW,
      ny: relY / baseH,
    };
  };

  // ===== ポインタ開始 =====
  const onStart = (e) => {
    if (e.touches && e.touches.length >= 2) {
      if (drawState[key]) drawState[key].drawing = false;
      return;
    }
    const ds = drawState[key];

    if (ds?._pinchInProgress) {
      ds._pinchInProgress = false;
      return;
    }

    if (ds?.tool === 'scroll') return;
    e.preventDefault();
    const pos = getPos(e);

    if (ds.tool === 'select') {
      const hit = hitTest(pos.nx, pos.ny, ds.objects, canvas);
      if (hit) {
        ds.selectedId    = hit.id;
        ds.selectedIds   = [hit.id];
        ds.selectedPenIds = [];
        ds.drawing       = true;
        ds.isRangeSelect = false;
        ds._pendingMove  = true;  // 移動確定待ち
        ds.startX = pos.nx; ds.startY = pos.ny;
        ds.lastX  = pos.nx; ds.lastY  = pos.ny;
      } else if (ds.selectedPenIds?.length && isPenHit(pos.nx, pos.ny, ds.selectedPenIds, ds.penStrokes||[])) {
        ds.drawing       = true;
        ds.isRangeSelect = false;
        ds._pendingMove  = true;  // 移動確定待ち
        ds.startX = pos.nx; ds.startY = pos.ny;
        ds.lastX  = pos.nx; ds.lastY  = pos.ny;
      } else {
        ds.selectedId    = null;
        ds.selectedPenIds = [];
        ds._pendingMove  = false;
        ds.drawing       = true;
        ds.isRangeSelect = true;
        ds.startX = pos.nx; ds.startY = pos.ny;
        ds.lastX  = pos.nx; ds.lastY  = pos.ny;
      }
      renderSVGObjects(key);
      renderSelectedPenStrokes(key);
      return;
    }

    ds.drawing = true;
    ds.isRangeSelect = false;
    ds.startX = pos.nx; ds.startY = pos.ny;
    ds.lastX  = pos.nx; ds.lastY  = pos.ny;

    if (ds.tool === 'pen' || ds.tool === 'eraser') {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.offsetWidth;
      const cssH = canvas.offsetHeight;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        const saved = canvas.toDataURL();
        canvas.width  = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        if (saved && saved !== 'data:,') {
          const img2 = new Image();
          img2.onload = () => canvas.getContext('2d').drawImage(img2, 0, 0, canvas.width, canvas.height);
          img2.src = saved;
        }
      }
      if (!ds.history) ds.history = [];
      ds.history.push({ type: 'pen', penData: canvas.toDataURL(), penStrokes: (ds.penStrokes||[]).map(s=>({...s,points:[...s.points]})) });
      if (ds.history.length > 30) ds.history.shift();
      if (!ds.penStrokes) ds.penStrokes = [];
      ds._currentStroke = { id: Date.now(), color: ds.color, sizeMM: ds.sizeMM, points: [{nx:pos.nx, ny:pos.ny, x:pos.x, y:pos.y}] };
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  // ===== ポインタ移動 =====
  const onMove = (e) => {
    if (e.touches && e.touches.length >= 2) {
      if (drawState[key]) drawState[key].drawing = false;
      clearPreviewLine(key);
      return;
    }
    const ds = drawState[key];
    if (!ds.drawing) return;
    if (ds.tool === 'scroll') return;
    e.preventDefault();
    const pos = getPos(e);
    ds.lastX = pos.nx; ds.lastY = pos.ny;

    if (ds.tool === 'select' && ds.isRangeSelect) {
      renderRangeSelect(key, ds.startX, ds.startY, pos.nx, pos.ny);
      return;
    }

    if (ds.tool === 'pen') {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.lineWidth   = mmToPx(ds.sizeMM, dpr);
      ctx.lineCap     = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = ds.color;
      ctx.globalCompositeOperation = 'source-over';

      if (ds._currentStroke && ds._currentStroke.points.length >= 2) {
        const pts = ds._currentStroke.points;
        const prev = pts[pts.length - 1];
        const midX = (prev.x + pos.x) / 2;
        const midY = (prev.y + pos.y) / 2;
        ctx.beginPath();
        ctx.moveTo((pts.length >= 2 ? (pts[pts.length-2].x + prev.x)/2 : prev.x), 
                   (pts.length >= 2 ? (pts[pts.length-2].y + prev.y)/2 : prev.y));
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        ctx.stroke();
      } else {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }

      if (ds._currentStroke) {
        const pts = ds._currentStroke.points;
        const last = pts[pts.length-1];
        if (!last || Math.hypot(pos.nx-last.nx, pos.ny-last.ny) > 0.002) {
          pts.push({nx:pos.nx, ny:pos.ny, x:pos.x, y:pos.y});
        }
      }
      requestAnimationFrame(() => {});
    } else if (ds.tool === 'eraser') {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.lineWidth = mmToPx(ds.sizeMM * 4, dpr);
      ctx.lineCap   = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      requestAnimationFrame(() => {});
    } else if (ds.tool === 'line' || ds.tool === 'arrow') {
      const epSnap = snapToEndpoints(pos.nx, pos.ny, ds.objects, null);
      const snapped = snapLineAngle(ds.startX, ds.startY, epSnap.nx, epSnap.ny);
      renderPreviewLine(key, ds.startX, ds.startY, snapped.x2, snapped.y2, ds.color, ds.sizeMM, ds.tool === 'arrow');
      if (epSnap.snapped) showSnapIndicator(key, '端点');
      else if (snapped.snapped) showSnapIndicator(key, snapped.label);
      else hideSnapIndicator(key);
    } else if (ds.tool === 'rect' || ds.tool === 'ellipse' || ds.tool === 'square') {
      let ex2 = pos.nx, ey2 = pos.ny;
      if (ds.tool === 'square') {
        const dw = Math.abs(pos.nx - ds.startX);
        const dh = Math.abs(pos.ny - ds.startY);
        const size = Math.min(dw, dh);
        ex2 = ds.startX + (pos.nx > ds.startX ? size : -size);
        ey2 = ds.startY + (pos.ny > ds.startY ? size : -size);
      }
      const shapeType = ds.tool === 'square' ? 'rect' : ds.tool;
      renderPreviewShape(key, ds.startX, ds.startY, ex2, ey2, ds.color, ds.sizeMM, shapeType, ds.pattern);
    } else if (ds.tool === 'select' && ds.selectedId) {
      if (ds._pendingMove) {
        const dist = Math.hypot(pos.nx - ds.startX, pos.ny - ds.startY);
        if (dist < 0.005) return;
        ds._pendingMove = false;
        if (!ds.history) ds.history = [];
        ds.history.push({ type: 'object', objects: ds.objects.map(o => ({...o})) });
        if (ds.history.length > 50) ds.history.shift();
      }
      const obj = ds.objects.find(o => o.id === ds.selectedId);
      if (obj) {
        const dx = pos.nx - ds.startX;
        const dy = pos.ny - ds.startY;
        obj.x1 += dx; obj.y1 += dy;
        obj.x2 += dx; obj.y2 += dy;
        ds.startX = pos.nx; ds.startY = pos.ny;

        if (obj.type === 'line' || obj.type === 'arrow') {
          const snap1 = snapToEndpoints(obj.x1, obj.y1, ds.objects, obj.id);
          const snap2 = snapToEndpoints(obj.x2, obj.y2, ds.objects, obj.id);
          if (snap1.snapped) {
            const sdx = snap1.nx - obj.x1, sdy = snap1.ny - obj.y1;
            obj.x1 = snap1.nx; obj.y1 = snap1.ny;
            obj.x2 += sdx; obj.y2 += sdy;
            showSnapIndicator(key, '端点');
          } else if (snap2.snapped) {
            const sdx = snap2.nx - obj.x2, sdy = snap2.ny - obj.y2;
            obj.x2 = snap2.nx; obj.y2 = snap2.ny;
            obj.x1 += sdx; obj.y1 += sdy;
            showSnapIndicator(key, '端点');
          } else {
            hideSnapIndicator(key);
          }
        } else {
          hideSnapIndicator(key);
        }
        renderSVGObjects(key);
      }
    } else if (ds.tool === 'select' && !ds.selectedId && ds.selectedPenIds?.length) {
      if (ds._pendingMove) {
        const dist = Math.hypot(pos.nx - ds.startX, pos.ny - ds.startY);
        if (dist < 0.005) return;
        ds._pendingMove = false;
        if (!ds.history) ds.history = [];
        ds.history.push({ type: 'pen', penData: canvas.toDataURL(), penStrokes: (ds.penStrokes||[]).map(s=>({...s,points:[...s.points]})) });
        if (ds.history.length > 50) ds.history.shift();
      }
      const dx = pos.nx - ds.startX;
      const dy = pos.ny - ds.startY;
      movePenStrokes(key, dx, dy);
      ds.startX = pos.nx; ds.startY = pos.ny;
      renderSelectedPenStrokes(key);
    } else if (ds.tool === 'select' && ds.selectedIds && ds.selectedIds.length > 1) {
      const dx = pos.nx - ds.startX;
      const dy = pos.ny - ds.startY;
      ds.objects.forEach(obj => {
        if (ds.selectedIds.includes(obj.id)) {
          obj.x1 += dx; obj.y1 += dy;
          obj.x2 += dx; obj.y2 += dy;
        }
      });
      if (ds.selectedPenIds?.length) {
        movePenStrokes(key, dx, dy);
        renderSelectedPenStrokes(key);
      }
      ds.startX = pos.nx; ds.startY = pos.ny;
      renderSVGObjects(key);
    }
  };

  // ===== ポインタ終了 =====
  const onEnd = (e) => {
    if (e.touches && e.touches.length >= 1) return;
    const ds = drawState[key];
    if (!ds.drawing) return;
    ds.drawing = false;
    ds._pendingMove = false;

    if (ds.tool === 'pen' && ds._currentStroke) {
      const pts = ds._currentStroke.points;
      if (pts.length >= 2) {
        const nxArr = pts.map(p=>p.nx), nyArr = pts.map(p=>p.ny);
        const pad = 0.01;
        ds._currentStroke.bbox = {
          x1: Math.min(...nxArr)-pad, y1: Math.min(...nyArr)-pad,
          x2: Math.max(...nxArr)+pad, y2: Math.max(...nyArr)+pad
        };
        if (!ds.penStrokes) ds.penStrokes = [];
        ds.penStrokes.push(ds._currentStroke);
      }
      ds._currentStroke = null;
    }

    if (ds.tool === 'select' && ds.isRangeSelect) {
      ds.isRangeSelect = false;
      const x1 = Math.min(ds.startX, ds.lastX ?? ds.startX);
      const y1 = Math.min(ds.startY, ds.lastY ?? ds.startY);
      const x2 = Math.max(ds.startX, ds.lastX ?? ds.startX);
      const y2 = Math.max(ds.startY, ds.lastY ?? ds.startY);
      const dragDist = Math.hypot(x2 - x1, y2 - y1);
      if (dragDist < 0.02) {
        ds.selectedId  = null;
        ds.selectedIds = [];
        ds.selectedPenIds = [];
        clearPreviewLine(key);
        renderSVGObjects(key);
        return;
      }
      const inRange = ds.objects.filter(obj => {
        const ox1 = Math.min(obj.x1, obj.x2), oy1 = Math.min(obj.y1, obj.y2);
        const ox2 = Math.max(obj.x1, obj.x2), oy2 = Math.max(obj.y1, obj.y2);
        return ox1 >= x1 && oy1 >= y1 && ox2 <= x2 && oy2 <= y2;
      });
      const inRangePen = (ds.penStrokes||[]).filter(s => {
        const b = s.bbox;
        return b && b.x1 >= x1 && b.y1 >= y1 && b.x2 <= x2 && b.y2 <= y2;
      });
      ds.selectedIds    = inRange.map(o => o.id);
      ds.selectedPenIds = inRangePen.map(s => s.id);
      ds.selectedId     = inRange.length === 1 && inRangePen.length === 0 ? inRange[0].id : null;
      clearPreviewLine(key);
      renderSVGObjects(key);
      renderSelectedPenStrokes(key);
      const total = inRange.length + inRangePen.length;
      if (total > 0) showToast(`${total}個を選択`, 'success');
      return;
    }
    ds.isRangeSelect = false;

    let ex = ds.lastX ?? ds.startX;
    let ey = ds.lastY ?? ds.startY;
    try {
      const rect = canvas.getBoundingClientRect();
      const src  = e.changedTouches?.[0] ?? e;
      if (src && src.clientX !== undefined) {
        ex = (src.clientX - rect.left) / rect.width;
        ey = (src.clientY - rect.top)  / rect.height;
      }
    } catch(err) {}

    if (ds.tool === 'line' || ds.tool === 'arrow') {
      const dist = Math.hypot(ex - ds.startX, ey - ds.startY);
      if (dist > 0.01) {
        const epSnap  = snapToEndpoints(ex, ey, ds.objects, null);
        const snapped = snapLineAngle(ds.startX, ds.startY, epSnap.nx, epSnap.ny);
        if (!ds.history) ds.history = [];
        ds.history.push({ type: 'object', objects: ds.objects.map(o => ({...o})) });
        if (ds.history.length > 30) ds.history.shift();
        ds.objects.push({
          id: Date.now(), type: ds.tool,
          x1: ds.startX, y1: ds.startY, x2: snapped.x2, y2: snapped.y2,
          color: ds.color, sizeMM: ds.sizeMM
        });
      }
      hideSnapIndicator(key);
      clearPreviewLine(key);
      renderSVGObjects(key);
      const wasDamageAdd = ds.damageAddMode;
      if (wasDamageAdd && dist > 0.01) {
        ds.damageAddMode = false;
        const btn = document.getElementById(`tool-damageadd-${key}`);
        if (btn) { btn.classList.remove('active'); btn.textContent = '＋ 損傷追加'; }
        setTool('scroll', key);
        showDamageCameraPrompt(key);
      }

    } else if (ds.tool === 'rect' || ds.tool === 'ellipse' || ds.tool === 'square') {
      const dist = Math.hypot(ex - ds.startX, ey - ds.startY);
      if (dist > 0.01) {
        let x2 = ex, y2 = ey;
        const dw = Math.abs(ex - ds.startX);
        const dh = Math.abs(ey - ds.startY);
        if (dw > 0 && dh > 0) {
          const forceSquare = ds.tool === 'square';
          const ratio = Math.min(dw, dh) / Math.max(dw, dh);
          if (forceSquare || ratio > 0.85) {
            const size = Math.min(dw, dh);
            x2 = ds.startX + (ex > ds.startX ? size : -size);
            y2 = ds.startY + (ey > ds.startY ? size : -size);
          }
        }
        if (!ds.history) ds.history = [];
        ds.history.push({ type: 'object', objects: ds.objects.map(o => ({...o})) });
        if (ds.history.length > 30) ds.history.shift();
        const type = ds.tool === 'square' ? 'rect' : ds.tool;
        ds.objects.push({
          id: Date.now(), type,
          x1: ds.startX, y1: ds.startY, x2, y2,
          color: ds.color, sizeMM: ds.sizeMM, pattern: ds.pattern
        });
      }
      clearPreviewLine(key);
      renderSVGObjects(key);
    }
    if (ds.tool === 'select' && ds.selectedPenIds?.length) {
      redrawPenStrokes(key);
      renderSelectedPenStrokes(key);
    }
  };

  canvas.addEventListener('touchcancel', () => {
    if (drawState[key]) {
      drawState[key].drawing = false;
      clearPreviewLine(key);
    }
  });

  // ===== 長押しでコピー・貼り付け（選択ツール専用）=====
  let longPressTimer = null;
  let longPressTouchPos = { nx: 0, ny: 0 };

  const onLongPressStart = (e) => {
    const ds = drawState[key];
    const hasClip = !!(globalClipboard || globalClipboardPen || ds?.clipboard);
    if (ds?.tool !== 'select' && !hasClip) return;
    if (e.touches && e.touches[0]) {
      const p = getPos(e);
      longPressTouchPos = { nx: p.nx, ny: p.ny };
    }
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      const ds2 = drawState[key];
      if (!ds2) return;
      const hasSVGSel  = !!ds2.selectedId;
      const hasPenSel  = !!(ds2.selectedPenIds?.length);
      const hasClipSVG = !!globalClipboard;
      const hasClipPen = !!globalClipboardPen;
      const hasAnyClip = hasClipSVG || hasClipPen;

      const items = [];
      if (hasSVGSel || hasPenSel) items.push({ label: '📋 コピー', action: 'copy' });
      if (hasAnyClip)              items.push({ label: '📌 貼り付け', action: 'paste' });
      if (items.length === 0) return;

      document.querySelectorAll('.longpress-menu').forEach(el => el.remove());

      const canvas = document.getElementById(`drawcanvas-${key}`);
      const rect   = canvas.getBoundingClientRect();
      const menu   = document.createElement('div');
      menu.className = 'longpress-menu';
      menu.style.cssText = `
        position:fixed; z-index:9999;
        left:${rect.left + longPressTouchPos.nx * rect.width}px;
        top:${rect.top  + longPressTouchPos.ny * rect.height - 60}px;
        transform:translateX(-50%);
        background:var(--surface2,#2a2a2a); border:1px solid var(--border);
        border-radius:10px; overflow:hidden;
        box-shadow:0 4px 16px rgba(0,0,0,0.4);
        display:flex; flex-direction:row;
      `;
      items.forEach(item => {
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.style.cssText = 'padding:12px 18px;font-size:14px;font-weight:700;background:none;border:none;color:var(--text);cursor:pointer;white-space:nowrap;';
        btn.addEventListener('touchstart', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          menu.remove();
          if (item.action === 'copy') {
            if (hasSVGSel) {
              copySelected(key);
            } else if (hasPenSel) {
              copyPenStrokes(key); globalClipboard = null; globalClipboardMulti = null;
              showToast('📋 ペンをコピー', 'success');
            }
          } else if (item.action === 'paste') {
            if (hasClipSVG) pasteObjAtPos(key, longPressTouchPos.nx, longPressTouchPos.ny);
            else if (hasClipPen) pastePenStrokes(key);
          }
        }, { passive: false });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      setTimeout(() => {
        const dismiss = () => { menu.remove(); document.removeEventListener('touchstart', dismiss); };
        document.addEventListener('touchstart', dismiss, { passive: true });
      }, 100);
    }, 400);
  };

  const onLongPressEnd = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  };

  canvas.addEventListener('touchstart', onLongPressStart, { passive: true });
  canvas.addEventListener('touchend',   onLongPressEnd,   { passive: true });
  canvas.addEventListener('touchmove',  onLongPressEnd,   { passive: true });

  canvas.addEventListener('mousedown',  onStart);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onEnd);
  canvas.addEventListener('touchstart', onStart, { passive:false });
  canvas.addEventListener('touchmove',  onMove,  { passive:false });
  canvas.addEventListener('touchend',   onEnd,   { passive:false });
}

// ===== SVGオブジェクト描画 =====
function makeDefs(svg, id, color, pattern) {
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg','defs'); svg.prepend(defs); }
  const pid = `pat-${String(id).replace('.', '_')}`;
  const existing = defs.querySelector(`#${pid}`);
  if (existing) existing.remove();

  if (pattern === 'none') return 'none';
  if (pattern === 'solid') return color;

  const pat = document.createElementNS('http://www.w3.org/2000/svg','pattern');
  pat.setAttribute('id', pid);
  pat.setAttribute('patternUnits','userSpaceOnUse');
  pat.setAttribute('width','8'); pat.setAttribute('height','8');

  if (pattern === 'diag') {
    const l = document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1','0'); l.setAttribute('y1','0');
    l.setAttribute('x2','8'); l.setAttribute('y2','8');
    l.setAttribute('stroke', color); l.setAttribute('stroke-width','1');
    pat.appendChild(l);
  } else if (pattern === 'hatch') {
    ['0,0,0,8','0,0,8,0'].forEach(pts => {
      const [x1,y1,x2,y2] = pts.split(',');
      const l = document.createElementNS('http://www.w3.org/2000/svg','line');
      l.setAttribute('x1',x1); l.setAttribute('y1',y1);
      l.setAttribute('x2',x2); l.setAttribute('y2',y2);
      l.setAttribute('stroke', color); l.setAttribute('stroke-width','1');
      pat.appendChild(l);
    });
  }
  defs.appendChild(pat);
  return `url(#${pid})`;
}

function renderSVGObjects(key, _retry = 0) {
  try {
  const svg = document.getElementById(`drawsvg-${key}`);
  const canvas = document.getElementById(`drawcanvas-${key}`);
  if (!svg || !canvas) return;
  const ds = drawState[key];
  if (!ds) return;
  svg.innerHTML = '';

  const W = canvas.offsetWidth  || canvas.getBoundingClientRect().width;
  const H = canvas.offsetHeight || canvas.getBoundingClientRect().height;

  if ((W === 0 || H === 0) && ds.objects?.length > 0) {
    if (_retry < 10) setTimeout(() => renderSVGObjects(key, _retry + 1), 150);
    return;
  }

  if (!ds.selectedId) closeEditPanel();

  ds.objects.forEach(obj => {
    const x1 = obj.x1 * W, y1 = obj.y1 * H;
    const x2 = obj.x2 * W, y2 = obj.y2 * H;
    const sw = mmToPx(obj.sizeMM, 1);
    const isSel = ds.selectedId === obj.id;
    const strokeColor = (isSel && obj.type !== 'line' && obj.type !== 'arrow') ? '#60d0ff' : obj.color;

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','svg-obj' + (isSel ? ' selected' : ''));
    g.style.pointerEvents = 'none';

    const rot = obj.rotation || 0;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    if (rot !== 0) {
      g.setAttribute('transform', `rotate(${rot} ${cx} ${cy})`);
    }

    if (obj.type === 'line' || obj.type === 'arrow') {
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      line.setAttribute('stroke', strokeColor);
      line.setAttribute('stroke-width', sw);
      line.setAttribute('stroke-linecap','round');
      g.appendChild(line);

      if (obj.type === 'arrow') {
        const angle = Math.atan2(y2-y1, x2-x1);
        const al = Math.max(sw*4, 10);
        const arr = document.createElementNS('http://www.w3.org/2000/svg','polyline');
        arr.setAttribute('points',`${x2-al*Math.cos(angle-0.4)},${y2-al*Math.sin(angle-0.4)} ${x2},${y2} ${x2-al*Math.cos(angle+0.4)},${y2-al*Math.sin(angle+0.4)}`);
        arr.setAttribute('stroke', strokeColor); arr.setAttribute('stroke-width', sw);
        arr.setAttribute('fill','none'); arr.setAttribute('stroke-linecap','round');
        g.appendChild(arr);

        if (obj.label) {
          const fontSize = Math.max(W * 0.013, 10);
          const lines = obj.label.split('　');
          const offX = x1 < x2 ? -4 : 4;
          const anchor = x1 < x2 ? 'end' : 'start';
          lines.forEach((line, i) => {
            const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
            txt.setAttribute('x', x1 + offX);
            txt.setAttribute('y', y1 - fontSize * (lines.length - 1 - i) - 3);
            txt.setAttribute('font-size', fontSize);
            txt.setAttribute('font-family', 'sans-serif');
            txt.setAttribute('fill', obj.color);
            txt.setAttribute('text-anchor', anchor);
            txt.setAttribute('pointer-events', 'none');
            txt.textContent = line;
            g.appendChild(txt);
          });
        }
      }

      const hit = document.createElementNS('http://www.w3.org/2000/svg','line');
      hit.setAttribute('x1',x1); hit.setAttribute('y1',y1);
      hit.setAttribute('x2',x2); hit.setAttribute('y2',y2);
      hit.setAttribute('stroke','transparent');
      hit.setAttribute('stroke-width', isSel ? '0' : Math.max(sw+12,16));
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => { ds.selectedId = ds.selectedId===obj.id?null:obj.id; renderSVGObjects(key); });
      g.appendChild(hit);

      if (isSel) {
        const selLine = document.createElementNS('http://www.w3.org/2000/svg','line');
        selLine.setAttribute('x1',x1); selLine.setAttribute('y1',y1);
        selLine.setAttribute('x2',x2); selLine.setAttribute('y2',y2);
        selLine.setAttribute('stroke','#60d0ff');
        selLine.setAttribute('stroke-width', '1.5');
        selLine.setAttribute('stroke-dasharray','5 4');
        selLine.setAttribute('stroke-linecap','round');
        selLine.setAttribute('pointer-events','none');
        g.appendChild(selLine);
      }

    } else if (obj.type === 'rect') {
      const rx = Math.min(x1,x2), ry = Math.min(y1,y2);
      const rw = Math.abs(x2-x1),  rh = Math.abs(y2-y1);
      const fillUrl = makeDefs(svg, obj.id, obj.color, obj.pattern || 'none');
      const fillOpacity = (obj.pattern === 'solid') ? 0.3 : 1;

      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x',rx); rect.setAttribute('y',ry);
      rect.setAttribute('width',rw); rect.setAttribute('height',rh);
      rect.setAttribute('stroke', strokeColor); rect.setAttribute('stroke-width', sw);
      rect.setAttribute('fill', fillUrl === 'none' ? 'none' : fillUrl);
      if (obj.pattern === 'solid') rect.setAttribute('fill-opacity', fillOpacity);
      g.appendChild(rect);

      const hit = document.createElementNS('http://www.w3.org/2000/svg','rect');
      hit.setAttribute('x',rx-6); hit.setAttribute('y',ry-6);
      hit.setAttribute('width',rw+12); hit.setAttribute('height',rh+12);
      hit.setAttribute('fill','transparent'); hit.setAttribute('stroke','transparent');
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => { ds.selectedId = ds.selectedId===obj.id?null:obj.id; renderSVGObjects(key); });
      g.appendChild(hit);

    } else if (obj.type === 'ellipse') {
      const cx = (x1+x2)/2, cy = (y1+y2)/2;
      const rx = Math.abs(x2-x1)/2, ry2 = Math.abs(y2-y1)/2;
      const fillUrl = makeDefs(svg, obj.id, obj.color, obj.pattern || 'none');
      const fillOpacity = (obj.pattern === 'solid') ? 0.3 : 1;

      const el = document.createElementNS('http://www.w3.org/2000/svg','ellipse');
      el.setAttribute('cx',cx); el.setAttribute('cy',cy);
      el.setAttribute('rx',rx); el.setAttribute('ry',ry2);
      el.setAttribute('stroke', strokeColor); el.setAttribute('stroke-width', sw);
      el.setAttribute('fill', fillUrl === 'none' ? 'none' : fillUrl);
      if (obj.pattern === 'solid') el.setAttribute('fill-opacity', fillOpacity);
      g.appendChild(el);

      const hit = document.createElementNS('http://www.w3.org/2000/svg','ellipse');
      hit.setAttribute('cx',cx); hit.setAttribute('cy',cy);
      hit.setAttribute('rx',rx+8); hit.setAttribute('ry',ry2+8);
      hit.setAttribute('fill','transparent'); hit.setAttribute('stroke','transparent');
      hit.style.pointerEvents = 'none';
      g.appendChild(hit);
    }

    if (isSel) {
      if (obj.type === 'line' || obj.type === 'arrow') {
        // ===== 直線・矢印：端点ハンドルのみ =====
        [[x1,y1,'p1'],[x2,y2,'p2']].forEach(([hx,hy,pt]) => {
          const hg = document.createElementNS('http://www.w3.org/2000/svg','g');
          hg.style.pointerEvents = 'auto';
          hg.style.cursor = 'move';

          const hitC = document.createElementNS('http://www.w3.org/2000/svg','circle');
          hitC.setAttribute('cx',hx); hitC.setAttribute('cy',hy);
          hitC.setAttribute('r', 24); hitC.setAttribute('fill','transparent');
          hg.appendChild(hitC);

          const dot = document.createElementNS('http://www.w3.org/2000/svg','rect');
          dot.setAttribute('x', hx-6); dot.setAttribute('y', hy-6);
          dot.setAttribute('width', 12); dot.setAttribute('height', 12);
          dot.setAttribute('rx', 2);
          dot.setAttribute('fill', '#60d0ff');
          dot.setAttribute('stroke', '#fff');
          dot.setAttribute('stroke-width', '1.5');
          dot.setAttribute('transform', `rotate(45 ${hx} ${hy})`);
          dot.setAttribute('pointer-events','none');
          hg.appendChild(dot);

          const onEpStart = (e) => startEndpointHandle(e, key, obj.id, pt);
          hg.addEventListener('mousedown',  onEpStart);
          hg.addEventListener('touchstart', onEpStart, { passive: false });
          g.appendChild(hg);
        });

      } else {
        // ===== rect/ellipse：青枠＋リサイズハンドル =====
        const bx = Math.min(x1,x2)-4, by = Math.min(y1,y2)-4;
        const bw = Math.abs(x2-x1)+8, bh = Math.abs(y2-y1)+8;
        const bmx = bx + bw/2, bmy = by + bh/2;

        const selRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
        selRect.setAttribute('x',bx); selRect.setAttribute('y',by);
        selRect.setAttribute('width',bw); selRect.setAttribute('height',bh);
        selRect.setAttribute('fill','none');
        selRect.setAttribute('stroke','#60d0ff');
        selRect.setAttribute('stroke-width','1');
        selRect.setAttribute('stroke-dasharray','4 3');
        g.appendChild(selRect);

        const handles = [
          { type:'tl', x:bx,    y:by,    corner:true  },
          { type:'tc', x:bmx,   y:by,    corner:false  },
          { type:'tr', x:bx+bw, y:by,    corner:true  },
          { type:'ml', x:bx,    y:bmy,   corner:false  },
          { type:'mr', x:bx+bw, y:bmy,   corner:false  },
          { type:'bl', x:bx,    y:by+bh, corner:true  },
          { type:'bc', x:bmx,   y:by+bh, corner:false  },
          { type:'br', x:bx+bw, y:by+bh, corner:true  },
        ];

        handles.forEach(h => {
          const hg = document.createElementNS('http://www.w3.org/2000/svg','g');
          hg.setAttribute('data-htype', h.type);
          hg.style.pointerEvents = 'auto';
          hg.style.cursor = h.corner
            ? (h.type==='tl'||h.type==='br' ? 'nwse-resize' : 'nesw-resize')
            : (h.type==='tc'||h.type==='bc' ? 'ns-resize'   : 'ew-resize');

          const hitCircle = document.createElementNS('http://www.w3.org/2000/svg','circle');
          hitCircle.setAttribute('cx', h.x); hitCircle.setAttribute('cy', h.y);
          hitCircle.setAttribute('r', 24);
          hitCircle.setAttribute('fill', 'transparent');
          hg.appendChild(hitCircle);

          const dot = document.createElementNS('http://www.w3.org/2000/svg','rect');
          const ds2 = 5;
          dot.setAttribute('x', h.x - ds2); dot.setAttribute('y', h.y - ds2);
          dot.setAttribute('width', ds2*2); dot.setAttribute('height', ds2*2);
          dot.setAttribute('rx', 2);
          dot.setAttribute('fill',   h.corner ? '#60d0ff' : '#fff');
          dot.setAttribute('stroke', '#60d0ff');
          dot.setAttribute('stroke-width', '1.5');
          dot.setAttribute('transform', `rotate(45 ${h.x} ${h.y})`);
          dot.setAttribute('pointer-events', 'none');
          hg.appendChild(dot);

          const onResStart = (e) => startResizeHandle(e, key, h.type);
          hg.addEventListener('mousedown',  onResStart);
          hg.addEventListener('touchstart', onResStart, { passive: false });
          g.appendChild(hg);
        });
      }
    }

    svg.appendChild(g);

    if (isSel && obj.type !== 'line' && obj.type !== 'arrow') {
      const hx = cx;
      const hy = Math.min(y1, y2) - 36;

      const rotGroup = document.createElementNS('http://www.w3.org/2000/svg','g');
      rotGroup.setAttribute('data-rot', '1');
      rotGroup.style.cursor = 'grab';
      rotGroup.style.pointerEvents = 'auto';

      const rotHitArea = document.createElementNS('http://www.w3.org/2000/svg','circle');
      rotHitArea.setAttribute('cx', hx);
      rotHitArea.setAttribute('cy', hy);
      rotHitArea.setAttribute('r', 28);
      rotHitArea.setAttribute('fill', 'transparent');
      rotGroup.appendChild(rotHitArea);

      const rotCircle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      rotCircle.setAttribute('cx', hx);
      rotCircle.setAttribute('cy', hy);
      rotCircle.setAttribute('r', 20);
      rotCircle.setAttribute('fill', 'var(--accent)');
      rotCircle.setAttribute('stroke', '#fff');
      rotCircle.setAttribute('stroke-width', '2.5');
      rotGroup.appendChild(rotCircle);

      const rotText = document.createElementNS('http://www.w3.org/2000/svg','text');
      rotText.setAttribute('x', hx);
      rotText.setAttribute('y', hy + 6);
      rotText.setAttribute('text-anchor', 'middle');
      rotText.setAttribute('font-size', '18');
      rotText.setAttribute('fill', '#fff');
      rotText.setAttribute('pointer-events', 'none');
      rotText.textContent = '↻';
      rotGroup.appendChild(rotText);

      const hintText = document.createElementNS('http://www.w3.org/2000/svg','text');
      hintText.setAttribute('x', hx);
      hintText.setAttribute('y', hy - 26);
      hintText.setAttribute('text-anchor', 'middle');
      hintText.setAttribute('font-size', '9');
      hintText.setAttribute('fill', 'var(--accent)');
      hintText.setAttribute('pointer-events', 'none');
      hintText.textContent = '押しながらドラッグ';
      rotGroup.appendChild(hintText);

      const onRotStart = (e) => {
        e.stopPropagation(); e.preventDefault();
        startRotateHandle(e, key);
      };
      rotGroup.addEventListener('mousedown',  onRotStart);
      rotGroup.addEventListener('touchstart', onRotStart, { passive: false });
      svg.appendChild(rotGroup);

      const editGroup = document.createElementNS('http://www.w3.org/2000/svg','g');
      editGroup.style.cursor = 'pointer';
      editGroup.style.pointerEvents = 'auto';

      const editCircle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      editCircle.setAttribute('cx', hx + 36);
      editCircle.setAttribute('cy', hy);
      editCircle.setAttribute('r', 14);
      editCircle.setAttribute('fill', '#f59e0b');
      editCircle.setAttribute('stroke', '#fff');
      editCircle.setAttribute('stroke-width', '2');
      editGroup.appendChild(editCircle);

      const editText = document.createElementNS('http://www.w3.org/2000/svg','text');
      editText.setAttribute('x', hx + 36);
      editText.setAttribute('y', hy + 4);
      editText.setAttribute('text-anchor', 'middle');
      editText.setAttribute('fill', '#fff');
      editText.setAttribute('font-size', '11');
      editText.setAttribute('pointer-events', 'none');
      editText.textContent = '編集';
      editGroup.appendChild(editText);

      editGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditPanel(key);
      });
      editGroup.addEventListener('touchend', (e) => {
        e.stopPropagation();
        openEditPanel(key);
      });
      svg.appendChild(editGroup);
    }
  });
  } catch(e) {
    console.error('renderSVGObjects error:', e);
  }
}

// ===== プレビュー線 =====
function renderPreviewLine(key, nx1, ny1, nx2, ny2, color, sizeMM, isArrow) {
  const svg = document.getElementById(`drawsvg-preview-${key}`);
  const canvas = document.getElementById(`drawcanvas-${key}`);
  if (!svg || !canvas) return;
  svg.innerHTML = '';
  const W = canvas.offsetWidth  || canvas.getBoundingClientRect().width;
  const H = canvas.offsetHeight || canvas.getBoundingClientRect().height;
  const sw = mmToPx(sizeMM, 1);
  const x1=nx1*W, y1=ny1*H, x2=nx2*W, y2=ny2*H;

  const line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',x1); line.setAttribute('y1',y1);
  line.setAttribute('x2',x2); line.setAttribute('y2',y2);
  line.setAttribute('stroke',color);
  line.setAttribute('stroke-width',sw);
  line.setAttribute('stroke-linecap','round');
  line.setAttribute('stroke-dasharray','6 4');
  line.setAttribute('opacity','0.8');
  svg.appendChild(line);

  if (isArrow) {
    const angle = Math.atan2(y2-y1, x2-x1);
    const al = Math.max(sw*4, 10);
    const arr = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    arr.setAttribute('points',
      `${x2 - al*Math.cos(angle-0.4)},${y2 - al*Math.sin(angle-0.4)} ${x2},${y2} ${x2 - al*Math.cos(angle+0.4)},${y2 - al*Math.sin(angle+0.4)}`
    );
    arr.setAttribute('stroke',color);
    arr.setAttribute('stroke-width',sw);
    arr.setAttribute('fill','none');
    arr.setAttribute('opacity','0.8');
    svg.appendChild(arr);
  }
}

function clearPreviewLine(key) {
  const svg = document.getElementById(`drawsvg-preview-${key}`);
  if (svg) svg.innerHTML = '';
}

// ===== 図形プレビュー =====
function renderPreviewShape(key, nx1, ny1, nx2, ny2, color, sizeMM, type, pattern) {
  const svg = document.getElementById(`drawsvg-preview-${key}`);
  const canvas = document.getElementById(`drawcanvas-${key}`);
  if (!svg || !canvas) return;
  svg.innerHTML = '';
  const W = canvas.offsetWidth  || canvas.getBoundingClientRect().width;
  const H = canvas.offsetHeight || canvas.getBoundingClientRect().height;
  const sw = mmToPx(sizeMM, 1);
  const x1=nx1*W, y1=ny1*H, x2=nx2*W, y2=ny2*H;

  let fill = 'none';
  if (pattern === 'solid') fill = color;

  if (type === 'rect') {
    const el = document.createElementNS('http://www.w3.org/2000/svg','rect');
    el.setAttribute('x',Math.min(x1,x2)); el.setAttribute('y',Math.min(y1,y2));
    el.setAttribute('width',Math.abs(x2-x1)); el.setAttribute('height',Math.abs(y2-y1));
    el.setAttribute('stroke',color); el.setAttribute('stroke-width',sw);
    el.setAttribute('stroke-dasharray','6 4');
    el.setAttribute('fill', fill); el.setAttribute('fill-opacity','0.2');
    svg.appendChild(el);
  } else if (type === 'square') {
    const bx=Math.min(x1,x2), by=Math.min(y1,y2);
    const bw=Math.abs(x2-x1), bh=Math.abs(y2-y1);
    const el = document.createElementNS('http://www.w3.org/2000/svg','rect');
    el.setAttribute('x',bx); el.setAttribute('y',by);
    el.setAttribute('width',bw); el.setAttribute('height',bh);
    el.setAttribute('stroke',color); el.setAttribute('stroke-width',sw);
    el.setAttribute('stroke-dasharray','6 4');
    el.setAttribute('fill', fill); el.setAttribute('fill-opacity','0.15');
    svg.appendChild(el);
    const d1 = document.createElementNS('http://www.w3.org/2000/svg','line');
    d1.setAttribute('x1',bx); d1.setAttribute('y1',by);
    d1.setAttribute('x2',bx+bw); d1.setAttribute('y2',by+bh);
    d1.setAttribute('stroke',color); d1.setAttribute('stroke-width', sw * 0.6);
    d1.setAttribute('stroke-dasharray','3 4'); d1.setAttribute('opacity','0.5');
    svg.appendChild(d1);
    const d2 = document.createElementNS('http://www.w3.org/2000/svg','line');
    d2.setAttribute('x1',bx+bw); d2.setAttribute('y1',by);
    d2.setAttribute('x2',bx); d2.setAttribute('y2',by+bh);
    d2.setAttribute('stroke',color); d2.setAttribute('stroke-width', sw * 0.6);
    d2.setAttribute('stroke-dasharray','3 4'); d2.setAttribute('opacity','0.5');
    svg.appendChild(d2);
  } else if (type === 'ellipse') {
    const cx=(x1+x2)/2, cy=(y1+y2)/2;
    const el = document.createElementNS('http://www.w3.org/2000/svg','ellipse');
    el.setAttribute('cx',cx); el.setAttribute('cy',cy);
    el.setAttribute('rx',Math.abs(x2-x1)/2); el.setAttribute('ry',Math.abs(y2-y1)/2);
    el.setAttribute('stroke',color); el.setAttribute('stroke-width',sw);
    el.setAttribute('stroke-dasharray','6 4');
    el.setAttribute('fill', fill); el.setAttribute('fill-opacity','0.2');
    svg.appendChild(el);
  }
}

// ===== ツール・パターン設定 =====
function setTool(tool, key) {
  const ds = drawState[key];
  if (!ds) return;
  ds.tool = tool;
  ds.selectedId = null;
  if (ds.damageAddMode && tool !== 'arrow') {
    ds.damageAddMode = false;
    const btn = document.getElementById(`tool-damageadd-${key}`);
    if (btn) { btn.classList.remove('active'); btn.textContent = '＋ 損傷追加'; }
  }
  ['pen','line','arrow','rect','square','ellipse','select','eraser','scroll'].forEach(t => {
    const btn = document.getElementById(`tool-${t}-${key}`);
    if (btn) btn.classList.toggle('active', t === tool);
  });
  const rectBtn = document.getElementById(`tool-rect-${key}`);
  if (rectBtn) {
    rectBtn.classList.toggle('active', tool === 'rect' || tool === 'square');
    rectBtn.textContent = tool === 'square' ? '■ 正方形' : '▭ 長方形';
  }
  const canvas = document.getElementById(`drawcanvas-${key}`);
  if (canvas) {
    canvas.style.cursor = tool === 'select' ? 'default'
                        : tool === 'scroll' ? 'grab'
                        : 'crosshair';
  }
  renderSVGObjects(key);
}

// ===== 損傷追加モード =====
function setDamageAddMode(key) {
  const ds = drawState[key];
  if (!ds) return;
  if (ds.damageAddMode) {
    ds.damageAddMode = false;
    const btn = document.getElementById(`tool-damageadd-${key}`);
    if (btn) { btn.classList.remove('active'); btn.textContent = '＋ 損傷追加'; }
    setTool('scroll', key);
    return;
  }
  ds.damageAddMode = true;
  const btn = document.getElementById(`tool-damageadd-${key}`);
  if (btn) { btn.classList.add('active'); btn.textContent = '✏️ 損傷追加中...'; }
  setTool('arrow', key);
  showToast('📍 図面上に引き出し線を描いてください', 'info');
}

let _damageAddDrawKey = null; // 損傷追加で描いた引き出し線のdrawKey

function showDamageCameraPrompt(drawKey) {
  _damageAddDrawKey = drawKey;
  const existing = document.getElementById('damage-camera-prompt');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.id = 'damage-camera-prompt';
  prompt.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    z-index:8000; background:#22c55e; color:#fff;
    border-radius:16px; padding:14px 28px;
    font-size:17px; font-weight:700;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    display:flex; align-items:center; gap:12px;
    white-space:nowrap;
  `;
  prompt.innerHTML = `
    <span>📷 引き出し線を描きました</span>
    <button onclick="startExtraPhoto('s10'); document.getElementById('damage-camera-prompt').remove();"
      style="background:#fff;color:#22c55e;border:none;border-radius:10px;padding:8px 18px;font-size:15px;font-weight:700;cursor:pointer;">
      撮影する
    </button>
    <button onclick="document.getElementById('damage-camera-prompt').remove();"
      style="background:rgba(255,255,255,0.25);color:#fff;border:none;border-radius:10px;padding:8px 12px;font-size:15px;cursor:pointer;">
      ✕
    </button>
  `;
  document.body.appendChild(prompt);

  setTimeout(() => {
    const el = document.getElementById('damage-camera-prompt');
    if (el) el.remove();
  }, 10000);
}

function toggleRectSquare(key) {
  const ds = drawState[key];
  if (!ds) return;
  const next = ds.tool === 'rect' ? 'square' : 'rect';
  setTool(next, key);
}

function setPattern(pattern, key, btn) {
  const ds = drawState[key];
  if (!ds) return;
  ds.pattern = pattern;
  document.querySelectorAll(`#toolbar-${key} [id^="pat-"]`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function hitTest(nx, ny, objects, canvas) {
  const W = canvas.getBoundingClientRect().width  || canvas.offsetWidth;
  const H = canvas.getBoundingClientRect().height || canvas.offsetHeight;
  const px = nx * W, py = ny * H;
  const THRESH = 28; // タップ許容範囲（px）小さいオブジェクトも選択しやすいよう拡大

  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    const x1 = o.x1*W, y1 = o.y1*H;
    const x2 = o.x2*W, y2 = o.y2*H;

    const rot = o.rotation || 0;
    let lpx = px, lpy = py;
    if (rot !== 0) {
      const cx = (x1+x2)/2, cy = (y1+y2)/2;
      const rad = -rot * Math.PI / 180;
      const dx = px - cx, dy = py - cy;
      lpx = cx + dx*Math.cos(rad) - dy*Math.sin(rad);
      lpy = cy + dx*Math.sin(rad) + dy*Math.cos(rad);
    }

    if (o.type === 'rect') {
      const rx = Math.min(x1,x2)-THRESH, ry = Math.min(y1,y2)-THRESH;
      const rw = Math.abs(x2-x1)+THRESH*2, rh = Math.abs(y2-y1)+THRESH*2;
      if (lpx >= rx && lpx <= rx+rw && lpy >= ry && lpy <= ry+rh) return o;

    } else if (o.type === 'ellipse') {
      const cx = (x1+x2)/2, cy = (y1+y2)/2;
      const erx = Math.abs(x2-x1)/2+THRESH, ery = Math.abs(y2-y1)/2+THRESH;
      if (erx > 0 && ery > 0) {
        const dx = lpx-cx, dy = lpy-cy;
        if ((dx*dx)/(erx*erx)+(dy*dy)/(ery*ery) <= 1) return o;
      }

    } else if (o.type === 'line' || o.type === 'arrow') {
      const len2 = (x2-x1)**2 + (y2-y1)**2;
      if (len2 < 1) continue;
      const t  = Math.max(0, Math.min(1, ((lpx-x1)*(x2-x1)+(lpy-y1)*(y2-y1))/len2));
      const dx = lpx-(x1+t*(x2-x1)), dy = lpy-(y1+t*(y2-y1));
      if (Math.sqrt(dx*dx+dy*dy) < THRESH) return o;
    }
  }
  return null;
}

// ===== 色・サイズ設定 =====
function setColor(color, key, btn) {
  const ds = drawState[key];
  if (!ds) return;
  ds.color = color;
  document.querySelectorAll(`#toolbar-${key} .color-btn`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function setSizeMM(mm, key, btn) {
  setSizeMMByValue(mm, key);
  if (btn) {
    document.querySelectorAll(`#toolbar-${key} .size-btn`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
}

// ===== Undo =====
function undoDraw(key) {
  const ds = drawState[key];
  if (!ds) return;

  if (!ds.history) ds.history = [];
  if (ds.history.length === 0) {
    showToast('これ以上戻せません', '');
    return;
  }

  const last = ds.history.pop();
  if (last.type === 'object') {
    ds.objects = last.objects.map(o => ({...o}));
    ds.selectedId = null;
    renderSVGObjects(key);
  } else if (last.type === 'pen') {
    const canvas = document.getElementById(`drawcanvas-${key}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (last.penData) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = last.penData;
    }
    ds.savedPenData = last.penData;
    if (last.penStrokes) {
      ds.penStrokes = last.penStrokes.map(s=>({...s,points:[...s.points]}));
    }
    ds.selectedPenIds = [];
    renderSelectedPenStrokes(key);
  }
}

// ===== オブジェクト操作 =====

let globalClipboard = null;
let globalClipboardMulti = null;

function deleteSelected(key) {
  const ds = drawState[key];
  if (!ds) return;
  let deleted = 0;
  if ((ds.selectedIds?.length > 0) || ds.selectedId || ds.selectedPenIds?.length) {
    if (!ds.history) ds.history = [];
    ds.history.push({ type: 'object', objects: ds.objects.map(o => ({...o})) });
    if (ds.history.length > 50) ds.history.shift();
  }
  const ids = new Set([
    ...(ds.selectedIds || []),
    ...(ds.selectedId ? [ds.selectedId] : [])
  ]);
  if (ids.size > 0) {
    deleted += ids.size;
    ds.objects = ds.objects.filter(o => !ids.has(o.id));
    ds.selectedId = null;
    ds.selectedIds = [];
  }
  if (ds.selectedPenIds?.length) {
    deleted += ds.selectedPenIds.length;
    deletePenStrokes(key);
  }
  if (deleted === 0) { showToast('オブジェクトを選択してください','error'); return; }
  renderSVGObjects(key);
  showToast(`${deleted}個を削除しました`,'');
}

function copySelected(key) {
  const ds = drawState[key];
  if (!ds) return;
  const ids = new Set([
    ...(ds.selectedIds || []),
    ...(ds.selectedId ? [ds.selectedId] : [])
  ]);
  if (ids.size === 0) { showToast('オブジェクトを選択してください','error'); return; }
  const objs = ds.objects.filter(o => ids.has(o.id));
  if (objs.length === 1) {
    globalClipboard = { ...objs[0] };
    globalClipboardMulti = null;
  } else {
    globalClipboardMulti = objs.map(o => ({...o}));
    globalClipboard = null;
  }
  globalClipboardPen = null;
  showToast(`📋 ${objs.length}個をコピー`, 'success');
}

function pasteObj(key) {
  const src = globalClipboard || drawState[key]?.clipboard;
  if (!src) { showToast('コピーされた内容がありません','error'); return; }
  const ds = drawState[key];
  if (!ds) return;
  const offset = 0.03;
  const newObj = {
    ...src,
    id: Date.now(),
    x1: src.x1 + offset, y1: src.y1 + offset,
    x2: src.x2 + offset, y2: src.y2 + offset,
    rotation: src.rotation || 0
  };
  if (!ds.history) ds.history = [];
  ds.history.push({ type: 'object', objects: ds.objects.map(o => ({...o})) });
  if (ds.history.length > 50) ds.history.shift();
  ds.objects.push(newObj);
  ds.selectedId = newObj.id;
  renderSVGObjects(key);
}

function pasteObjAtPos(key, nx, ny) {
  const ds = drawState[key];
  if (!ds) return;
  if (!ds.history) ds.history = [];
  ds.history.push({ type: 'object', objects: ds.objects.map(o => ({...o})) });
  if (ds.history.length > 50) ds.history.shift();

  if (globalClipboardMulti?.length) {
    const xs = globalClipboardMulti.map(o => (o.x1+o.x2)/2);
    const ys = globalClipboardMulti.map(o => (o.y1+o.y2)/2);
    const cx = xs.reduce((a,b)=>a+b,0)/xs.length;
    const cy = ys.reduce((a,b)=>a+b,0)/ys.length;
    const newIds = [];
    globalClipboardMulti.forEach(src => {
      const dx = src.x1 - cx + nx - (src.x2-src.x1)/2;
      const dy = src.y1 - cy + ny - (src.y2-src.y1)/2;
      const newObj = { ...src, id: Date.now() + Math.random(), x1: src.x1+(nx-cx), y1: src.y1+(ny-cy), x2: src.x2+(nx-cx), y2: src.y2+(ny-cy) };
      ds.objects.push(newObj);
      newIds.push(newObj.id);
    });
    ds.selectedIds = newIds; ds.selectedId = null;
    renderSVGObjects(key);
    showToast(`📌 ${newIds.length}個を貼り付け`, 'success');
    return;
  }

  const src = globalClipboard || drawState[key]?.clipboard;
  if (!src) return;
  const hw = (src.x2 - src.x1) / 2;
  const hh = (src.y2 - src.y1) / 2;
  const newObj = {
    ...src,
    id: Date.now(),
    x1: nx - hw, y1: ny - hh,
    x2: nx + hw, y2: ny + hh,
    rotation: src.rotation || 0
  };
  if (!ds.history) ds.history = [];
  ds.history.push({ type: 'object', objects: ds.objects.map(o => ({...o})) });
  if (ds.history.length > 50) ds.history.shift();
  ds.objects.push(newObj);
  ds.selectedId = newObj.id;
  renderSVGObjects(key);
}

// ===== 回転 =====
function rotateSelected(key, deltaDeg) {
  const ds = drawState[key];
  if (!ds || !ds.selectedId) { showToast('オブジェクトを選択してください','error'); return; }
  const obj = ds.objects.find(o => o.id === ds.selectedId);
  if (!obj) return;
  obj.rotation = ((obj.rotation || 0) + deltaDeg + 360) % 360;
  const input = document.getElementById(`rot-input-${key}`);
  if (input) input.value = Math.round(obj.rotation);
  renderSVGObjects(key);
}

function rotateToAngle(key, angleDeg) {
  const ds = drawState[key];
  if (!ds || !ds.selectedId) { showToast('オブジェクトを選択してください','error'); return; }
  const obj = ds.objects.find(o => o.id === ds.selectedId);
  if (!obj) return;
  obj.rotation = ((parseFloat(angleDeg) || 0) + 360) % 360;
  renderSVGObjects(key);
}

// ===== 一時保存（localStorageへ即時保存）=====
function saveTempData() {
  try {
    const drawStateExport = _collectPenData();

    const tempData = {
      version:   '1.4.6',
      savedAt:   new Date().toISOString(),
      pdfName:   state.pdfName || '橋梁点検',
      photos:    state.photos  || {},
      drawings:  state.drawings || {},
      drawState: drawStateExport,
    };

    const trySet = (data) => {
      const json = JSON.stringify(data);
      if (json.length > 4.5 * 1024 * 1024) throw new Error('SIZE_OVER');
      localStorage.setItem('bridge_temp_save', json);
    };

    try {
      trySet(tempData);
    } catch(e) {
      const dataNoPhotos = { ...tempData, photos: {} };
      localStorage.setItem('bridge_temp_save', JSON.stringify(dataNoPhotos));
      const now = new Date();
      const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
      showToast(`⚠️ 一時保存しました（写真はZIP保存を使用してください）`, '');
      return;
    }

    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
    showToast(`✅ 一時保存しました（${timeStr}）`, 'success');
  } catch(err) {
    console.error(err);
    showToast('❌ 一時保存に失敗しました', 'error');
  }
}

// ===== 作業を保存（1タップJSON保存）=====
async function saveWorkData() {
  if (typeof JSZip === 'undefined') {
    showToast('❌ JSZipが読み込まれていません。ページを再読み込みしてください。', 'error');
    return;
  }
  showToast('💾 保存中...', '');
  try {
    const drawStateExport = _collectPenData();

    showToast('🖼️ 写真を圧縮中...', '');
    const compressedPhotos = {};
    for (const [key, raw] of Object.entries(state.photos || {})) {
      let list = [];
      if (Array.isArray(raw))             list = raw.map(p => typeof p === 'string' ? { dataURL: p } : p).filter(p => p?.dataURL);
      else if (typeof raw === 'string' && raw) list = [{ dataURL: raw }];
      else if (raw?.dataURL)              list = [raw];
      if (!list.length) continue;
      const compressed = await Promise.all(list.map(p =>
        compressImage(p.dataURL, 0.75, 1280).then(d => ({ ...p, dataURL: d }))
      ));
      compressedPhotos[key] = compressed;
    }

    const saveData = {
      version:   '1.4.6',
      savedAt:   new Date().toISOString(),
      pdfName:   state.pdfName || '橋梁点検',
      photos:    compressedPhotos,
      extraPhotos: state.extraPhotos || [],
      drawings:  state.drawings || {},
      drawState: drawStateExport,
    };

    const zip = new JSZip();

    zip.file('work_data.json', JSON.stringify(saveData));

    if (state.pdfData) {
      try {
        showToast('📄 PDF同梱中...', '');
        zip.file(
          `${state.pdfName || '前回調書'}.pdf`,
          state.pdfData
        );
      } catch(e) {
        console.warn('PDF同梱スキップ:', e);
      }
    }

    const now     = new Date();
    const dateStr = `${now.getMonth()+1}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const fileName = `${state.pdfName || '点検データ'}_作業保存_${dateStr}.zip`;

    showToast('📦 ZIP生成中...', '');
    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);

    const photoCount = Object.values(compressedPhotos).reduce((n, v) => n + (Array.isArray(v) ? v.length : 1), 0);
    const hasPDF     = !!state.pdfData;
    showToast(`✅ 保存しました（写真${photoCount}枚${hasPDF ? '・PDF含む' : ''}）`, 'success');

  } catch(err) {
    console.error(err);
    showToast(`❌ 保存に失敗しました: ${err.message}`, 'error');
  }
}

function compressImage(dataURL, quality, maxWidth) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv  = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

function importData(input) {
  const file = input.files[0];

  const tempRaw = localStorage.getItem('bridge_temp_save');
  if (!file && tempRaw) {
    try {
      const tempData = JSON.parse(tempRaw);
      const savedAt  = tempData.savedAt ? new Date(tempData.savedAt) : null;
      const timeStr  = savedAt
        ? `${savedAt.getMonth()+1}/${savedAt.getDate()} ${savedAt.getHours()}:${String(savedAt.getMinutes()).padStart(2,'0')}`
        : '不明';
      const ok = confirm(
        `📋 前回の一時保存データがあります\n\n` +
        `・橋梁名：${tempData.pdfName || '不明'}\n` +
        `・保存日時：${timeStr}\n\n` +
        `この一時保存データを読み込みますか？`
      );
      if (ok) {
        applyImportData(tempData, null, null);
        input.value = '';
        return;
      }
    } catch(e) {
    }
  }

  if (!file) return;

  const isZip  = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  const isJson = file.name.endsWith('.json') || file.type === 'application/json';

  if (isZip) {
    JSZip.loadAsync(file).then(async (zip) => {
      const fileList = Object.keys(zip.files);

      let jsonFile = zip.file('work_data.json');
      if (!jsonFile) jsonFile = zip.file('作業データ.json');
      if (!jsonFile) {
        const jsonFiles = zip.file(/\.json$/i);
        if (jsonFiles.length > 0) jsonFile = jsonFiles[0];
      }

      if (!jsonFile) {
        showToast('❌ このZIPは画像のみのファイルです。作業の復元には「作業保存」で出力したZIPをお使いください。', 'error');
        return;
      }

      const jsonStr = await jsonFile.async('string');
      const data    = JSON.parse(jsonStr);

      let pdfArrayBuffer = null;
      const pdfFiles = zip.file(/\.pdf$/i);
      if (pdfFiles.length > 0) {
        pdfArrayBuffer = await pdfFiles[0].async('arraybuffer');
      }

      await applyImportData(data, null, pdfArrayBuffer);
    }).catch(err => {
      console.error(err);
      showToast(`❌ ZIP読み込み失敗: ${err.message}`, 'error');
    });
  } else if (isJson) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        await applyImportData(data, data.pdfBase64 || null);
      } catch(err) {
        showToast('❌ ファイルの読み込みに失敗しました', 'error');
      }
    };
    reader.readAsText(file);
  } else {
    JSZip.loadAsync(file).then(async (zip) => {
      const fileList  = Object.keys(zip.files);
      let jsonFile    = zip.file('work_data.json');
      if (!jsonFile) jsonFile = zip.file('作業データ.json');
      if (!jsonFile) {
        const jsonFiles = zip.file(/\.json$/i);
        if (jsonFiles.length > 0) jsonFile = jsonFiles[0];
      }
      if (!jsonFile) {
        showToast('❌ このZIPは画像のみのファイルです。作業の復元には「作業保存」で出力したZIPをお使いください。', 'error');
        return;
      }
      const jsonStr = await jsonFile.async('string');
      const data    = JSON.parse(jsonStr);
      let pdfArrayBuffer = null;
      const pdfFiles = zip.file(/\.pdf$/i);
      if (pdfFiles.length > 0) pdfArrayBuffer = await pdfFiles[0].async('arraybuffer');
      await applyImportData(data, null, pdfArrayBuffer);
    }).catch(() => {
      showToast('❌ ZIPまたはJSONファイルを選択してください', 'error');
    });
  }
  input.value = '';
}

async function applyImportData(data, pdfBase64 = null, pdfArrayBuffer = null) {
  if (!data.version || !data.photos) {
    showToast('❌ 対応していないファイル形式です', 'error');
    return;
  }

  const photoCount   = Object.keys(data.photos   || {}).length;
  const drawingCount = Object.keys(data.drawState || data.drawings || {}).length;
  const hasPDF = !!(pdfArrayBuffer || pdfBase64);

  const ok = confirm(
    `📥 データを取り込みます\n\n` +
    `・橋梁名：${data.pdfName || '不明'}\n` +
    `・撮影写真：${photoCount}枚\n` +
    `・書き込みデータ：${drawingCount}ページ\n` +
    `・PDF：${hasPDF ? '含む（自動復元）' : 'なし'}\n\n` +
    `よろしいですか？`
  );
  if (!ok) return;

  Object.assign(state.photos,   data.photos   || {});
  Object.assign(state.drawings, data.drawings  || {});

  if (data.drawState) {
    for (const [key, ds] of Object.entries(data.drawState)) {
      if (!drawState[key]) {
        drawState[key] = {
          tool:'scroll', color:'#ef4444', sizeMM:0.25, pattern:'none',
          penHistory:[], penStrokes:[], objects:[], selectedId:null, clipboard:null,
          drawing:false, startX:0, startY:0, savedPenData:null, history:[]
        };
      }
      if (ds.objects?.length > 0) {
        const newObjs = ds.objects.map((o, i) => ({...o, id: Date.now() + i * 1000 + i + 1}));
        drawState[key].objects.push(...newObjs);
      }
      if (ds.penStrokes?.length > 0) {
        if (!drawState[key].penStrokes) drawState[key].penStrokes = [];
        const newStrokes = ds.penStrokes.map((s, i) => ({...s, id: Date.now() + i * 1000 + i + 1, points:[...s.points]}));
        drawState[key].penStrokes.push(...newStrokes);
      }
      if (ds.savedPenData && !drawState[key].savedPenData) {
        drawState[key].savedPenData = ds.savedPenData;
      }
      const existingCanvas = document.getElementById(`drawcanvas-${key}`);
      if (existingCanvas && existingCanvas.width > 0) {
        const penData = drawState[key].savedPenData;
        if (penData) {
          const ctx = existingCanvas.getContext('2d');
          const img2 = new Image();
          img2.onload = () => {
            ctx.drawImage(img2, 0, 0, existingCanvas.width, existingCanvas.height);
            renderSVGObjects(key);
          };
          img2.src = penData;
        } else {
          renderSVGObjects(key);
        }
      }
    }
  }

  if (pdfArrayBuffer || pdfBase64) {
    try {
      showToast('📄 PDFを復元中...', '');
      let arrayBuffer = pdfArrayBuffer;
      if (!arrayBuffer && pdfBase64) {
        const binary = atob(pdfBase64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        arrayBuffer = bytes.buffer;
      }
      state.pdfData    = arrayBuffer;
      const _pdfjs     = typeof globalThis.pdfjsLib !== 'undefined' ? globalThis.pdfjsLib : pdfjsLib;
      const pdf        = await _pdfjs.getDocument({ data: arrayBuffer }).promise;
      state.pdfDoc     = pdf;
      state.pdfName    = data.pdfName || '引き継ぎデータ';
      state.totalPages = pdf.numPages;
      state.pageCache  = {};
      Object.keys(prevPhotoCache).forEach(k => delete prevPhotoCache[k]);
      await detectPageStructure(pdf);
      document.getElementById('pdf-name').textContent  = state.pdfName + '.pdf';
      document.getElementById('pdf-pages').textContent = `${pdf.numPages} ページ`;
      document.getElementById('upload-zone').classList.add('hidden');
      document.getElementById('pdf-loaded-info').classList.remove('hidden');
      document.getElementById('btn-survey').disabled  = false;
      document.getElementById('btn-inspect').disabled = false;
    } catch(e) {
      console.error('PDF復元エラー:', e);
      showToast('⚠️ PDF復元失敗。手動でPDFを読み込んでください', 'error');
    }
  }

  showToast(`✅ 写真${photoCount}枚・書き込み${drawingCount}ページを取り込みました`, 'success');

  for (const key of Object.keys(drawState)) {
    const svg = document.getElementById(`drawsvg-${key}`);
    if (svg) renderSVGObjects(key);
  }

  if (currentScreen === 'home' && hasPDF) {
    setTimeout(() => {
      alert('✅ 取り込み完了！\n\nPDFも自動で読み込みました。\n「踏査」または「本調査」をタップして\n作業を再開してください！');
    }, 800);
  } else if (currentScreen === 'home' && !hasPDF) {
    setTimeout(() => {
      alert('✅ 取り込み完了！\n\n次に前回調書のPDFを読み込んでください。');
    }, 500);
  }
}

// ===== デジカメ Wi-Fi 写真取り込み =====
let _sdSelectedPhotoURL = null;
let _sdCurrentTab = 'tg7';        // 'tg7' | 'flashair'
let _sdFromPopup  = false;        // ポップアップから呼ばれたか

// ===== TG-7モード =====
let _tg7ModeOn       = false;     // TG-7モードのオン/オフ
let _tg7PollingTimer = null;      // ポーリングタイマー
let _tg7KnownFiles   = new Set(); // 既知のファイル名セット
let _tg7WaitingSlot  = null;      // 待機中のスロットキー
let _tg7BaseURL      = 'http://192.168.0.10';

function toggleTG7Mode() {
  _tg7ModeOn = !_tg7ModeOn;
  const btn = document.getElementById('tg7-mode-btn');
  if (_tg7ModeOn) {
    _tg7BaseURL = (document.getElementById('sd-url-input')?.value || 'http://192.168.0.10').trim().replace(/\/$/, '');
    btn.textContent = '📷 TG-7 ON';
    btn.style.background = 'var(--accent)';
    btn.style.border = 'none';
    showToast('TG-7モード ON：撮影ボタンを押してデジカメで撮影してください', 'success');
    _tg7StartPolling();
  } else {
    _tg7StopPolling();
    btn.textContent = '📷 TG-7 OFF';
    btn.style.background = 'rgba(255,255,255,0.15)';
    btn.style.border = '1px solid rgba(255,255,255,0.4)';
    _tg7WaitingSlot = null;
    showToast('TG-7モード OFF', 'info');
  }
}

async function _tg7StartPolling() {
  try {
    const photos = await _fetchTG7Photos(_tg7BaseURL, { textContent: '' });
    if (photos) photos.forEach(p => _tg7KnownFiles.add(p.name));
  } catch(e) {}

  _tg7PollingTimer = setInterval(_tg7Poll, 4000); // 4秒ごと
}

function _tg7StopPolling() {
  if (_tg7PollingTimer) {
    clearInterval(_tg7PollingTimer);
    _tg7PollingTimer = null;
  }
}

async function _tg7Poll() {
  if (!_tg7ModeOn || !_tg7WaitingSlot) return;
  try {
    const photos = await _fetchTG7Photos(_tg7BaseURL, { textContent: '' });
    if (!photos) return;
    const newPhotos = photos.filter(p => !_tg7KnownFiles.has(p.name));
    if (newPhotos.length === 0) return;

    const latest = newPhotos[newPhotos.length - 1];
    _tg7KnownFiles.add(latest.name);
    await _importSDPhotoToSlot(latest.url, latest.name, _tg7WaitingSlot);
    _tg7WaitingSlot = null; // 待機解除
  } catch(e) {}
}

function popupCapturePhotoTG7(addMode) {
  if (!_popupSlotKey) return;
  _tg7WaitingSlot = _popupSlotKey;

  const noneEl = document.getElementById('popup-current-none');
  if (noneEl) {
    noneEl.innerHTML = `
      <div style="text-align:center;color:var(--accent);padding:20px;">
        <div style="font-size:36px;margin-bottom:8px;">📷</div>
        <div style="font-size:13px;font-weight:700;margin-bottom:4px;">TG-7で撮影してください</div>
        <div style="font-size:11px;color:var(--text2);">撮影後、自動で取り込みます...</div>
        <div style="margin-top:12px;width:24px;height:24px;border:3px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:12px auto 0;"></div>
      </div>
      <button onclick="_tg7CancelWait()" style="margin-top:8px;background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:6px 14px;font-size:11px;cursor:pointer;">キャンセル</button>
    `;
  }
  showToast('📷 TG-7で撮影してください', 'info');
}

function _tg7CancelWait() {
  _tg7WaitingSlot = null;
  const slots = DAMAGE_PHOTO_SLOTS.filter(s => !s.isNON);
  const slot  = slots.find(s => s.key === _popupSlotKey);
  if (slot) updatePopup(slot);
}

async function _importSDPhotoToSlot(url, name, slotKey) {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    const blob = await resp.blob();
    const reader = new FileReader();
    reader.onload = (e) => {
      compressImage(e.target.result, 0.75, 1280).then(compressed => {
        if (!state.photos) state.photos = {};
        const newEntry = { dataURL: compressed, label: '' };
        const existing = state.photos[slotKey];
        if (Array.isArray(existing)) {
          existing.push(newEntry);
          _popupPhotoIdx = existing.length - 1;
        } else if (existing) {
          const prev = typeof existing === 'string' ? { dataURL: existing } : existing;
          state.photos[slotKey] = [prev, newEntry];
          _popupPhotoIdx = 1;
        } else {
          state.photos[slotKey] = [newEntry];
          _popupPhotoIdx = 0;
        }
        const slots = DAMAGE_PHOTO_SLOTS.filter(s => !s.isNON);
        const slot  = slots.find(s => s.key === slotKey);
        if (slot) updatePopup(slot);
        _refreshPhotoGrid(slotKey);
        showToast(`✅ ${name} を取り込みました`, 'success');
      });
    };
    reader.readAsDataURL(blob);
  } catch(err) {
    showToast('❌ 取り込み失敗。TG-7との接続を確認してください', 'error');
  }
}

function openSDModalForPopup() {
  _sdFromPopup = true;
  showSDCardModal();
}

function showSDCardModal() {
  document.getElementById('sd-modal').style.display = 'block';
  document.getElementById('sd-status').textContent = '';
  document.getElementById('sd-photo-list').innerHTML = '';
  document.getElementById('sd-assign-panel').style.display = 'none';
  _sdSelectedPhotoURL = null;

  const select = document.getElementById('sd-slot-select');
  select.innerHTML = '';
  const allSlots = [...SURVEY_PHOTO_SLOTS, ...DAMAGE_PHOTO_SLOTS];
  allSlots.forEach(slot => {
    const opt = document.createElement('option');
    opt.value = slot.key;
    opt.textContent = `No.${slot.prevNo}${slot.isNON ? ' (NON)' : ''}`;
    if (_sdFromPopup && _popupSlotKey && slot.key === _popupSlotKey) opt.selected = true;
    select.appendChild(opt);
  });

  switchSDTab(_sdCurrentTab);
}

function switchSDTab(tab) {
  _sdCurrentTab = tab;
  const isTG7 = tab === 'tg7';

  const tg7Btn = document.getElementById('sd-tab-tg7');
  const faBtn  = document.getElementById('sd-tab-flashair');
  if (tg7Btn) {
    tg7Btn.style.background = isTG7 ? 'var(--accent)' : 'var(--surface2)';
    tg7Btn.style.color      = isTG7 ? '#fff' : 'var(--text2)';
    tg7Btn.style.border     = isTG7 ? 'none' : '1px solid var(--border)';
  }
  if (faBtn) {
    faBtn.style.background = !isTG7 ? 'var(--accent)' : 'var(--surface2)';
    faBtn.style.color      = !isTG7 ? '#fff' : 'var(--text2)';
    faBtn.style.border     = !isTG7 ? 'none' : '1px solid var(--border)';
  }

  const hintTG7 = document.getElementById('sd-hint-tg7');
  const hintFA  = document.getElementById('sd-hint-flashair');
  if (hintTG7) hintTG7.style.display = isTG7 ? 'block' : 'none';
  if (hintFA)  hintFA.style.display  = isTG7 ? 'none'  : 'block';

  const urlInput = document.getElementById('sd-url-input');
  if (urlInput) {
    urlInput.value = isTG7 ? 'http://192.168.0.10/' : 'http://flashair/';
    urlInput.placeholder = isTG7
      ? '例: http://192.168.0.10/'
      : '例: http://flashair/ または http://192.168.0.1/';
  }

  document.getElementById('sd-status').textContent = '';
  document.getElementById('sd-photo-list').innerHTML = '';
  document.getElementById('sd-assign-panel').style.display = 'none';
  _sdSelectedPhotoURL = null;
}

function closeSDModal() {
  document.getElementById('sd-modal').style.display = 'none';
  _sdSelectedPhotoURL = null;
  _sdFromPopup = false;
}

async function connectSDCard() {
  const baseURL = document.getElementById('sd-url-input').value.trim().replace(/\/$/, '');
  const status  = document.getElementById('sd-status');
  const list    = document.getElementById('sd-photo-list');

  status.textContent = '🔄 接続中...';
  status.style.color = 'var(--text2)';
  list.innerHTML = '';
  _sdSelectedPhotoURL = null;
  document.getElementById('sd-assign-panel').style.display = 'none';

  try {
    const photos = _sdCurrentTab === 'tg7'
      ? await _fetchTG7Photos(baseURL, status)
      : await _fetchFlashAirPhotos(baseURL, status);

    if (!photos || photos.length === 0) return;

    status.textContent = `✅ ${photos.length}枚の写真が見つかりました。タップして選択してください`;
    status.style.color = 'var(--green)';

    photos.reverse().forEach(photo => {
      const div = document.createElement('div');
      div.style.cssText = 'cursor:pointer;border:2px solid var(--border);border-radius:8px;overflow:hidden;aspect-ratio:4/3;background:var(--surface2);display:flex;align-items:center;justify-content:center;position:relative;';
      div.innerHTML = `<div style="font-size:10px;color:var(--text2);text-align:center;padding:4px;word-break:break-all;">${photo.name}</div>`;
      div.onclick = () => selectSDPhoto(photo.url, photo.name, div);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        div.innerHTML = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        div.appendChild(img);
      };
      img.src = photo.url;
      list.appendChild(div);
    });

  } catch(err) {
    console.error(err);
    status.textContent = '❌ 接続失敗。iPadのWi-Fiがカメラに接続されているか確認してください';
    status.style.color = 'var(--red)';
  }
}

async function _fetchTG7Photos(baseURL, status) {
  const photos = [];

  const dcimResp = await fetch(`${baseURL}/DCIM/`, { mode: 'cors' });
  if (!dcimResp.ok) throw new Error('DCIM取得失敗');
  const dcimHTML = await dcimResp.text();

  const folderMatches = [...dcimHTML.matchAll(/href="([^"]+\/)"(?!\.\.)/gi)];
  const folders = folderMatches
    .map(m => m[1].replace(/^.*\//, ''))  // パス部分を除去
    .filter(f => f && f !== '../' && f !== './')
    .map(f => f.replace(/\/$/, ''));

  if (folders.length === 0) {
    folders.push('');
  }

  for (const folder of folders.slice(0, 10)) {
    const dirPath = folder ? `/DCIM/${folder}/` : '/DCIM/';
    try {
      const resp = await fetch(`${baseURL}${dirPath}`, { mode: 'cors' });
      if (!resp.ok) continue;
      const html = await resp.text();
      const fileMatches = [...html.matchAll(/href="([^"]+\.(?:jpg|jpeg|JPG|JPEG))"/gi)];
      fileMatches.forEach(m => {
        const name = m[1].split('/').pop();
        photos.push({ name, url: `${baseURL}${dirPath}${name}` });
      });
    } catch(e) { /* フォルダエラーはスキップ */ }
  }

  if (photos.length === 0) {
    status.textContent = '⚠️ 写真が見つかりません。カメラのWi-Fiとの接続を確認してください';
    status.style.color = 'var(--yellow)';
    return null;
  }
  return photos;
}

async function _fetchFlashAirPhotos(baseURL, status) {
  const photos = [];

  const dirURL = `${baseURL}/command.cgi?op=100&DIR=/DCIM`;
  const resp   = await fetch(dirURL, { mode: 'cors' });
  const text   = await resp.text();

  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const dir  = parts[0];
      const name = parts[1];
      if (/\.(jpg|jpeg|png)$/i.test(name)) {
        photos.push({ dir, name, url: `${baseURL}${dir}/${name}` });
      }
    }
  }

  if (photos.length === 0) {
    const subText = text;
    const dirs = subText.split('\n')
      .filter(l => l.includes('/DCIM'))
      .map(l => l.split(',')[0]);

    for (const d of dirs.slice(0, 5)) {
      try {
        const pResp = await fetch(`${baseURL}/command.cgi?op=100&DIR=${d}`, { mode: 'cors' });
        const pText = await pResp.text();
        pText.split('\n').filter(l => /\.(jpg|jpeg|png)$/i.test(l)).forEach(l => {
          const p = l.split(',');
          if (p[1]) photos.push({ dir: d, name: p[1], url: `${baseURL}${d}/${p[1]}` });
        });
      } catch(e) {}
    }
  }

  if (photos.length === 0) {
    status.textContent = '⚠️ 写真が見つかりませんでした';
    status.style.color = 'var(--yellow)';
    return null;
  }
  return photos;
}

function selectSDPhoto(url, name, el) {
  document.querySelectorAll('#sd-photo-list > div').forEach(d => {
    d.style.borderColor = 'var(--border)';
  });
  el.style.borderColor = 'var(--accent)';
  _sdSelectedPhotoURL = url;

  if (_sdFromPopup) {
    _importSDPhotoToSlot(url, name, _popupSlotKey);
  } else {
    document.getElementById('sd-assign-panel').style.display = 'block';
    document.getElementById('sd-status').textContent = `✅ 「${name}」を選択中`;
  }
}

async function assignSDPhoto() {
  const slotKey = document.getElementById('sd-slot-select').value;
  if (!slotKey) return;

  try {
    const resp = await fetch(_sdSelectedPhotoURL, { mode: 'cors' });
    const blob = await resp.blob();
    const reader = new FileReader();
    reader.onload = (e) => {
      compressImage(e.target.result, 0.75, 1280).then(compressed => {
        if (!state.photos) state.photos = {};
        state.photos[slotKey] = compressed;
        showToast('✅ 写真を割り当てました！', 'success');
        document.getElementById('sd-assign-panel').style.display = 'none';
        _sdSelectedPhotoURL = null;
        _refreshPhotoGrid(slotKey);
      });
    };
    reader.readAsDataURL(blob);
  } catch(err) {
    showToast('❌ 写真の取り込みに失敗しました', 'error');
  }
}

// ===== 保存 =====
