// Free "understanding" of guest messages: no AI service, no per-message cost.
// It turns a message into a small set of known words (with synonyms, typos,
// Hinglish and Hindi), then either matches one of the hotel's Answers or
// recognises a service request ("please send 2 towels", "AC kharab hai").
//
// To teach it new words: add them to SYNONYMS below, or (per hotel, no code)
// add them to an Answer's "Extra words" field in the front desk.

// Multi-word phrases are joined into one word before anything else.
const PHRASES = {
  'wi fi': 'wifi', 'wi-fi': 'wifi', 'वाई फाई': 'wifi',
  'check out': 'checkout', 'check in': 'checkin', 'late check out': 'checkout',
  'hot water': 'hotwater', 'garam pani': 'hotwater', 'garam paani': 'hotwater', 'गरम पानी': 'hotwater',
  'air conditioner': 'ac', 'a c': 'ac',
  'toilet paper': 'toiletpaper', 'tissue paper': 'toiletpaper',
  'bed sheet': 'bedsheet', 'bed sheets': 'bedsheet', 'extra bed': 'extrabed',
  'water bottle': 'water', 'drinking water': 'water',
  'not working': 'problem', 'doesnt work': 'problem', 'does not work': 'problem', 'dont work': 'problem',
  'is not working': 'problem', 'stopped working': 'problem', 'not on': 'problem',
  'kaam nahi': 'problem', 'kam nahi': 'problem', 'nahi chal': 'problem', 'nahi chalta': 'problem',
  'काम नहीं': 'problem', 'नहीं चल': 'problem',
  'good morning': 'hello', 'good evening': 'hello', 'good afternoon': 'hello',
  'thank you': 'thanks', 'room service': 'food', 'places to visit': 'sightseeing',
  'raat ka khana': 'dinner', 'tourist places': 'sightseeing',
};

// word -> canonical word
const SYNONYMS = {
  wifi: ['wifi', 'wify', 'internet', 'net', 'wlan', 'वाईफाई', 'इंटरनेट'],
  password: ['password', 'passwd', 'pass', 'passcode', 'pwd', 'पासवर्ड'],
  breakfast: ['breakfast', 'nashta', 'nashtaa', 'naashta', 'नाश्ता'],
  lunch: ['lunch', 'लंच'],
  dinner: ['dinner', 'डिनर'],
  food: ['food', 'khana', 'khaana', 'खाना', 'meal', 'meals', 'eat', 'hungry', 'bhookh', 'bhook', 'भूख'],
  menu: ['menu', 'मेनू'],
  checkout: ['checkout', 'departure', 'चेकआउट'],
  checkin: ['checkin', 'arrival', 'चेकइन'],
  time: ['time', 'timing', 'timings', 'hours', 'samay', 'समय', 'टाइम'],
  pharmacy: ['pharmacy', 'chemist', 'medical', 'medicine', 'medicines', 'dawai', 'dawa', 'दवा', 'दवाई', 'drugstore'],
  hospital: ['hospital', 'doctor', 'clinic', 'अस्पताल', 'डॉक्टर'],
  atm: ['atm', 'cash', 'bank'],
  taxi: ['taxi', 'cab', 'uber', 'ola', 'auto', 'rickshaw', 'टैक्सी'],
  parking: ['parking', 'पार्किंग'],
  pool: ['pool', 'swimming'],
  gym: ['gym', 'fitness'],
  spa: ['spa', 'massage'],
  laundry: ['laundry', 'dhobi', 'ironing', 'press'],
  nearby: ['nearby', 'near', 'around', 'paas', 'पास', 'nearest', 'closest'],
  sightseeing: ['sightseeing', 'visit', 'ghumne', 'ghoomne', 'घूमने', 'tourist', 'attractions'],
  restaurant: ['restaurant', 'cafe', 'dining'],
  towel: ['towel', 'tauliya', 'toliya', 'tolia', 'तौलिया'],
  pillow: ['pillow', 'takiya', 'तकिया'],
  blanket: ['blanket', 'kambal', 'कंबल', 'quilt', 'razai', 'रजाई', 'duvet'],
  water: ['water', 'pani', 'paani', 'पानी', 'bottle'],
  soap: ['soap', 'sabun', 'साबुन', 'shampoo', 'toiletries', 'toothbrush', 'toothpaste', 'comb', 'razor', 'dental'],
  slippers: ['slippers', 'slipper', 'chappal'],
  hanger: ['hanger', 'hangers'],
  kettle: ['kettle'],
  iron: ['iron'],
  charger: ['charger'],
  clean: ['clean', 'cleaning', 'cleaned', 'safai', 'saaf', 'सफाई', 'साफ', 'housekeeping', 'tidy', 'sweep', 'mop',
    'jhadu', 'झाड़ू', 'dirty', 'ganda', 'गंदा', 'smell', 'smells', 'garbage', 'trash', 'dustbin', 'kachra', 'कचरा'],
  ac: ['ac', 'aircon', 'एसी', 'cooling'],
  fan: ['fan', 'pankha', 'पंखा'],
  light: ['light', 'lights', 'bulb', 'batti', 'बत्ती', 'लाइट'],
  tv: ['tv', 'television', 'टीवी', 'remote'],
  geyser: ['geyser', 'heater', 'गीजर', 'hotwater'],
  toilet: ['toilet', 'flush', 'commode', 'washroom', 'bathroom'],
  tap: ['tap', 'shower', 'nal', 'नल'],
  door: ['door', 'lock', 'key', 'darwaza', 'दरवाजा'],
  power: ['power', 'electricity', 'bijli', 'बिजली', 'socket', 'switch'],
  problem: ['problem', 'broken', 'kharab', 'खराब', 'leak', 'leaking', 'damaged', 'faulty', 'issue',
    'dikkat', 'दिक्कत', 'समस्या', 'stuck', 'noisy'],
  want: ['send', 'bring', 'need', 'want', 'give', 'get', 'provide', 'chahiye', 'chaiye', 'चाहिए',
    'bhejo', 'bhej', 'bhejiye', 'भेजो', 'भेजिए', 'lao', 'laao', 'लाओ', 'dijiye', 'दीजिए', 'require'],
  extra: ['extra', 'more', 'another', 'additional', 'aur', 'और'],
  fix: ['fix', 'repair', 'theek', 'thik', 'ठीक', 'sudhar'],
  hello: ['hello', 'hi', 'hii', 'hey', 'helo', 'namaste', 'namaskar', 'नमस्ते', 'नमस्कार'],
  thanks: ['thanks', 'thank', 'thankyou', 'thx', 'dhanyavad', 'dhanyawad', 'धन्यवाद', 'shukriya', 'शुक्रिया'],
};

const STOPWORDS = new Set(`a an the is are am was were be been to of in on at for from and or my me i we us you your
  it its this that these those please pls plz can could would will shall do does did have has had there here what
  when where how which who with about any some much many so just also ok okay sir madam maam mam ji bhai yes no
  kya hai hain ho tha thi ka ki ke ko me mein se par bhi ya mujhe hume humein hamein mera meri mere hamara hamare
  aap aapka aapki kripya jaldi abhi room kamra kamre hotel
  kab kahan kaha kaise kitna kitne kaun milega milegi milta milti milenge hoga hogi hota hoti hote karna karo kar
  karen kariye raha rahi rahe aa aaya ja jaye sakta sakti sakte batao bataye bataiye bata tell know find
  any anything something kuch koi
  कब कहाँ कहां कैसे कितना कौन मिलेगा मिलेगी होगा होगी करो कर रहा रही बताओ बताइए कुछ कोई
  है हैं का की के को में से पर भी या मुझे हमें मेरा मेरी मेरे क्या आप जी कृपया कमरा कमरे`.split(/\s+/));

// Words that mean the guest is asking for information (not asking for something).
const INFO_WORDS = new Set(['what', 'when', 'where', 'how', 'which', 'who', 'kya', 'kab', 'kahan', 'kaha',
  'kaise', 'kitna', 'kitne', 'kaun', 'क्या', 'कब', 'कहाँ', 'कहां', 'कैसे', 'कितना', 'कौन', 'is', 'are', 'does']);

const CANONICAL = new Map();
for (const [canon, words] of Object.entries(SYNONYMS)) for (const w of words) CANONICAL.set(w, canon);
const PHRASE_LIST = Object.entries(PHRASES).sort((a, b) => b[0].length - a[0].length);

export function normalize(text) {
  let s = ` ${String(text).normalize('NFKC').toLowerCase().replace(/['’`]/g, '').replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim()} `;
  for (const [phrase, word] of PHRASE_LIST) s = s.split(` ${phrase} `).join(` ${word} `);
  return s.trim();
}

function canonical(word) {
  if (CANONICAL.has(word)) return CANONICAL.get(word);
  // simple English plurals: towels -> towel, timings -> timing
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    const single = word.slice(0, -1);
    return CANONICAL.get(single) ?? single;
  }
  return word;
}

// "Please send 2 towels!" -> ['want', '2', 'towel']
export function tokenize(text) {
  const out = [];
  for (const word of normalize(text).split(' ')) {
    if (!word || STOPWORDS.has(word)) continue;
    out.push(canonical(word));
  }
  return out;
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Typos: "pasword" ~ "password", "brekfast" ~ "breakfast"
function similar(a, b) {
  if (a.length < 5 || b.length < 5 || a[0] !== b[0]) return false;
  return editDistance(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1);
}

// Fixes typos against the known vocabulary: "tawel" stays, "towell" -> towel
function correct(token, vocabulary) {
  if (vocabulary.has(token) || /^\d+$/.test(token)) return token;
  for (const known of vocabulary) if (similar(token, known)) return known;
  return token;
}

const KNOWN_WORDS = new Set([...CANONICAL.values()]);
for (const w of CANONICAL.keys()) if (!/\s/.test(w)) KNOWN_WORDS.add(w);

// ---------------- Answers (FAQ) matching ----------------

const termsOf = (text, weight, into) => {
  for (const t of tokenize(text)) if (!/^\d+$/.test(t)) into.set(t, Math.max(into.get(t) ?? 0, weight));
};

// Built once per hotel and cached (see autopilot.js).
export function buildFaqIndex(faqs) {
  const docs = faqs.map((faq) => {
    const main = new Map();
    termsOf(faq.question, 1, main);
    termsOf(faq.keywords ?? '', 1, main);
    const all = new Map(main);
    termsOf(faq.category, 0.6, all);
    const answerTerms = new Map();
    termsOf(faq.answer, 0.3, answerTerms);
    for (const [t, w] of answerTerms) if (!all.has(t)) all.set(t, w);
    return { faq, main, all };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.all.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const vocabulary = new Set([...df.keys(), ...KNOWN_WORDS]);
  return { docs, df, n: docs.length, vocabulary };
}

export function matchFaq(index, tokens) {
  const query = [...new Set(tokens.filter((t) => !/^\d+$/.test(t) && !['want', 'extra', 'hello', 'thanks'].includes(t)))];
  if (!query.length || !index.n) return null;
  const idf = (t) => Math.log(1 + index.n / (1 + (index.df.get(t) ?? 0)));

  const scored = index.docs.map((d) => {
    let got = 0;
    let total = 0;
    let mainHit = 0;
    for (const q of query) {
      const w = idf(q);
      total += w;
      const weight = d.all.get(q);
      if (weight) {
        got += w * weight;
        if (d.main.has(q)) mainHit += 1;
      }
    }
    const queryCoverage = total ? got / total : 0;
    const answerCoverage = d.main.size ? mainHit / d.main.size : 0;
    return { faq: d.faq, score: 0.65 * queryCoverage + 0.35 * answerCoverage };
  }).sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  if (!best || best.score < 0.5) return null;
  if (second && best.score - second.score < 0.08) return null; // too close to call
  return best;
}

// ---------------- Request recognition ----------------

const AMENITY_WORDS = new Set(['towel', 'pillow', 'blanket', 'water', 'soap', 'slippers', 'hanger', 'kettle',
  'iron', 'charger', 'toiletpaper', 'bedsheet', 'extrabed']);
const FIXABLE_WORDS = new Set(['ac', 'fan', 'light', 'tv', 'geyser', 'hotwater', 'toilet', 'tap', 'door', 'power', 'wifi']);
const FOOD_WORDS = new Set(['food', 'menu', 'breakfast', 'lunch', 'dinner']);

function recogniseRequest(tokens, asksInfo) {
  const has = (w) => tokens.includes(w);
  const any = (set) => tokens.some((t) => set.has(t));
  const wantsSomething = has('want') || has('extra') || tokens.some((t) => /^\d+$/.test(t));

  if (has('problem') && (any(FIXABLE_WORDS) || !asksInfo)) return { type: 'maintenance', strong: any(FIXABLE_WORDS) };
  if (has('fix') && any(FIXABLE_WORDS)) return { type: 'maintenance', strong: true };
  if (has('clean') && (wantsSomething || !asksInfo)) return { type: 'housekeeping', strong: wantsSomething };
  if (any(AMENITY_WORDS) && (wantsSomething || !asksInfo)) return { type: 'amenities', strong: wantsSomething };
  if (any(FOOD_WORDS) && wantsSomething) return { type: 'food', strong: true };
  if (has('food') && !asksInfo) return { type: 'food', strong: false };
  return null;
}

/**
 * Decides what to do with a guest message:
 *   { kind: 'greeting' } | { kind: 'thanks' }
 *   { kind: 'answer', faq, score }
 *   { kind: 'request', type }
 *   { kind: 'unknown' }
 */
export function decide(text, index) {
  const words = normalize(text).split(' ').filter(Boolean);
  const asksInfo = text.includes('?') ? !['can', 'could', 'will', 'would', 'please'].includes(words[0])
    : INFO_WORDS.has(words[0]);
  const tokens = tokenize(text).map((t) => correct(t, index.vocabulary));
  const meaningful = tokens.filter((t) => t !== 'hello' && t !== 'thanks');

  if (!meaningful.length) {
    if (tokens.includes('thanks')) return { kind: 'thanks' };
    if (tokens.includes('hello')) return { kind: 'greeting' };
    return { kind: 'unknown' };
  }

  const request = recogniseRequest(meaningful, asksInfo);
  if (request && (request.strong || !asksInfo)) return { kind: 'request', type: request.type };

  const answer = matchFaq(index, meaningful);
  if (answer) return { kind: 'answer', faq: answer.faq, score: answer.score };

  if (request) return { kind: 'request', type: request.type };
  return { kind: 'unknown' };
}
