// Night-desk autopilot: replies to guests by itself using the hotel's Answers,
// turns requests into tasks for the right department, and stays quiet while a
// person from the front desk is chatting with that guest. Free: no AI service.
import { query } from '../db/pool.js';
import { broadcastMessage, saveMessage } from './chat.js';
import { buildFaqIndex, decide } from './matcher.js';
import { createRequest } from './requests.js';
import { DEPARTMENT_FOR_TYPE, DEPARTMENT_LABELS } from './departments.js';

const QUIET_WHILE_STAFF_ACTIVE_MINUTES = 15;
const ACK_EVERY_MINUTES = 30;

// Answers change rarely: cache each hotel's search index for 30 seconds
// (and drop it immediately when the hotel edits its Answers).
const faqCache = new Map();
export const invalidateFaqCache = (hotelId) => faqCache.delete(hotelId);

async function faqIndex(hotelId) {
  const cached = faqCache.get(hotelId);
  if (cached && Date.now() - cached.at < 30_000) return cached.index;
  const { rows } = await query('SELECT id, category, question, answer, keywords FROM faqs WHERE hotel_id = $1', [hotelId]);
  const index = buildFaqIndex(rows);
  faqCache.set(hotelId, { at: Date.now(), index });
  return index;
}

function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function autopilotActive(hotel, now = new Date()) {
  if (hotel.autopilot_mode === 'off') return false;
  if (hotel.autopilot_mode === 'always') return true;
  let hhmm;
  try {
    hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: hotel.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  } catch {
    hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  }
  const t = minutesOf(hhmm);
  const start = minutesOf(hotel.night_start);
  const end = minutesOf(hotel.night_end);
  return start <= end ? t >= start && t < end : t >= start || t < end; // e.g. 22:00-07:00 wraps midnight
}

const TEXT = {
  en: {
    greeting: (hotel) => `Hello! I'm the ${hotel} assistant. Ask me things like the Wi-Fi password or breakfast time, or tell me what you need: towels, room cleaning, a repair. You can also order food in the Order tab.`,
    thanks: () => "You're welcome! Message me any time.",
    request: (dept) => `Got it! I've sent your request to ${dept}. You'll get updates right here.`,
    food: () => 'You can order food any time in the Order tab at the bottom of the screen. It goes straight to the kitchen.',
    ack: () => "Thanks for your message! I've passed it to our front desk team. They'll reply here shortly.",
  },
  hi: {
    greeting: (hotel) => `नमस्ते! मैं ${hotel} का सहायक हूँ। वाई-फाई पासवर्ड या नाश्ते का समय पूछें, या बताइए क्या चाहिए: तौलिया, कमरे की सफाई, कोई मरम्मत। खाना Order टैब से मंगवा सकते हैं।`,
    thanks: () => 'आपका स्वागत है! कभी भी संदेश भेजें।',
    request: (dept) => `ठीक है! आपका अनुरोध ${dept} को भेज दिया गया है। अपडेट यहीं मिलेंगे।`,
    food: () => 'खाना नीचे दिए Order टैब से कभी भी मंगवाइए। ऑर्डर सीधे किचन जाता है।',
    ack: () => 'आपके संदेश के लिए धन्यवाद! हमारी टीम जल्द ही यहीं जवाब देगी।',
  },
};

const HINDI_DEPT = { 'the front desk': 'फ्रंट डेस्क', housekeeping: 'हाउसकीपिंग', 'the kitchen': 'किचन', maintenance: 'मेंटेनेंस' };

async function reply(hotelId, stayId, body) {
  const message = await saveMessage({ stayId, sender: 'bot', body });
  broadcastMessage(hotelId, message);
  return message;
}

// onlyBodies: limit the check to these exact messages (e.g. the "passed to our team" note).
async function botSpokeRecently(stayId, minutes, onlyBodies = null) {
  const { rows: [row] } = await query(
    `SELECT 1 FROM messages WHERE stay_id = $1 AND sender = 'bot' AND created_at > now() - make_interval(mins => $2)
        AND ($3::text[] IS NULL OR body = ANY($3)) LIMIT 1`,
    [stayId, minutes, onlyBodies],
  );
  return Boolean(row);
}

/**
 * Called after a guest sends a chat message. Never throws (a failure here
 * must not affect the guest's message, which is already saved).
 * Returns what it did, for tests and logs.
 */
export async function handleGuestMessage({ hotelId, stayId, roomNumber, message }) {
  try {
    const { rows: [hotel] } = await query(
      'SELECT name, autopilot_mode, night_start, night_end, timezone FROM hotels WHERE id = $1', [hotelId],
    );
    if (!hotel || !autopilotActive(hotel)) return { action: 'off' };

    // A person is chatting with this guest right now: let them handle it.
    const { rows: [staffActive] } = await query(
      `SELECT 1 FROM messages WHERE stay_id = $1 AND sender = 'staff'
         AND created_at > now() - make_interval(mins => $2) LIMIT 1`,
      [stayId, QUIET_WHILE_STAFF_ACTIVE_MINUTES],
    );
    if (staffActive) return { action: 'staff-active' };

    const lang = /[ऀ-ॿ]/.test(message.body) ? 'hi' : 'en';
    const t = TEXT[lang];
    const decision = decide(message.body, await faqIndex(hotelId));

    switch (decision.kind) {
      case 'greeting':
        await reply(hotelId, stayId, t.greeting(hotel.name));
        return { action: 'greeting' };
      case 'thanks':
        if (!(await botSpokeRecently(stayId, 30))) return { action: 'none' };
        await reply(hotelId, stayId, t.thanks());
        return { action: 'thanks' };
      case 'answer':
        await reply(hotelId, stayId, decision.faq.answer);
        return { action: 'answer', faqId: decision.faq.id };
      case 'request': {
        if (decision.type === 'food') {
          const { rows: [menu] } = await query('SELECT 1 FROM menu_items WHERE hotel_id = $1 AND available LIMIT 1', [hotelId]);
          if (menu) {
            await reply(hotelId, stayId, t.food());
            return { action: 'menu' };
          }
        }
        const request = await createRequest({
          hotelId, stayId, roomNumber, type: decision.type, details: message.body.slice(0, 1000), guestMessageId: message.id,
        });
        const dept = DEPARTMENT_LABELS[DEPARTMENT_FOR_TYPE[decision.type]];
        await reply(hotelId, stayId, t.request(lang === 'hi' ? HINDI_DEPT[dept] ?? dept : dept));
        return { action: 'request', requestId: request.id, type: decision.type };
      }
      default:
        // Say "passed to our team" at most once per half hour.
        if (await botSpokeRecently(stayId, ACK_EVERY_MINUTES, [TEXT.en.ack(), TEXT.hi.ack()])) return { action: 'none' };
        await reply(hotelId, stayId, t.ack());
        return { action: 'ack' };
    }
  } catch (err) {
    console.error('[autopilot]', err);
    return { action: 'error' };
  }
}
