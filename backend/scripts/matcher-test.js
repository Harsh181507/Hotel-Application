// Checks the free message matcher against real-style guest messages.
// No server or database needed:  npm run test:matcher
import assert from 'node:assert/strict';
import { buildFaqIndex, decide } from '../src/lib/matcher.js';

const faqs = [
  { id: 1, category: 'Wi-Fi', question: 'What is the Wi-Fi password?', answer: 'Network: Anemos-Guest\nPassword: welcome2026', keywords: '' },
  { id: 2, category: 'Dining', question: 'What are the breakfast timings?', answer: 'Breakfast is served 7:00 to 10:30 AM in the ground-floor restaurant.', keywords: '' },
  { id: 3, category: 'Stay', question: 'What is the check-out time?', answer: 'Check-out is at 11:00 AM. Ask the front desk for a late check-out.', keywords: '' },
  { id: 4, category: 'Nearby', question: 'Is there a pharmacy nearby?', answer: 'Apollo Pharmacy, 300 m left of the main gate, open 24 hours.', keywords: '' },
  { id: 5, category: 'Nearby', question: 'Places to visit nearby?', answer: 'Rock Garden (2 km), Tagore Hill (3 km), Hundru Falls (40 km).', keywords: '' },
];
const index = buildFaqIndex(faqs);

// [message, expected kind, expected FAQ id or request type]
const cases = [
  // Answers
  ['What is the wifi password?', 'answer', 1],
  ['wifi password', 'answer', 1],
  ['wi-fi pasword pls', 'answer', 1],
  ['internet ka password kya hai', 'answer', 1],
  ['वाईफाई का पासवर्ड क्या है', 'answer', 1],
  ['breakfast timing?', 'answer', 2],
  ['nashta kab milega', 'answer', 2],
  ['What time is checkout', 'answer', 3],
  ['check out time kya hai', 'answer', 3],
  ['is there any medical shop nearby', 'answer', 4],
  ['dawai kahan milegi', 'answer', 4],
  ['places to visit near the hotel', 'answer', 5],
  // Requests
  ['Please send 2 towels', 'request', 'amenities'],
  ['need extra pillow', 'request', 'amenities'],
  ['ek aur tauliya chahiye', 'request', 'amenities'],
  ['can you bring drinking water?', 'request', 'amenities'],
  ['AC not working', 'request', 'maintenance'],
  ['ac kharab hai', 'request', 'maintenance'],
  ['hot water nahi aa raha, geyser kaam nahi kar raha', 'request', 'maintenance'],
  ['the tv remote is broken', 'request', 'maintenance'],
  ['wifi not working', 'request', 'maintenance'],
  ['please clean my room', 'request', 'housekeeping'],
  ['room ki safai kar do', 'request', 'housekeeping'],
  ['bathroom is dirty', 'request', 'housekeeping'],
  ['send food to my room', 'request', 'food'],
  // Small talk
  ['hello', 'greeting'],
  ['Namaste', 'greeting'],
  ['thank you so much', 'thanks'],
  // Things it should NOT guess (a person answers these)
  ['can I get a discount on my bill', 'unknown'],
  ['my flight is delayed, can I stay longer', 'unknown'],
  ['is breakfast free?', 'unknown'],
];

let failed = 0;
for (const [message, kind, expected] of cases) {
  const result = decide(message, index);
  const got = result.kind === 'answer' ? result.faq.id : result.type;
  const ok = result.kind === kind && (expected === undefined || got === expected);
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok ' : ' FAIL'}  "${message}" -> ${result.kind}${got !== undefined ? ` (${got})` : ''}${ok ? '' : `   expected ${kind}${expected !== undefined ? ` (${expected})` : ''}`}`);
}

console.log(`\n${cases.length - failed}/${cases.length} correct`);
assert.equal(failed, 0, 'matcher test failed');
console.log('Matcher test passed.');
