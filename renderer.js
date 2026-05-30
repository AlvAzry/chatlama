/**
 * renderer.js
 * Virtual/chunk-based chat bubble renderer untuk Obrolan.
 *
 * Strategi:
 * - Render dalam chunk per tanggal (date group).
 * - Gunakan IntersectionObserver untuk lazy-load chunk berikutnya.
 * - Ini menjaga DOM ringan untuk archive 4MB+ dengan 70k+ baris.
 */

import { formatDateLabel } from './parser.js';

const CHUNK_SIZE = 50; // Jumlah pesan per render batch

/**
 * Buat elemen divider tanggal.
 * @param {string} dateKey
 * @returns {HTMLElement}
 */
function createDateDivider(dateKey) {
  const div = document.createElement('div');
  div.className = 'date-divider';
  div.dataset.dateKey = dateKey;

  const line1 = document.createElement('span');
  line1.className = 'divider-line';

  const label = document.createElement('span');
  label.className = 'divider-label';
  label.textContent = formatDateLabel(dateKey);

  const line2 = document.createElement('span');
  line2.className = 'divider-line';

  div.appendChild(line1);
  div.appendChild(label);
  div.appendChild(line2);

  return div;
}

/**
 * Buat elemen bubble chat.
 * @param {Object} msg - Message object dari parser
 * @returns {HTMLElement}
 */
function createBubble(msg) {
  // Skip null (voice note placeholder)
  if (msg.isNull) return null;

  const wrapper = document.createElement('div');
  wrapper.className = `msg-row msg-${msg.side}`;
  wrapper.dataset.msgId = msg.id;
  wrapper.dataset.dateKey = msg.dateKey;

  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${msg.side}`;

  if (msg.isMedia) {
    const mediaEl = document.createElement('span');
    mediaEl.className = 'bubble-media';
    mediaEl.textContent = '[ media ]';
    bubble.appendChild(mediaEl);
  } else {
    const textEl = document.createElement('p');
    textEl.className = 'bubble-text';
    // Preserve newlines dari multiline message
    textEl.innerHTML = escapeHtml(msg.text).replace(/\n/g, '<br>');
    bubble.appendChild(textEl);

    if (msg.edited) {
      const editedTag = document.createElement('span');
      editedTag.className = 'bubble-edited';
      editedTag.textContent = 'diedit';
      bubble.appendChild(editedTag);
    }
  }

  const meta = document.createElement('div');
  meta.className = 'bubble-meta';
  meta.textContent = msg.timeStr;
  bubble.appendChild(meta);

  wrapper.appendChild(bubble);
  return wrapper;
}

/**
 * Escape HTML entities untuk mencegah XSS.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render semua pesan ke container menggunakan chunked rendering.
 * Mengelompokkan pesan berdasarkan tanggal dan memasang sentinel
 * untuk lazy-loading chunk berikutnya.
 *
 * @param {HTMLElement} container - Element #chat-container
 * @param {Object[]} messages - Array pesan hasil parser
 * @param {string[]} dates - Array dateKey unik
 * @param {Function} onProgress - Callback(rendered, total)
 */
function renderChunked(container, messages, dates, onProgress) {
  // Kelompokkan pesan per tanggal
  const byDate = {};
  dates.forEach(d => (byDate[d] = []));
  messages.forEach(m => {
    if (byDate[m.dateKey]) byDate[m.dateKey].push(m);
  });

  const dateGroups = dates.map(dateKey => ({
    dateKey,
    msgs: byDate[dateKey],
    rendered: false,
  }));

  let totalRendered = 0;
  const total = messages.length;

  // Buat semua sentinel/placeholder per date group
  const sentinels = [];
  dateGroups.forEach((group, idx) => {
    // Divider tanggal
    const divider = createDateDivider(group.dateKey);
    container.appendChild(divider);
    group.dividerEl = divider;

    // Placeholder sentinel yang akan di-observe
    const sentinel = document.createElement('div');
    sentinel.className = 'group-sentinel';
    sentinel.dataset.groupIdx = idx;
    container.appendChild(sentinel);
    group.sentinel = sentinel;
    sentinels.push(sentinel);
  });

  // IntersectionObserver untuk lazy-render per group
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const idx = parseInt(entry.target.dataset.groupIdx, 10);
        const group = dateGroups[idx];
        if (group.rendered) return;
        group.rendered = true;

        // Render pesan dari group ini setelah sentinelnya
        const nodes = [];
        group.msgs.forEach(msg => {
          const el = createBubble(msg);
          if (el) nodes.push(el);
        });

        // Insert semua node setelah sentinel, mempertahankan urutan
        const parent = entry.target.parentNode;
        let anchor = entry.target;
        nodes.forEach(node => {
          anchor.insertAdjacentElement('afterend', node);
          anchor = node;
        });

        totalRendered += group.msgs.length;
        if (onProgress) onProgress(totalRendered, total);

        observer.unobserve(entry.target);
      });
    },
    {
      root: null,
      rootMargin: '200px',
      threshold: 0,
    }
  );

  sentinels.forEach(s => observer.observe(s));

  // Render group pertama segera tanpa menunggu observer
  if (dateGroups.length > 0) {
    const first = dateGroups[0];
    if (!first.rendered) {
      first.rendered = true;
      const nodes = [];
      first.msgs.forEach(msg => {
        const el = createBubble(msg);
        if (el) nodes.push(el);
      });
      let anchor = first.sentinel;
      nodes.forEach(node => {
        anchor.insertAdjacentElement('afterend', node);
        anchor = node;
      });
      totalRendered += first.msgs.length;
      if (onProgress) onProgress(totalRendered, total);
      observer.unobserve(first.sentinel);
    }
  }

  return {
    // Scroll ke tanggal tertentu
    jumpToDate(dateKey) {
      const group = dateGroups.find(g => g.dateKey === dateKey);
      if (!group) return;

      // Pastikan group ini dan group sebelumnya sudah di-render
      const idx = dateGroups.indexOf(group);
      for (let i = 0; i <= idx; i++) {
        const g = dateGroups[i];
        if (!g.rendered) {
          g.rendered = true;
          const nodes = [];
          g.msgs.forEach(msg => {
            const el = createBubble(msg);
            if (el) nodes.push(el);
          });
          let anchor = g.sentinel;
          nodes.forEach(node => {
            anchor.insertAdjacentElement('afterend', node);
            anchor = node;
          });
          totalRendered += g.msgs.length;
          if (onProgress) onProgress(totalRendered, total);
          observer.unobserve(g.sentinel);
        }
      }

      setTimeout(() => {
        group.dividerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    },

    // Scroll ke message ID tertentu
    jumpToMessageId(msgId) {
      const el = container.querySelector(`[data-msg-id="${msgId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },

    // Dapatkan tanggal yang sedang terlihat (untuk simpan posisi baca)
    getCurrentDateKey() {
      const rows = container.querySelectorAll('.date-divider');
      let current = null;
      for (const divider of rows) {
        const rect = divider.getBoundingClientRect();
        if (rect.top < window.innerHeight / 2) {
          current = divider.dataset.dateKey;
        } else {
          break;
        }
      }
      return current;
    },
  };
}

export { renderChunked, createBubble, createDateDivider };
