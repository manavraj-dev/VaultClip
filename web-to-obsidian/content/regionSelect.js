/**
 * "Select an area" capture mode. Lets the user drag a translucent box over
 * part of the page (like a screenshot tool), then pulls the real DOM
 * content — text, links, images, formatting — out of whatever falls inside
 * that box, instead of a flat image. Everything else (title, tags,
 * properties, filename) is filled in afterwards exactly like any other
 * capture mode.
 */
const ObsidianRegionSelect = (() => {
  let active = false;
  let overlay = null;
  let box = null;
  let hint = null;
  let toolbar = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  function teardown() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown, true);
    [overlay, box, hint, toolbar].forEach((el) => el && el.remove());
    overlay = box = hint = toolbar = null;
    dragging = false;
    active = false;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') teardown();
  }

  function styleFixed(el, extra) {
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: 2147483647,
      boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }, extra);
  }

  function buildChrome() {
    overlay = document.createElement('div');
    styleFixed(overlay, { inset: '0', cursor: 'crosshair', background: 'rgba(15,12,26,0.18)' });

    box = document.createElement('div');
    styleFixed(box, {
      display: 'none',
      border: '2px solid #7c5cff',
      background: 'rgba(124,92,255,0.22)',
      pointerEvents: 'none',
    });

    hint = document.createElement('div');
    hint.textContent = 'Drag a box around what you want to save \u2022 Esc to cancel';
    styleFixed(hint, {
      top: '16px', left: '50%', transform: 'translateX(-50%)',
      background: '#1f1f26', color: '#eceaf5', padding: '8px 14px',
      borderRadius: '8px', fontSize: '13px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      pointerEvents: 'none',
    });

    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(box);
    document.documentElement.appendChild(hint);
  }

  function buildToolbar(rect) {
    if (toolbar) toolbar.remove();
    toolbar = document.createElement('div');
    const top = Math.min(window.innerHeight - 48, rect.bottom + 10);
    const left = Math.min(window.innerWidth - 210, Math.max(8, rect.left));
    styleFixed(toolbar, { top: top + 'px', left: left + 'px', display: 'flex', gap: '8px' });

    const makeBtn = (label, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
        fontSize: '12px', fontWeight: '600', color: '#fff',
        border: primary ? 'none' : '1px solid #56506e',
        background: primary ? '#7c5cff' : 'rgba(31,31,38,0.9)',
      });
      return b;
    };

    const useBtn = makeBtn('Use this area', true);
    const redoBtn = makeBtn('Redraw', false);
    toolbar.appendChild(useBtn);
    toolbar.appendChild(redoBtn);
    document.documentElement.appendChild(toolbar);
    return { useBtn, redoBtn };
  }

  /** Finds the shallowest set of elements whose boxes mostly fall inside rect. */
  function elementsInRect(rect) {
    const all = document.body.querySelectorAll('*');
    const hits = [];
    for (const el of all) {
      if (el === overlay || el === box || el === hint || el === toolbar) continue;
      if (toolbar && toolbar.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const overlapW = Math.max(0, Math.min(r.right, rect.right) - Math.max(r.left, rect.left));
      const overlapH = Math.max(0, Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top));
      const overlapArea = overlapW * overlapH;
      const elArea = r.width * r.height;
      if (elArea > 0 && overlapArea / elArea > 0.6) hits.push(el);
    }
    const hitSet = new Set(hits);
    // Keep only the outermost picks — drop anything whose ancestor is also a hit,
    // so we don't duplicate nested content.
    return hits.filter((el) => {
      let p = el.parentElement;
      while (p) {
        if (hitSet.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function extractFromRect(rect) {
    const picked = elementsInRect(rect);
    if (picked.length === 0) return null;
    const container = document.createElement('div');
    picked.forEach((el) => container.appendChild(el.cloneNode(true)));
    const clone = ObsidianExtractor.cleanClone(container);
    if (!clone.innerText || !clone.innerText.trim()) return null;
    return { title: ObsidianExtractor.getPageTitle(), html: clone.innerHTML };
  }

  function onMouseDown(e) {
    if (toolbar) { toolbar.remove(); toolbar = null; }
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    Object.assign(box.style, { left: startX + 'px', top: startY + 'px', width: '0px', height: '0px', display: 'block' });
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    const rect = box.getBoundingClientRect();
    if (rect.width < 12 || rect.height < 12) {
      box.style.display = 'none';
      return;
    }
    const { useBtn, redoBtn } = buildToolbar(rect);
    useBtn.addEventListener('click', () => {
      const result = extractFromRect(rect);
      teardown();
      chrome.runtime.sendMessage({
        type: 'WTO_REGION_RESULT',
        result: result
          ? { ...result, url: location.href }
          : { error: 'Couldn\u2019t find readable content in that area \u2014 try drawing a slightly larger box.' },
      });
    });
    redoBtn.addEventListener('click', () => {
      box.style.display = 'none';
      toolbar.remove();
      toolbar = null;
    });
  }

  function start() {
    if (active) return;
    active = true;
    buildChrome();
    overlay.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown, true);
  }

  return { start };
})();
