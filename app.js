/**
 * app.js
 * Entry point utama Obrolan.
 * Mengatur: loading, opening screen, navigasi tanggal,
 * simpan posisi baca, pencarian, dan alur website.
 */

import { parseChat, formatDateLabel, formatDateShort } from './parser.js';
import { renderChunked } from './renderer.js';

const STORAGE_KEY = 'obrolan_last_read';
const CHAT_PATH = './assets/chat.txt';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let chatEngine = null;      // Object dari renderChunked()
let allMessages = [];       // Array pesan hasil parser
let allDates = [];          // Array dateKey unik
let saveTimeout = null;     // Debounce save posisi baca
let searchVisible = false;
let navVisible = false;

// ─────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────
const $loading     = document.getElementById('loading-screen');
const $opening     = document.getElementById('opening-screen');
const $chat        = document.getElementById('chat-wrapper');
const $container   = document.getElementById('chat-container');
const $ending      = document.getElementById('ending-section');
const $navBtn      = document.getElementById('nav-btn');
const $navPanel    = document.getElementById('nav-panel');
const $navClose    = document.getElementById('nav-close');
const $navList     = document.getElementById('nav-date-list');
const $searchBtn   = document.getElementById('search-btn');
const $searchPanel = document.getElementById('search-panel');
const $searchInput = document.getElementById('search-input');
const $searchClose = document.getElementById('search-close');
const $searchResults = document.getElementById('search-results');
const $resumeBar   = document.getElementById('resume-bar');
const $resumeYes   = document.getElementById('resume-yes');
const $resumeNo    = document.getElementById('resume-no');
const $loadProgress = document.getElementById('load-progress');

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
  showLoading(true);

  try {
    const raw = await fetchChat();
    const parsed = parseChat(raw);
    allMessages = parsed.messages;
    allDates = parsed.dates;

    // Render chat
    chatEngine = renderChunked($container, allMessages, allDates, onRenderProgress);

    // Susun daftar navigasi tanggal
    buildNavList();

    // Tampilkan opening screen dulu
    showOpening();

    // Cek posisi baca tersimpan
    checkSavedPosition();

    // Event listeners
    setupEvents();

  } catch (err) {
    console.error('Gagal memuat chat:', err);
    showError(err.message);
  }
}

// ─────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────
async function fetchChat() {
  const res = await fetch(CHAT_PATH);
  if (!res.ok) throw new Error(`Gagal membaca chat.txt (${res.status})`);
  return await res.text();
}

// ─────────────────────────────────────────────
// LOADING
// ─────────────────────────────────────────────
function showLoading(visible) {
  $loading.style.display = visible ? 'flex' : 'none';
}

function onRenderProgress(rendered, total) {
  const pct = Math.round((rendered / total) * 100);
  if ($loadProgress) {
    $loadProgress.style.width = pct + '%';
  }
}

// ─────────────────────────────────────────────
// OPENING SCREEN
// ─────────────────────────────────────────────
function showOpening() {
  showLoading(false);
  $opening.classList.add('visible');
  $chat.style.display = 'none';

  // Opening menghilang saat scroll pertama
  let triggered = false;
  const handleScroll = () => {
    if (triggered) return;
    triggered = true;
    transitionToChat();
    window.removeEventListener('scroll', handleScroll);
  };

  // Juga bisa klik/tap opening untuk lanjut
  $opening.addEventListener('click', () => {
    if (!triggered) {
      triggered = true;
      window.removeEventListener('scroll', handleScroll);
      transitionToChat();
    }
  }, { once: true });

  window.addEventListener('scroll', handleScroll, { passive: true });
}

function transitionToChat() {
  $opening.classList.add('fade-out');
  setTimeout(() => {
    $opening.style.display = 'none';
    $chat.style.display = 'block';
    $ending.style.display = 'flex';

    // Tampilkan floating buttons
    document.getElementById('floating-controls').style.display = 'flex';

    // Setup scroll save position
    setupScrollSave();
  }, 600);
}

// ─────────────────────────────────────────────
// POSISI BACA (READING PROGRESS)
// ─────────────────────────────────────────────
function checkSavedPosition() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  const data = JSON.parse(saved);
  if (!data.dateKey) return;

  const label = formatDateLabel(data.dateKey);
  document.getElementById('resume-date-label').textContent = label;
  $resumeBar.style.display = 'flex';
}

function setupScrollSave() {
  window.addEventListener('scroll', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const dateKey = chatEngine.getCurrentDateKey();
      if (dateKey) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ dateKey }));
      }
    }, 500);
  }, { passive: true });
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function buildNavList() {
  $navList.innerHTML = '';
  allDates.forEach(dateKey => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'nav-date-btn';
    btn.textContent = formatDateShort(dateKey);
    btn.dataset.dateKey = dateKey;
    btn.addEventListener('click', () => {
      closeNav();
      chatEngine.jumpToDate(dateKey);
    });
    li.appendChild(btn);
    $navList.appendChild(li);
  });
}

function openNav() {
  navVisible = true;
  $navPanel.classList.add('open');
  document.body.classList.add('panel-open');
}

function closeNav() {
  navVisible = false;
  $navPanel.classList.remove('open');
  document.body.classList.remove('panel-open');
}

// ─────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────
function openSearch() {
  searchVisible = true;
  $searchPanel.classList.add('open');
  document.body.classList.add('panel-open');
  setTimeout(() => $searchInput.focus(), 100);
}

function closeSearch() {
  searchVisible = false;
  $searchPanel.classList.remove('open');
  document.body.classList.remove('panel-open');
  $searchInput.value = '';
  $searchResults.innerHTML = '';
}

let searchTimeout = null;
function handleSearch(query) {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const q = query.trim().toLowerCase();
    $searchResults.innerHTML = '';

    if (q.length < 2) return;

    const hits = [];
    for (const msg of allMessages) {
      if (!msg.isNull && !msg.isMedia && msg.text.toLowerCase().includes(q)) {
        hits.push(msg);
        if (hits.length >= 50) break; // Batasi 50 hasil
      }
    }

    if (hits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = 'Tidak ada hasil.';
      $searchResults.appendChild(empty);
      return;
    }

    hits.forEach(msg => {
      const item = document.createElement('div');
      item.className = `search-result-item search-result-${msg.side}`;

      const meta = document.createElement('div');
      meta.className = 'search-result-meta';
      meta.textContent = `${msg.sender} · ${formatDateShort(msg.dateKey)} ${msg.timeStr}`;

      const text = document.createElement('div');
      text.className = 'search-result-text';
      // Highlight kata yang dicari
      const highlighted = escapeHtml(msg.text).replace(
        new RegExp(escapeRegex(escapeHtml(q)), 'gi'),
        match => `<mark>${match}</mark>`
      );
      text.innerHTML = highlighted.substring(0, 120) + (msg.text.length > 120 ? '…' : '');

      item.appendChild(meta);
      item.appendChild(text);

      item.addEventListener('click', () => {
        closeSearch();
        // Pastikan tanggal sudah di-render
        chatEngine.jumpToDate(msg.dateKey);
        setTimeout(() => {
          chatEngine.jumpToMessageId(msg.id);
          // Highlight sementara
          const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
          if (el) {
            el.classList.add('highlight');
            setTimeout(() => el.classList.remove('highlight'), 2000);
          }
        }, 200);
      });

      $searchResults.appendChild(item);
    });

    if (hits.length === 50) {
      const more = document.createElement('div');
      more.className = 'search-more';
      more.textContent = 'Menampilkan 50 hasil pertama. Perjelas pencarian.';
      $searchResults.appendChild(more);
    }
  }, 250);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
function setupEvents() {
  // Nav button
  $navBtn.addEventListener('click', () => {
    if (navVisible) closeNav();
    else openNav();
  });
  $navClose.addEventListener('click', closeNav);

  // Search button
  $searchBtn.addEventListener('click', () => {
    if (searchVisible) closeSearch();
    else openSearch();
  });
  $searchClose.addEventListener('click', closeSearch);
  $searchInput.addEventListener('input', e => handleSearch(e.target.value));
  $searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearch();
  });

  // Escape key global
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (navVisible) closeNav();
      if (searchVisible) closeSearch();
    }
  });

  // Resume bar
  $resumeYes.addEventListener('click', () => {
    $resumeBar.style.display = 'none';
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.dateKey) {
        // Pastikan sudah di dalam chat view
        if ($chat.style.display === 'none') {
          transitionToChat();
          setTimeout(() => chatEngine.jumpToDate(data.dateKey), 700);
        } else {
          chatEngine.jumpToDate(data.dateKey);
        }
      }
    }
  });

  $resumeNo.addEventListener('click', () => {
    $resumeBar.style.display = 'none';
    localStorage.removeItem(STORAGE_KEY);
  });

  // Klik di luar panel menutup panel
  document.addEventListener('click', e => {
    if (navVisible && !$navPanel.contains(e.target) && e.target !== $navBtn) {
      closeNav();
    }
    if (searchVisible && !$searchPanel.contains(e.target) && e.target !== $searchBtn) {
      closeSearch();
    }
  });
}

// ─────────────────────────────────────────────
// ERROR
// ─────────────────────────────────────────────
function showError(msg) {
  showLoading(false);
  const err = document.getElementById('error-screen');
  if (err) {
    err.textContent = 'Gagal memuat: ' + msg;
    err.style.display = 'flex';
  }
}

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
