async function saveDraw(key, pageNum) {
  const canvas = document.getElementById(`drawcanvas-${key}`);
  if (!canvas) return;
  const ds = drawState[key];

  ds.savedPenData = canvas.toDataURL('image/png');

  const svgEl  = document.getElementById(`drawsvg-${key}`);
  const baseEl = canvas.parentElement?.querySelector('.draw-base');
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  const dpr = window.devicePixelRatio || 1;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width  = W * dpr;
  exportCanvas.height = H * dpr;
  const ctx = exportCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  try {
    if (baseEl && baseEl.src) {
      const baseImg = await loadImage(baseEl.src);
      ctx.drawImage(baseImg, 0, 0, W, H);
    }

    ctx.drawImage(canvas, 0, 0, W, H);

    if (svgEl) {
      const svgClone = svgEl.cloneNode(true);
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgClone.setAttribute('width',  W);
      svgClone.setAttribute('height', H);
      svgClone.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svgClone.style.pointerEvents = 'none';

      const svgStr  = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const svgURL  = URL.createObjectURL(svgBlob);

      await new Promise((resolve) => {
        const svgImg = new Image();
        svgImg.onload = () => {
          ctx.drawImage(svgImg, 0, 0, W, H);
          URL.revokeObjectURL(svgURL);
          resolve();
        };
        svgImg.onerror = () => {
          URL.revokeObjectURL(svgURL);
          resolve(); // エラーでも続行
        };
        svgImg.src = svgURL;
      });
    }

    state.drawings[key] = exportCanvas.toDataURL('image/png');
    showToast('💾 書き込みを保存しました', 'success');

  } catch(err) {
    console.error('saveDraw error:', err);
    state.drawings[key] = exportCanvas.toDataURL('image/png');
    showToast('💾 保存しました（一部省略）', 'success');
  }
}

// ===== 写真ビューア =====
function renderPhotoViewer(item, tabs, content) {
  const isSurvey3  = item.key === 's3';
  const isDamage10 = item.key === 's10';
  const slots = isSurvey3 ? SURVEY_PHOTO_SLOTS : DAMAGE_PHOTO_SLOTS;

  const section = document.createElement('div');
  section.className = 'viewer-section active photo-section';

  const prevId = `prev-body-${item.key}`;
  let prevPagesHTML = item.pages.map(p => `
    <div class="page-card">
      <div class="page-card-header"><span>ページ ${p}</span></div>
      <div class="page-loading" id="pv-loading-${p}"><div class="loading-spinner"></div>読み込み中...</div>
      <div id="pv-img-${p}"></div>
    </div>
  `).join('');

  const missingRequired = slots.filter(s => s.required && !state.photos[s.key]);
  const missingAlert = `
    <div class="missing-alert ${missingRequired.length > 0 ? 'show' : ''}" id="missing-${item.key}">
      <span class="alert-icon">⚠️</span>
      <p>必須写真が <strong>${missingRequired.length}枚</strong> 未撮影です。<br>
      ${missingRequired.slice(0,3).map(s=>s.label).join('、')}${missingRequired.length > 3 ? '…' : ''}</p>
    </div>`;

  let filterHTML = '';

  const spans = [...new Set(slots.map(s => s.span || 1))].sort((a,b) => a-b);
  const spanTabsHTML = spans.length > 1 ? `
    <div class="photo-filter-tabs" style="margin-bottom:4px;">
      ${spans.map((sp, i) => `
        <div class="photo-filter-tab ${i===0?'active':''}"
             onclick="filterBySpan(${sp},'${item.key}',event)">
          ${sp}径間
        </div>`).join('')}
    </div>` : '';

  if (isSurvey3) {
    filterHTML = spanTabsHTML;
  } else if (isDamage10) {
    filterHTML = `
      ${spanTabsHTML}
      <div class="photo-filter-tabs">
        <div class="photo-filter-tab active" onclick="filterPhotos('damage','${item.key}',event)">損傷</div>
        <div class="photo-filter-tab" onclick="filterPhotos('non','${item.key}',event)">NON</div>
      </div>`;
  }

  const captured = slots.filter(s => state.photos[s.key]).length;
  const headerHTML = `
    <div class="photo-section-header">
      <h3>📸 写真記録 <span style="font-size:12px;color:var(--text2);font-weight:400">${captured}/${slots.length}枚</span></h3>
      <button onclick="startExtraPhoto('${item.key}')" style="background:var(--accent,#3b82f6);border:none;color:#fff;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">📷 写真追加</button>
    </div>
    <p style="font-size:11px;color:var(--accent);margin-bottom:10px;font-weight:700;">
      📷 枠をタップするとカメラが起動します
    </p>`;

  section.innerHTML = `
    <div class="prev-record-section">
      <div class="prev-record-header" onclick="togglePrevRecord('${prevId}')">
        <span>📄 前回点検調書を見る</span>
        <span id="prev-arrow-${item.key}">▼</span>
      </div>
      <div class="prev-record-body page-viewer" id="${prevId}">
        ${prevPagesHTML}
      </div>
    </div>
    ${missingAlert}
    ${filterHTML}
    ${headerHTML}
    <div class="photo-grid" id="photo-grid-${item.key}">
      ${slots.map(slot => renderPhotoSlot(slot, item.key)).join('')}
    </div>
    <div style="margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <span>📎 追加写真</span>
        <button onclick="startExtraPhoto('${item.key}')" style="background:var(--accent,#3b82f6);border:none;color:#fff;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;">📷 追加</button>
      </div>
      <div id="extra-photo-grid-${item.key}" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="color:var(--text2);font-size:12px;padding:8px 0;">追加写真はありません</div>
      </div>
    </div>
  `;
  content.appendChild(section);

  item.pages.forEach(async p => {
    const img = await getPageImage(p);
    if (img) {
      const ld = document.getElementById(`pv-loading-${p}`);
      const ct = document.getElementById(`pv-img-${p}`);
      if (ld) ld.style.display = 'none';
      if (ct) {
        const image = new Image();
        image.src = img; image.style.width = '100%'; image.style.display = 'block';
        ct.appendChild(image);
      }
    }
  });

  loadPrevPhotosForSlots(slots);
  setTimeout(() => attachAllGridSwipes(item.key), 100);

  const allSpans = [...new Set(slots.map(s => s.span || 1))].sort((a,b) => a-b);
  if (allSpans.length > 1) {
    photoFilter.span = allSpans[0];
    photoFilter.type = isDamage10 ? 'damage' : 'all';
    setTimeout(() => applyPhotoFilter(item.key), 100);
  } else {
    photoFilter.span = 0;
    photoFilter.type = isDamage10 ? 'damage' : 'all';
    if (isDamage10) setTimeout(() => applyPhotoFilter(item.key), 100);
  }
}

function togglePrevRecord(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.toggle('open');
  const key = id.replace('prev-body-','');
  const arrow = document.getElementById(`prev-arrow-${key}`);
  if (arrow) arrow.textContent = body.classList.contains('open') ? '▲' : '▼';
}

const prevPhotoCache = {};

async function getPrevPhotoForSlot(slot) {
  if (prevPhotoCache[slot.key]) return prevPhotoCache[slot.key];
  if (!slot.prevPage || !slot.crop || !state.pdfDoc) return null;

  const pageImg = await getPageImage(slot.prevPage, 2.0);
  if (!pageImg) return null;

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const c = slot.crop;

      const sx = c.x * W;
      const sy = c.y * H;
      const sw = c.w * W;
      const sh = c.h * H;

      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(sw);
      canvas.height = Math.round(sh);
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const dataURL = canvas.toDataURL('image/jpeg', 0.85);
      prevPhotoCache[slot.key] = dataURL;
      const cacheKeys = Object.keys(prevPhotoCache);
      if (cacheKeys.length > 20) delete prevPhotoCache[cacheKeys[0]];
      resolve(dataURL);
    };
    img.onerror = () => resolve(null);
    img.src = pageImg;
  });
}

const _slotPhotoIndex = {};

function setSlotPhotoIndex(slotKey, idx) {
  const wrap = document.getElementById('curr-photo-wrap-' + slotKey);
  if (!wrap) return;
  const list = normalizePhotoList(state.photos[slotKey]);
  if (!list.length) return;

  const prevIdx = _slotPhotoIndex[slotKey] || 0;
  const safeIdx = Math.max(0, Math.min(list.length - 1, idx));
  _slotPhotoIndex[slotKey] = safeIdx;

  const stage   = wrap.querySelector('.curr-img-stage');
  const img     = stage ? stage.querySelector('.curr-photo-img') : wrap.querySelector('.curr-photo-img');
  const dots    = wrap.querySelector('.curr-photo-dots');
  const delBtn  = wrap.querySelector('.curr-photo-delete');
  const prevBtn = wrap.querySelector('.curr-nav-prev');
  const nextBtn = wrap.querySelector('.curr-nav-next');

  if (img && stage) {
    const dir = safeIdx >= prevIdx ? 1 : -1;
    img.style.transition = 'none';
    img.style.transform  = 'translateX(' + (dir * 100) + '%)';
    img.src = list[safeIdx].dataURL;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        img.style.transition = 'transform 0.25s ease';
        img.style.transform  = 'translateX(0)';
      });
    });
    img.setAttribute('onclick', 'openPhotoLightbox(\'' + slotKey + '\',' + safeIdx + ')');
  } else if (img) {
    img.src = list[safeIdx].dataURL;
    img.setAttribute('onclick', 'openPhotoLightbox(\'' + slotKey + '\',' + safeIdx + ')');
  }

  if (delBtn) delBtn.setAttribute('onclick', 'event.stopPropagation();deleteOnePhoto(\'' + slotKey + '\',' + safeIdx + ',event)');
  if (prevBtn) prevBtn.style.display = safeIdx > 0 ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = safeIdx < list.length - 1 ? 'flex' : 'none';
  if (dots) {
    dots.innerHTML = list.map((_, i) =>
      '<span class="curr-dot' + (i === safeIdx ? ' active' : '') + '"></span>').join('');
  }
}

function normalizePhotoList(raw) {
  if (Array.isArray(raw))          return raw.map(p => typeof p === 'string' ? { dataURL: p } : p).filter(p => p?.dataURL);
  if (typeof raw === 'string' && raw) return [{ dataURL: raw }];
  if (raw?.dataURL)                return [raw];
  return [];
}

function renderPhotoSlot(slot, sectionKey) {
  const photoRaw  = state.photos[slot.key];
  const photoList = normalizePhotoList(photoRaw);
  const hasPhoto  = photoList.length > 0;
  const curIdx    = hasPhoto ? Math.min(_slotPhotoIndex[slot.key] || 0, photoList.length - 1) : 0;

  const reqBadge   = slot.required ? '<span class="photo-card-badge-req">必須</span>' : '';
  const nonBadge   = slot.isNON   ? '<span class="photo-card-badge-non">NON</span>'  : '';
  const countBadge = hasPhoto && photoList.length > 1
    ? `<span class="photo-card-badge-count">${photoList.length}枚</span>` : '';
  const statusHTML = hasPhoto
    ? `<span class="photo-card-status done">✓ 撮影済</span>`
    : `<span class="photo-card-status">未撮影</span>`;

  let currHTML;
  if (hasPhoto) {
    const dotsHTML = photoList.length > 1
      ? `<div class="curr-photo-dots">${photoList.map((_, i) => `<span class="curr-dot${i === curIdx ? ' active' : ''}"></span>`).join('')}</div>`
      : '';
    const prevNav = `<button class="curr-nav curr-nav-prev" style="${curIdx > 0 ? '' : 'display:none'}" onclick="event.stopPropagation();setSlotPhotoIndex('${slot.key}',${curIdx - 1})">‹</button>`;
    const nextNav = `<button class="curr-nav curr-nav-next" style="${curIdx < photoList.length - 1 ? '' : 'display:none'}" onclick="event.stopPropagation();setSlotPhotoIndex('${slot.key}',${curIdx + 1})">›</button>`;

    currHTML = `
      <div class="curr-photo-wrap" id="curr-photo-wrap-${slot.key}">
        <div class="curr-img-stage">
          <img class="curr-photo-img" src="${photoList[curIdx].dataURL}" onclick="openPhotoLightbox('${slot.key}',${curIdx})">
        </div>
        <span class="curr-photo-delete photo-half-delete" onclick="event.stopPropagation();deleteOnePhoto('${slot.key}',${curIdx},event)">✕</span>
        <span class="photo-half-check">✓</span>
        ${prevNav}${nextNav}
        ${dotsHTML}
        <div class="curr-photo-actions">
          <button class="photo-btn-add"    onclick="event.stopPropagation();capturePhoto('${slot.key}','${sectionKey}',true)">📷 追加</button>
          <button class="photo-btn-retake" onclick="event.stopPropagation();capturePhoto('${slot.key}','${sectionKey}',false)">🔄 撮り直し</button>
        </div>
      </div>`;
  } else {
    currHTML = `
      <div class="photo-half-shoot" onclick="capturePhoto('${slot.key}','${sectionKey}')">
        <div class="cam-icon">📷</div>
        <div class="cam-hint">タップして撮影</div>
      </div>`;
  }

  const prevLabel = slot.prevNo != null ? `前回 No.${slot.prevNo}` : '前回';
  const prevHTML  = slot.prevPage
    ? `<div class="photo-half-noprev" id="prev-wrap-${slot.key}"><span>⏳</span><p>読込中</p></div>`
    : `<div class="photo-half-noprev"><span>—</span><p>前回写真なし</p></div>`;

  return `
    <div class="photo-card" data-slot="${slot.key}" data-section="${sectionKey}">
      <div class="photo-card-header">
        <div class="photo-card-title">${slot.label} ${reqBadge}${nonBadge}${countBadge}</div>
        ${statusHTML}
      </div>
      <div class="photo-pair">
        <div class="photo-half">
          <div class="photo-half-label prev">${prevLabel}</div>
          ${prevHTML}
        </div>
        <div class="photo-half">
          <div class="photo-half-label curr">今回撮影</div>
          ${currHTML}
        </div>
      </div>
    </div>
  `;
}

async function loadPrevPhotosForSlots(slots) {
  for (const slot of slots) {
    if (!slot.prevPage) continue;
    const wrap = document.getElementById(`prev-wrap-${slot.key}`);
    if (!wrap) continue;
    const imgData = await getPrevPhotoForSlot(slot);
    if (imgData) {
      wrap.innerHTML = '';
      const img = document.createElement('img');
      img.src = imgData;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      wrap.appendChild(img);
      wrap.style.display = 'block';
    }
  }
}

function deleteOnePhoto(slotKey, idx, evtOrSectionKey) {
  let sectionKey;
  if (evtOrSectionKey && typeof evtOrSectionKey === 'object' && evtOrSectionKey.target) {
    const card = evtOrSectionKey.target.closest('[data-section]');
    sectionKey = card ? card.dataset.section : null;
  } else {
    sectionKey = evtOrSectionKey;
  }
  const existing = state.photos[slotKey];
  if (Array.isArray(existing)) {
    existing.splice(idx, 1);
    if (existing.length === 0) {
      delete state.photos[slotKey];
    } else {
      _slotPhotoIndex[slotKey] = Math.min(idx, existing.length - 1);
    }
  } else {
    delete state.photos[slotKey];
  }
  if (!sectionKey) return;
  const slots = sectionKey === 's3' ? SURVEY_PHOTO_SLOTS : DAMAGE_PHOTO_SLOTS;
  const grid = document.getElementById(`photo-grid-${sectionKey}`);
  if (grid) {
    grid.innerHTML = slots.map(s => renderPhotoSlot(s, sectionKey)).join('');
    loadPrevPhotosForSlots(slots);
    attachAllGridSwipes(sectionKey);
  }
  updatePhotoProgress();
  showToast('写真を削除しました', '');
}

function deletePhotoAndRefresh(slotKey, sectionKey) {
  delete state.photos[slotKey];
  const slots = sectionKey === 's3' ? SURVEY_PHOTO_SLOTS : DAMAGE_PHOTO_SLOTS;
  const grid = document.getElementById(`photo-grid-${sectionKey}`);
  if (grid) {
    grid.innerHTML = slots.map(s => renderPhotoSlot(s, sectionKey)).join('');
    loadPrevPhotosForSlots(slots);
    attachAllGridSwipes(sectionKey);
  }
  updatePhotoProgress();
  showToast('写真を削除しました','');
}

const photoFilter = { span: 0, type: 'damage' };

function filterBySpan(span, sectionKey, evt) {
  const allSpanTabs = evt?.target?.closest('.photo-filter-tabs')
    ?.querySelectorAll('.photo-filter-tab');
  allSpanTabs?.forEach(t => t.classList.remove('active'));
  if (evt?.target) evt.target.classList.add('active');

  photoFilter.span = span;
  applyPhotoFilter(sectionKey);
  renderExtraPhotoGrid(sectionKey);
}

function filterPhotos(filter, sectionKey, evt) {
  const allTypeTabs = evt?.target?.closest('.photo-filter-tabs')
    ?.querySelectorAll('.photo-filter-tab');
  allTypeTabs?.forEach(t => t.classList.remove('active'));
  if (evt?.target) evt.target.classList.add('active');

  photoFilter.type = filter;
  applyPhotoFilter(sectionKey);
}

function applyPhotoFilter(sectionKey) {
  const slots = sectionKey === 's3' ? SURVEY_PHOTO_SLOTS : DAMAGE_PHOTO_SLOTS;
  const grid  = document.getElementById(`photo-grid-${sectionKey}`);
  if (!grid) return;

  const cards = grid.querySelectorAll('.photo-card');
  cards.forEach((card, i) => {
    const slot = slots[i];
    if (!slot) return;

    const spanOK = photoFilter.span === 0 || (slot.span || 1) === photoFilter.span;

    const isNON = slot.isNON || (slot.prevNo >= 1000);
    let typeOK = true;
    if (photoFilter.type === 'damage') typeOK = !isNON;
    if (photoFilter.type === 'non')    typeOK = isNON;

    card.style.display = (spanOK && typeOK) ? '' : 'none';
  });
}

// ===== カメラ撮影 =====
function capturePhoto(slotKey, sectionKey, addMode = false) {
  const old = document.getElementById('camera-input');
  if (old) old.remove();

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.id = 'camera-input';
  input.style.display = 'none';

  input.addEventListener('change', function(e) {
    handleCameraCapture(e, slotKey, sectionKey, addMode);
    input.remove();
  }, { once: true });

  document.body.appendChild(input);
  input.click();
}

function handleCameraCapture(e, slotKey, sectionKey, addMode) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const slots = sectionKey === 's3' ? SURVEY_PHOTO_SLOTS : DAMAGE_PHOTO_SLOTS;
    const slot = slots.find(s => s.key === slotKey) || { key: slotKey || `auto_${Date.now()}`, label: '撮影写真', required: false };

    compressImage(ev.target.result, 0.75, 1280).then(compressed => {
    const newEntry = { dataURL: compressed, label: slot.label };
    const existing = state.photos[slot.key];
    if (addMode && Array.isArray(existing)) {
      existing.push(newEntry);
    } else if (addMode && existing) {
      const prev = typeof existing === 'string' ? { dataURL: existing, label: slot.label } : existing;
      state.photos[slot.key] = [prev, newEntry];
    } else {
      state.photos[slot.key] = [newEntry];
    }
    showToast('✅ 写真を保存しました', 'success');

    const grid = document.getElementById(`photo-grid-${sectionKey}`);
    if (grid) {
      grid.innerHTML = slots.map(s => renderPhotoSlot(s, sectionKey)).join('');
      loadPrevPhotosForSlots(slots);
      attachAllGridSwipes(sectionKey);
      const list = state.photos[slot.key];
      if (Array.isArray(list) && list.length > 1) {
        setSlotPhotoIndex(slot.key, list.length - 1);
      }
      applyPhotoFilter(sectionKey);
    }
    updatePhotoProgress();
    const missing = slots.filter(s => s.required && !state.photos[s.key]);
    const alert = document.getElementById(`missing-${sectionKey}`);
    if (alert) {
      if (missing.length === 0) {
        alert.classList.remove('show');
      } else {
        alert.classList.add('show');
        alert.querySelector('p').innerHTML = `必須写真が <strong>${missing.length}枚</strong> 未撮影です。<br>${missing.slice(0,3).map(s=>s.label).join('、')}${missing.length > 3 ? '...' : ''}`;
      }
    }
    }); // compressImage end
  };
  reader.readAsDataURL(file);
}

// ===== ダウンロード =====
async function downloadAll() {
  if (typeof JSZip === 'undefined') {
    showToast('❌ JSZipが読み込まれていません。ページを再読み込みしてください。', 'error');
    return;
  }
  const photoKeys = Object.keys(state.photos);

  showToast('📦 データを収集中...', '');

  const drawEntries = []; // { key, pnum, dataURL }

  for (const [key, ds] of Object.entries(drawState)) {
    if (!ds) continue;
    const hasData = (ds.objects && ds.objects.length > 0) || ds.savedPenData;
    if (!hasData) continue;

    const m    = key.match(/p(\d+)$/);
    const pnum = m ? parseInt(m[1]) : null;

    let pdfPageCanvas = null;
    if (pnum && state.pdfDoc) {
      try {
        const page = await state.pdfDoc.getPage(pnum);
        const vp   = page.getViewport({ scale: 3.0 });
        pdfPageCanvas = document.createElement('canvas');
        pdfPageCanvas.width  = vp.width;
        pdfPageCanvas.height = vp.height;
        await page.render({
          canvasContext: pdfPageCanvas.getContext('2d'),
          viewport: vp
        }).promise;
      } catch(e) { pdfPageCanvas = null; }
    }

    const W = pdfPageCanvas?.width  || 1200;
    const H = pdfPageCanvas?.height || 1600;
    const cv  = document.createElement('canvas');
    cv.width  = W; cv.height = H;
    const ctx = cv.getContext('2d');

    if (pdfPageCanvas) {
      ctx.drawImage(pdfPageCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    }

    if (ds.savedPenData) {
      try {
        const penImg = await loadImage(ds.savedPenData);
        ctx.drawImage(penImg, 0, 0, W, H);
      } catch(e) {}
    }

    if (ds.objects && ds.objects.length > 0) {
      await drawObjectsToCanvas(ctx, ds.objects, W, H);
    }

    drawEntries.push({ key, pnum, dataURL: cv.toDataURL('image/jpeg', 0.92) });
  }

  if (drawEntries.length === 0 && photoKeys.length === 0) {
    showToast('保存できるデータがありません', 'error');
    return;
  }

  showToast('🖼️ 写真を圧縮中...', '');
  const compressedPhotoMap = {};
  for (const key of photoKeys) {
    const raw = state.photos[key];
    let list = [];
    if (Array.isArray(raw))              list = raw.map(p => typeof p === 'string' ? { dataURL: p } : p).filter(p => p?.dataURL);
    else if (typeof raw === 'string' && raw) list = [{ dataURL: raw }];
    else if (raw?.dataURL)               list = [raw];
    if (!list.length) continue;
    compressedPhotoMap[key] = await Promise.all(
      list.map(p => compressImage(p.dataURL, 0.75, 1280).then(d => ({ ...p, dataURL: d })))
    );
  }

  showToast('📦 ZIP生成中...', '');

  try {
    const zip = new JSZip();

    if (drawEntries.length > 0) {
      for (const entry of drawEntries) {
        const { key, pnum, dataURL } = entry;
        const label  = pnum ? `P${String(pnum).padStart(2,'0')}` : key;
        const b64    = dataURL.split(',')[1];
        let folderName = 'その他_書き込み図面';
        if (key.startsWith('s2'))                           folderName = 'その２_一般図';
        else if (key.startsWith('s4'))                      folderName = 'その４_部材番号図';
        else if (key.startsWith('s9') || key.startsWith('s9s10')) folderName = 'その９_損傷図';
        zip.folder(folderName).file(`${label}_書込済み.jpg`, b64, { base64: true });
      }
    }

    const surveyPhotos = photoKeys.filter(k => SURVEY_PHOTO_SLOTS.find(s => s.key === k));
    if (surveyPhotos.length > 0) {
      const f3 = zip.folder('その３_現地状況写真');
      for (const key of surveyPhotos) {
        const slot      = SURVEY_PHOTO_SLOTS.find(s => s.key === key);
        const baseLabel = slot ? `No${String(slot.prevNo).padStart(3,'0')}` : key;
        const list      = compressedPhotoMap[key] || [];
        list.forEach((p, idx) => {
          const dataURL = p?.dataURL;
          if (!dataURL?.startsWith('data:image')) return;
          const ext   = dataURL.includes('image/png') ? 'png' : 'jpg';
          const fname = list.length === 1 ? `${baseLabel}.${ext}` : `${baseLabel}_${idx + 1}.${ext}`;
          f3.file(fname, dataURL.split(',')[1], { base64: true });
        });
      }
    }

    const damagePhotos = photoKeys.filter(k => DAMAGE_PHOTO_SLOTS.find(s => s.key === k));
    if (damagePhotos.length > 0) {
      const f10d = zip.folder('その１０_損傷写真/損傷');
      const f10n = zip.folder('その１０_損傷写真/NON');
      for (const key of damagePhotos) {
        const slot      = DAMAGE_PHOTO_SLOTS.find(s => s.key === key);
        const baseLabel = slot ? `No${String(slot.prevNo).padStart(3,'0')}` : key;
        const folder    = slot?.isNON ? f10n : f10d;
        const list      = compressedPhotoMap[key] || [];
        list.forEach((p, idx) => {
          const dataURL = p?.dataURL;
          if (!dataURL?.startsWith('data:image')) return;
          const ext   = dataURL.includes('image/png') ? 'png' : 'jpg';
          const fname = list.length === 1 ? `${baseLabel}.${ext}` : `${baseLabel}_${idx + 1}.${ext}`;
          folder.file(fname, dataURL.split(',')[1], { base64: true });
        });
      }
    }

    const extraPhotos = state.extraPhotos || [];
    if (extraPhotos.length > 0) {
      for (const ep of extraPhotos) {
        const compressed = await compressImage(ep.dataURL, 0.75, 1280);
        if (!compressed?.startsWith('data:image')) continue;
        const ext = compressed.includes('image/png') ? 'png' : 'jpg';
        const isS3 = ep.sectionKey === 's3';
        let folderName, fname;
        if (isS3) {
          folderName = 'その３_現地状況写真/追加';
          const type = ep.info.type === '部材記号' ? ep.info.buzai : ep.info.type;
          fname = `${type}_${ep.id.replace('extra_','')}.${ext}`;
        } else {
          folderName = 'その１０_損傷写真/追加';
          const buzai   = ep.info.buzai   || '不明';
          const elemNo  = ep.info.elemNo  ? `No${ep.info.elemNo}` : '';
          const sonsyou = ep.info.sonsyou || '';
          fname = `${buzai}${elemNo}_${sonsyou}_${ep.id.replace('extra_','')}.${ext}`;
        }
        zip.folder(folderName).file(fname, compressed.split(',')[1], { base64: true });
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${state.pdfName}_点検データ.zip`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);

    const total = drawEntries.length + photoKeys.length + extraPhotos.length;
    showToast(`✅ ${total}ファイルをZIPで保存しました`, 'success');

  } catch(err) {
    console.error(err);
    showToast(`❌ 保存に失敗しました: ${err.message || err}`, 'error');
  }
}

async function drawObjectsToCanvas(ctx, objects, W, H) {
  const mmToPxLocal = (mm) => mm * (W / 210);

  for (const obj of objects) {
    const x1 = obj.x1 * W, y1 = obj.y1 * H;
    const x2 = obj.x2 * W, y2 = obj.y2 * H;
    const sw  = mmToPxLocal(obj.sizeMM || 0.5);
    const rot = obj.rotation || 0;

    ctx.save();
    if (rot !== 0) {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(rot * Math.PI / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.strokeStyle = obj.color || '#ef4444';
    ctx.lineWidth   = sw;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    if (obj.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

    } else if (obj.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const ah = Math.max(sw * 4, 8);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ah * Math.cos(angle - 0.4), y2 - ah * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - ah * Math.cos(angle + 0.4), y2 - ah * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = obj.color || '#ef4444';
      ctx.fill();

    } else if (obj.type === 'rect') {
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);

      if (obj.pattern === 'solid') {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle   = obj.color || '#ef4444';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.globalAlpha = 1.0;
        ctx.strokeRect(rx, ry, rw, rh);

      } else if (obj.pattern === 'hatch' || obj.pattern === 'diag') {
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        const step = Math.max(sw * 5, 6);
        ctx.lineWidth = sw * 0.8;
        ctx.beginPath();
        const d = rw + rh + step * 2;
        for (let i = -d; i <= d; i += step) {
          if (obj.pattern === 'hatch') {
            ctx.moveTo(rx + i, ry);          ctx.lineTo(rx + i + rh, ry + rh);
            ctx.moveTo(rx + rw + i, ry);     ctx.lineTo(rx + rw + i - rh, ry + rh);
          } else {
            ctx.moveTo(rx + i, ry);          ctx.lineTo(rx + i + rh, ry + rh);
          }
        }
        ctx.stroke();
        ctx.restore();

      } else {
        ctx.strokeRect(rx, ry, rw, rh);
      }

    } else if (obj.type === 'ellipse') {
      const ecx = (x1 + x2) / 2, ecy = (y1 + y2) / 2;
      const erx = Math.abs(x2 - x1) / 2, ery = Math.abs(y2 - y1) / 2;

      if (obj.pattern === 'solid') {
        ctx.beginPath();
        ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle   = obj.color || '#ef4444';
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.stroke();

      } else if (obj.pattern === 'hatch' || obj.pattern === 'diag') {
        ctx.beginPath();
        ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
        ctx.clip();
        const step = Math.max(sw * 5, 6);
        ctx.lineWidth = sw * 0.8;
        ctx.beginPath();
        const d = erx + ery + step * 2;
        for (let i = -d; i <= d; i += step) {
          if (obj.pattern === 'hatch') {
            ctx.moveTo(ecx - erx + i, ecy - ery); ctx.lineTo(ecx - erx + i + ery * 2, ecy + ery);
            ctx.moveTo(ecx + erx + i, ecy - ery); ctx.lineTo(ecx + erx + i - ery * 2, ecy + ery);
          } else {
            ctx.moveTo(ecx - erx + i, ecy - ery); ctx.lineTo(ecx - erx + i + ery * 2, ecy + ery);
          }
        }
        ctx.stroke();
        ctx.restore();

      } else {
        ctx.beginPath();
        ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) { reject(new Error('no src')); return; }
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('load failed'));
    img.src = src;
  });
}

// ===== ナビゲーション =====
let currentScreen = 'home'; // 'home' | 'menu' | 'viewer'
let _lastLoadPdfTime = 0;

function showScreen(name) {
  const map = { home: 'screen-home', menu: 'screen-menu', viewer: 'screen-viewer' };
  const order = ['home', 'menu', 'viewer'];
  const fromIdx = order.indexOf(currentScreen);
  const toIdx = order.indexOf(name);
  const direction = toIdx > fromIdx ? 'forward' : 'backward';

  const fromEl = document.getElementById(map[currentScreen]);
  const toEl   = document.getElementById(map[name]);

  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('is-active', 'is-behind');
  });

  if (direction === 'forward') {
    fromEl.classList.add('is-behind');
    toEl.classList.add('is-active');
    history.pushState({ screen: name }, '', '');
  } else {
    toEl.classList.add('is-active');
  }

  toEl.scrollTop = 0;
  currentScreen = name;
}

window.addEventListener('popstate', (e) => {
  if (currentScreen === 'home') return;
  if (Date.now() - _lastLoadPdfTime < 3000) return;
  goBack();
  if (currentScreen !== 'home') {
    history.pushState({ screen: currentScreen }, '', '');
  }
});

async function goBack() {
  const popup = document.getElementById('photo-popup');
  if (popup && popup.style.display === 'flex') {
    closePhotoPopup();
    return;
  }

  if (currentScreen === 'viewer') {
    autoSaveAllDrawings();
    showScreen('menu');
    showMenuContent();
    document.getElementById('topbar-title').textContent = '橋梁点検メニュー';
  } else if (currentScreen === 'menu') {
    showScreen('home');
    document.getElementById('topbar').style.display = 'none';
    state.mode = null;
  }
}

// ===== ペンデータ共通ユーティリティ =====
function _collectPenData() {
  for (const key of Object.keys(drawState)) {
    const ds = drawState[key];
    if (!ds) continue;
    const canvas = document.getElementById(`drawcanvas-${key}`);
    if (canvas && canvas.width > 0) {
      try { ds.savedPenData = canvas.toDataURL('image/png'); } catch(e) {}
    }
  }
  const export_ = {};
  for (const key of Object.keys(drawState)) {
    const ds = drawState[key];
    if (!ds) continue;
    if ((ds.objects && ds.objects.length > 0) || ds.savedPenData || ds.penStrokes?.length > 0) {
      export_[key] = {
        objects:      ds.objects      || [],
        penStrokes:   ds.penStrokes   || [],
        savedPenData: ds.savedPenData || null,
        color:        ds.color,
        sizeMM:       ds.sizeMM,
        pattern:      ds.pattern,
      };
    }
  }
  return export_;
}

function autoSaveAllDrawings() {
  _collectPenData();
}

// ===== ユーティリティ =====
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  if (type === 'error') {
    t.style.cursor = 'pointer';
    t.onclick = () => { t.className = ''; t.onclick = null; };
    toastTimer = null;
  } else {
    t.style.cursor = '';
    t.onclick = null;
    toastTimer = setTimeout(() => t.className = '', 2500);
  }
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
}

const uz = document.getElementById('upload-zone');
uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('dragover'); });
uz.addEventListener('dragleave', () => uz.classList.remove('dragover'));
uz.addEventListener('drop', e => {
  e.preventDefault(); uz.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') {
    const dt = new DataTransfer(); dt.items.add(f);
    const input = document.getElementById('file-input');
    input.files = dt.files;
    loadPDF(input);
  }
});

document.getElementById('screen-home').classList.add('is-active');
currentScreen = 'home';

// ===== スワイプ処理（グリッド・ポップアップ共通） =====
function attachSwipe(el, onSwipeLeft, onSwipeRight) {
  let sx = 0, sy = 0, moved = false;
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    moved = false;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    const dx = Math.abs(e.touches[0].clientX - sx);
    const dy = Math.abs(e.touches[0].clientY - sy);
    if (dx > dy && dx > 8) moved = true;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (!moved) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) onSwipeLeft();
    else        onSwipeRight();
  });
}

function attachGridSwipe(slotKey, sectionKey) {
  const wrap  = document.getElementById('curr-photo-wrap-' + slotKey);
  const stage = wrap ? wrap.querySelector('.curr-img-stage') : null;
  if (!stage || stage._swipeAttached) return;
  stage._swipeAttached = true;
  attachSwipe(stage,
    () => {
      const list = normalizePhotoList(state.photos[slotKey]);
      const cur  = _slotPhotoIndex[slotKey] || 0;
      if (cur < list.length - 1) setSlotPhotoIndex(slotKey, cur + 1);
    },
    () => {
      const cur = _slotPhotoIndex[slotKey] || 0;
      if (cur > 0) setSlotPhotoIndex(slotKey, cur - 1);
    }
  );
}

function attachAllGridSwipes(sectionKey) {
  const slots = sectionKey === 's3' ? SURVEY_PHOTO_SLOTS : DAMAGE_PHOTO_SLOTS;
  slots.forEach(s => attachGridSwipe(s.key, sectionKey));
}

(function initPopupSwipe() {
  const stage = document.getElementById('popup-img-stage');
  if (!stage) return;
  attachSwipe(stage,
    () => {
      const list = normalizePhotoList(state.photos[_popupSlotKey]);
      const prev = _popupPhotoIdx;
      _popupPhotoIdx = Math.min(list.length - 1, _popupPhotoIdx + 1);
      _updatePopupPhotoDisplay(list, prev);
    },
    () => {
      const list = normalizePhotoList(state.photos[_popupSlotKey]);
      const prev = _popupPhotoIdx;
      _popupPhotoIdx = Math.max(0, _popupPhotoIdx - 1);
      _updatePopupPhotoDisplay(list, prev);
    }
  );
})();

// ===== 追加写真機能 =====

const BUZAI_LIST = [
  'Mg:主桁','Cr:横桁','St:縦桁','Ds:床版','Cf:対傾構',
  'Lu:上横構','Ll:下横構','Bt:上・下弦材','Dt:斜材・垂直材','Pt:橋門構',
  'Ar:アーチリブ','Sa:補剛桁','Ha:吊り材','Ca:支柱','Pa:橋門構(アーチ)',
  'Rg:主構(桁)','Rp:主構(脚)','Sc:斜材(斜張)','Ts:塔柱','Th:塔部水平材',
  'Td:塔部斜材','Co:外ケーブル','Gb:ゲルバー部','Cn:PC定着部','Pp:格点',
  'Em:コンクリート埋込部','Sx:その他(上部)',
  'Pw:柱部・壁部','Pb:梁部','Pc:隅角部・接合部','Px:その他(橋脚)',
  'Ap:胸壁','Ac:竪壁','Aw:翼壁','Ax:その他(橋台)',
  'Ff:フーチング','Fx:その他(基礎)',
  'Bh:支承本体','Ba:アンカーボルト','Bm:沓座モルタル','Bc:台座コンクリート','Bx:その他(支承)',
  'Ss:落橋防止構造','Sd:横変位拘束構造',
  'Ra:高欄','Gf:防護柵','Fg:地覆','Me:中央分離帯','Ej:伸縮装置',
  'Si:遮音施設','Cu:縁石','Pm:舗装',
  'Dr:排水ます','Dp:排水管','Dx:その他(排水)',
  'Ip:点検施設','Ut:添架物','Ww:袖擁壁',
  'Ct:頂版','Sw:側壁','Cb:底版','Iw:隔壁','Jo:断面連結部','Lj:縦断連結部',
  'Eg:目地部','Sg:周辺地盤','Rd:路上','Cx:その他(溝橋)',
];

const SONSYOU_LIST = [
  '①腐食','②亀裂','③ゆるみ・脱落','④破断','⑤防食機能の劣化',
  '⑥ひびわれ','⑦剥離・鉄筋露出','⑧漏水・遊離石灰','⑨抜け落ち',
  '⑩補修・補強材の損傷','⑪床版ひびわれ','⑫うき',
  '⑬遊間の異常','⑭路面の凹凸','⑮舗装の異常','⑯支承部の機能障害','⑰その他',
  '⑱定着部の異常','⑲変色・劣化','⑳漏水・滞水',
  '㉑異常な音・振動','㉒異常なたわみ','㉓変形・欠損','㉔土砂詰まり',
  '㉕沈下・移動・傾斜','㉖洗掘','NON',
];

const _cachedBuzaiOptions    = BUZAI_LIST.map(b => `<option value="${b.split(':')[0]}">${b}</option>`).join('');
const _cachedSonsyouOptions  = SONSYOU_LIST.map(s => `<option value="${s}">${s}</option>`).join('');

const S3_TYPES = ['全景','正面','桁下','下部構造','部材記号'];

function startExtraPhoto(sectionKey) {
  const old = document.getElementById('extra-camera-input');
  if (old) old.remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.id = 'extra-camera-input';
  input.style.display = 'none';
  input.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) { input.remove(); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      compressImage(ev.target.result, 0.75, 1280).then(compressed => {
        openExtraPhotoModal(sectionKey, compressed);
      });
    };
    reader.readAsDataURL(file);
    input.remove();
  }, { once: true });
  document.body.appendChild(input);
  input.click();
}

function openExtraPhotoModal(sectionKey, dataURL) {
  const existing = document.getElementById('extra-photo-modal');
  if (existing) existing.remove();

  const promptEl = document.getElementById('damage-camera-prompt');
  if (promptEl) promptEl.remove();

  const isS3 = sectionKey === 's3';

  const slots = isS3 ? SURVEY_PHOTO_SLOTS : DAMAGE_PHOTO_SLOTS;
  const spans = [...new Set(slots.map(s => s.span || 1))].sort((a,b) => a-b);
  const currentSpan = photoFilter.span || spans[0] || 1;

  const spanField = spans.length > 1 ? `
    <div class="epm-field">
      <label class="epm-label">径間</label>
      <select id="epm-span" class="epm-select">
        ${spans.map(sp => `<option value="${sp}" ${sp === currentSpan ? 'selected' : ''}>${sp}径間</option>`).join('')}
      </select>
    </div>` : `<input type="hidden" id="epm-span" value="${spans[0] || 1}">`;

  const modal = document.createElement('div');
  modal.id = 'extra-photo-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.85);display:flex;align-items:flex-end;';

  const s3Fields = `
    <div class="epm-field">
      <label class="epm-label">撮影種別</label>
      <select id="epm-s3-type" class="epm-select" onchange="toggleBuzaiInput()">
        ${S3_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="epm-field" id="epm-buzai-field" style="display:none;">
      <label class="epm-label">部材記号</label>
      <select id="epm-buzai" class="epm-select">
        ${_cachedBuzaiOptions}
      </select>
    </div>`;

  const s10Fields = `
    <div class="epm-field">
      <label class="epm-label">部材名</label>
      <select id="epm-buzai-s10" class="epm-select">
        ${_cachedBuzaiOptions}
      </select>
    </div>
    <div class="epm-field">
      <label class="epm-label">要素番号（任意）</label>
      <input id="epm-element-no" type="text" class="epm-input" placeholder="例: 0101 または 0101〜0201">
    </div>
    <div class="epm-field">
      <label class="epm-label">損傷の種類</label>
      <select id="epm-sonsyou" class="epm-select">
        ${_cachedSonsyouOptions}
      </select>
    </div>
    <div class="epm-field">
      <label class="epm-label">損傷程度</label>
      <select id="epm-grade" class="epm-select">
        <option value="">-</option>
        <option value="a">a</option>
        <option value="b">b</option>
        <option value="c">c</option>
        <option value="d">d</option>
        <option value="e">e</option>
      </select>
    </div>`;

  modal.innerHTML = `
    <div style="background:var(--surface,#1e2433);width:100%;max-height:90vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:15px;font-weight:700;color:var(--text);">📷 写真情報を入力</div>
        <button onclick="closeExtraPhotoModal()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">✕ キャンセル</button>
      </div>
      <img src="${dataURL}" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px;margin-bottom:12px;background:#000;">
      ${spanField}
      ${isS3 ? s3Fields : s10Fields}
      <div class="epm-field">
        <label class="epm-label">備考（任意）</label>
        <input id="epm-memo" type="text" class="epm-input" placeholder="メモを入力">
      </div>
      <button data-save style="width:100%;margin-top:8px;background:var(--green,#22c55e);border:none;color:#fff;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;">💾 保存</button>
    </div>`;

  modal._dataURL = dataURL;
  modal._sectionKey = sectionKey;
  document.body.appendChild(modal);
  modal.querySelector('button[data-save]').onclick = () => {
    modal.dataset.span    = document.getElementById('epm-span')?.value || '1';
    modal.dataset.memo    = document.getElementById('epm-memo')?.value || '';
    modal.dataset.buzai   = document.getElementById('epm-buzai-s10')?.value || '';
    modal.dataset.elemNo  = document.getElementById('epm-element-no')?.value || '';
    modal.dataset.sonsyou = document.getElementById('epm-sonsyou')?.value || '';
    modal.dataset.grade   = document.getElementById('epm-grade')?.value || '';
    modal.dataset.s3type  = document.getElementById('epm-s3-type')?.value || '';
    modal.dataset.s3buzai = document.getElementById('epm-buzai')?.value || '';
    hideExtraPhotoModal();
    saveExtraPhoto(sectionKey, dataURL);
  };
}

function toggleBuzaiInput() {
  const sel = document.getElementById('epm-s3-type');
  const field = document.getElementById('epm-buzai-field');
  if (field) field.style.display = sel?.value === '部材記号' ? 'block' : 'none';
}

function closeExtraPhotoModal() {
  const m = document.getElementById('extra-photo-modal');
  if (m) m.remove();
}

function hideExtraPhotoModal() {
  const m = document.getElementById('extra-photo-modal');
  if (m) m.style.display = 'none';
}

function saveExtraPhoto(sectionKey, dataURL) {
  const isS3 = sectionKey === 's3';
  let info = {};
  const modal = document.getElementById('extra-photo-modal');
  const ds = modal?.dataset;
  const memo  = ds?.memo  ?? document.getElementById('epm-memo')?.value  ?? '';
  const span  = parseInt(ds?.span  ?? document.getElementById('epm-span')?.value  ?? '1') || 1;

  if (isS3) {
    const type  = ds?.s3type  ?? document.getElementById('epm-s3-type')?.value  ?? '';
    const buzai = type === '部材記号' ? (ds?.s3buzai ?? document.getElementById('epm-buzai')?.value ?? '') : '';
    info = { type, buzai, memo, span };
  } else {
    const buzai   = ds?.buzai   ?? document.getElementById('epm-buzai-s10')?.value  ?? '';
    const elemNo  = ds?.elemNo  ?? document.getElementById('epm-element-no')?.value ?? '';
    const sonsyou = ds?.sonsyou ?? document.getElementById('epm-sonsyou')?.value    ?? '';
    const grade   = ds?.grade   ?? document.getElementById('epm-grade')?.value      ?? '';
    info = { buzai, elemNo, sonsyou, grade, memo, span };
  }

  const id = 'extra_' + Date.now();
  if (!state.extraPhotos) state.extraPhotos = [];
  state.extraPhotos.push({ id, sectionKey, dataURL, info });

  if (!isS3 && _damageAddDrawKey) {
    const drawDs = drawState[_damageAddDrawKey];
    if (drawDs) {
      const arrows = drawDs.objects.filter(o => o.type === 'arrow');
      const lastArrow = arrows[arrows.length - 1];
      if (lastArrow) {
        const addNo        = state.extraPhotos.length;
        const buzaiLabel   = info.buzai  || '';
        const elemNo       = info.elemNo ? String(info.elemNo) : '';
        const memberLabel  = elemNo ? `${buzaiLabel}${elemNo}` : buzaiLabel;
        const sonsyouLabel = info.sonsyou || '';
        const gradeLabel   = info.grade ? `\uff0d${info.grade}` : '';
        lastArrow.label = `\u8ffd\u52a0${addNo}\u3000${memberLabel}\u3000${sonsyouLabel}${gradeLabel}`.trim();
        const drawKeySnap = _damageAddDrawKey;
        setTimeout(() => renderSVGObjects(drawKeySnap), 100);
      }
    }
    _damageAddDrawKey = null;
  }

  const prompt = document.getElementById('damage-camera-prompt');
  if (prompt) prompt.remove();

  closeExtraPhotoModal();
  renderExtraPhotoGrid(sectionKey, true);
  if (sectionKey === 's9s10') renderExtraPhotoGrid('s10', true);
  if (sectionKey === 's10')   renderExtraPhotoGrid('s10', true);
  showToast('\u2705 \u5199\u771f\u3092\u8ffd\u52a0\u3057\u307e\u3057\u305f', 'success');
}

function renderExtraPhotoGrid(sectionKey, appendOnly = false) {
  const grid = document.getElementById('extra-photo-grid-' + sectionKey);
  if (!grid) return;
  const keys = sectionKey === 's10' ? ['s10', 's9s10'] : [sectionKey];
  const allPhotos = (state.extraPhotos || []).filter(p => keys.includes(p.sectionKey));

  const currentSpan = photoFilter.span || 0;
  const photos = currentSpan === 0
    ? allPhotos
    : allPhotos.filter(p => (p.info?.span || 1) === currentSpan);

  if (photos.length === 0) {
    const msg = allPhotos.length > 0
      ? `<div style="color:var(--text2);font-size:12px;padding:8px 0;">この径間の追加写真はありません</div>`
      : `<div style="color:var(--text2);font-size:12px;padding:8px 0;">追加写真はありません</div>`;
    grid.innerHTML = msg;
    return;
  }

  const makeCard = (p, i) => {
    const isS3   = p.sectionKey === 's3';
    const allIdx = (state.extraPhotos || []).findIndex(x => x.id === p.id);
    const seqNo  = allIdx >= 0 ? allIdx + 1 : i + 1;
    let label;
    if (isS3) {
      label = p.info.type === '部材記号' ? `追加${seqNo} 部材記号:${p.info.buzai}` : `追加${seqNo} ${p.info.type}`;
    } else {
      const buzai   = (p.info.buzai || '').replace(/\s/g, '');
      const elemNo  = p.info.elemNo ? p.info.elemNo : '';
      const sonsyou = p.info.sonsyou || '';
      const grade   = p.info.grade   ? `-${p.info.grade}` : '';
      label = `追加${seqNo} ${buzai}${elemNo} ${sonsyou}${grade}`.trim();
    }
    const spanBadge = `<span style="background:var(--accent,#3b82f6);color:#fff;font-size:9px;font-weight:700;border-radius:6px;padding:1px 5px;margin-left:4px;">${p.info?.span || 1}径間</span>`;
    const memo   = p.info.memo ? `<div style="font-size:10px;color:var(--text2);margin-top:2px;">${p.info.memo}</div>` : '';
    const div = document.createElement('div');
    div.dataset.photoId = p.id;
    div.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;overflow:hidden;position:relative;';
    div.innerHTML = `
      <img src="${p.dataURL}" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;" onclick="openExtraPhotoLightbox('${p.id}')">
      <button onclick="deleteExtraPhoto('${p.id}','${sectionKey}')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:24px;height:24px;font-size:12px;cursor:pointer;">✕</button>
      <div style="padding:6px 8px;">
        <div style="font-size:11px;font-weight:700;color:var(--text);">${label}${spanBadge}</div>
        ${memo}
      </div>`;
    return div;
  };

  if (appendOnly && grid.querySelector('[data-photo-id]')) {
    const lastPhoto = photos[photos.length - 1];
    if (lastPhoto && !grid.querySelector(`[data-photo-id="${lastPhoto.id}"]`)) {
      grid.appendChild(makeCard(lastPhoto, photos.length - 1));
    }
    return;
  }

  grid.innerHTML = '';
  photos.forEach((p, i) => grid.appendChild(makeCard(p, i)));
}

function deleteExtraPhoto(id, sectionKey) {
  state.extraPhotos = (state.extraPhotos || []).filter(p => p.id !== id);
  renderExtraPhotoGrid(sectionKey);
  showToast('写真を削除しました', '');
}

function openExtraPhotoLightbox(id) {
  const p = (state.extraPhotos || []).find(x => x.id === id);
  if (!p) return;
  openPhotoLightbox(null, 0, null, p.dataURL);
}

// ===== 複数枚写真UI用スタイル追加 =====
(function injectMultiPhotoStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* 枚数バッジ */
    .photo-card-badge-count {
      display:inline-block; background:#3b82f6; color:#fff;
      font-size:10px; font-weight:700; border-radius:10px;
      padding:1px 7px; margin-left:4px; vertical-align:middle;
    }

    /* 撮影済みエリア：既存のphoto-half-doneは上書きせず新クラスを使用 */
    .curr-photo-wrap {
      position:relative; width:100%; height:100%;
      background:#000;
      display:flex; flex-direction:column;
    }
    /* スライドアニメーション用ステージ（overflow:hiddenでクリップ） */
    .curr-img-stage {
      flex:1; overflow:hidden; position:relative; min-height:0;
    }
    .curr-photo-img {
      width:100%; height:100%; object-fit:cover;
      display:block; cursor:pointer;
      will-change:transform;
    }

    /* 左右ナビボタン */
    .curr-nav {
      position:absolute; top:50%; transform:translateY(-50%);
      background:rgba(0,0,0,0.5); color:#fff;
      border:none; border-radius:50%;
      width:36px; height:36px; font-size:22px;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; z-index:3; padding:0; line-height:1;
    }
    .curr-nav-prev { left:6px; }
    .curr-nav-next { right:6px; }

    /* ドットインジケーター */
    .curr-photo-dots {
      display:flex; justify-content:center; gap:5px;
      padding:4px 0; background:rgba(0,0,0,0.45);
    }
    .curr-dot {
      width:7px; height:7px; border-radius:50%;
      background:rgba(255,255,255,0.4); display:inline-block;
    }
    .curr-dot.active { background:#fff; }

    /* 追加・撮り直しボタン行（写真下部） */
    .curr-photo-actions {
      display:flex; gap:0;
    }
    .photo-btn-add, .photo-btn-retake {
      flex:1; padding:8px 4px; border:none;
      font-size:12px; font-weight:700; cursor:pointer;
      white-space:nowrap;
    }
    .photo-btn-add    { background:var(--green,#22c55e); color:#fff; }
    .photo-btn-retake { background:var(--surface,#374151); color:#fff; }

    /* 削除ボタン（右上） */
    .curr-photo-delete {
      position:absolute; top:6px; right:6px; z-index:4;
    }

    /* ライトボックス */
    #photo-lightbox {
      display:none; position:fixed; inset:0; z-index:9999;
      align-items:center; justify-content:center;
    }
    .lb-overlay {
      position:absolute; inset:0; background:rgba(0,0,0,0.85);
    }
    .lb-content {
      position:relative; z-index:1; display:flex;
      align-items:center; justify-content:center;
      max-width:96vw; max-height:90vh;
    }
    #lb-img {
      max-width:90vw; max-height:85vh;
      object-fit:contain; border-radius:8px; display:block;
    }
    .lb-close {
      position:fixed; top:16px; right:16px;
      background:rgba(255,255,255,0.15); color:#fff;
      border:none; border-radius:50%; width:36px; height:36px;
      font-size:18px; cursor:pointer; display:flex;
      align-items:center; justify-content:center; z-index:2;
    }
    .lb-nav {
      position:fixed; top:50%; transform:translateY(-50%);
      background:rgba(255,255,255,0.15); color:#fff;
      border:none; border-radius:50%; width:44px; height:44px;
      font-size:28px; cursor:pointer; display:flex;
      align-items:center; justify-content:center; z-index:2;
    }
    .lb-prev { left:12px; }
    .lb-next { right:12px; }
    .lb-counter {
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      color:#fff; font-size:14px; font-weight:700;
      background:rgba(0,0,0,0.45); padding:3px 12px; border-radius:12px;
    }

    /* 追加写真モーダル */
    .epm-field {
      margin-bottom:10px;
    }
    .epm-label {
      display:block; font-size:12px; font-weight:700;
      color:var(--text2,#9ca3af); margin-bottom:4px;
    }
    .epm-select, .epm-input {
      width:100%; padding:10px 12px;
      background:var(--surface2,#374151);
      border:1px solid var(--border,#4b5563);
      color:var(--text,#f9fafb);
      border-radius:8px; font-size:14px;
      box-sizing:border-box;
      -webkit-appearance:none;
    }
    .epm-select { cursor:pointer; }

    /* 損傷追加ボタン */
    .damage-add-btn {
      background: var(--green, #22c55e) !important;
      color: #fff !important;
      font-weight: 700 !important;
    }
    .damage-add-btn.active {
      background: #f59e0b !important;
      color: #fff !important;
    }
  `;
  document.head.appendChild(style);
})();
