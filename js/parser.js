/**
 * parser.js
 * WhatsApp export chat parser for Obrolan.
 *
 * Format yang di-handle:
 * DD/MM/YY HH.mm - Sender: Message
 * Multiline messages (continuation lines without timestamp)
 * <Media tidak disertakan>
 * null (voice note / unsupported)
 * <Pesan ini diedit>
 * System messages (no sender)
 */

const SENDER_A = 'Alvin';
const SENDER_B = 'Adelia Akuntansi';

// Regex untuk baris utama pesan: DD/MM/YY HH.mm - Sender: Text
const LINE_REGEX = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2})\.(\d{2}) - (.+)$/;
const SENDER_SPLIT = /^([^:]+): ([\s\S]*)$/;

/**
 * Parse raw WhatsApp export text menjadi array pesan.
 * @param {string} raw - Isi file chat.txt
 * @returns {{ messages: Message[], dates: string[], senderA: string, senderB: string }}
 */
function parseChat(raw) {
  const lines = raw.split('\n');
  const messages = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(LINE_REGEX);

    if (match) {
      // Simpan pesan sebelumnya
      if (current) {
        current.text = current.text.trim();
        messages.push(current);
      }

      const [, dd, mm, yy, hh, min, rest] = match;
      const year = parseInt(yy, 10) + 2000;
      const month = parseInt(mm, 10) - 1;
      const day = parseInt(dd, 10);
      const dateObj = new Date(year, month, day, parseInt(hh, 10), parseInt(min, 10));
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const senderMatch = rest.match(SENDER_SPLIT);

      if (senderMatch) {
        const sender = senderMatch[1].trim();
        const text = senderMatch[2];
        const side = normalizeSender(sender);

        current = {
          id: messages.length,
          timestamp: dateObj.getTime(),
          dateKey,
          timeStr: `${hh}.${min}`,
          sender,
          side, // 'left' | 'right'
          text,
          isMedia: text.includes('<Media tidak disertakan>'),
          isNull: text.trim() === 'null',
          isSystem: false,
          edited: false,
        };

        // Deteksi pesan diedit
        if (text.includes('<Pesan ini diedit>')) {
          current.edited = true;
          current.text = text.replace(' <Pesan ini diedit>', '').replace('<Pesan ini diedit>', '');
        }
      } else {
        // System message (e.g. enkripsi notice)
        current = {
          id: messages.length,
          timestamp: dateObj.getTime(),
          dateKey,
          timeStr: `${hh}.${min}`,
          sender: 'system',
          side: 'system',
          text: rest,
          isMedia: false,
          isNull: false,
          isSystem: true,
          edited: false,
        };
      }
    } else if (current && line !== '') {
      // Continuation line dari pesan multiline
      current.text += '\n' + line;
      // Re-check edited flag pada continuation
      if (current.text.includes('<Pesan ini diedit>')) {
        current.edited = true;
        current.text = current.text.replace(' <Pesan ini diedit>', '').replace('<Pesan ini diedit>', '');
      }
    }
  }

  // Jangan lupa pesan terakhir
  if (current) {
    current.text = current.text.trim();
    messages.push(current);
  }

  // Filter system messages
  const filtered = messages.filter(m => !m.isSystem);

  // Kumpulkan tanggal unik, diurutkan
  const dateSet = new Set();
  filtered.forEach(m => dateSet.add(m.dateKey));
  const dates = Array.from(dateSet).sort();

  return {
    messages: filtered,
    dates,
    senderA: SENDER_A,
    senderB: SENDER_B,
  };
}

/**
 * Normalisasi sender menjadi 'left' atau 'right'.
 * Sender A (Alvin) = right (pemilik archive).
 * Sender B (Adelia) = left.
 */
function normalizeSender(sender) {
  if (sender === SENDER_A) return 'right';
  if (sender === SENDER_B) return 'left';
  return 'right'; // fallback
}

/**
 * Format dateKey (YYYY-MM-DD) menjadi label yang manusiawi.
 * @param {string} dateKey
 * @returns {string} e.g. "27 Juli 2024"
 */
function formatDateLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${d} ${monthNames[m - 1]} ${y}`;
}

/**
 * Format dateKey untuk navigasi (short).
 * @param {string} dateKey
 * @returns {string} e.g. "27 Jul 2024"
 */
function formatDateShort(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const monthShort = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];
  return `${d} ${monthShort[m - 1]} ${y}`;
}

export { parseChat, formatDateLabel, formatDateShort, SENDER_A, SENDER_B };
