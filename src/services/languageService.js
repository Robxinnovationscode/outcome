/**
 * languageService.js
 * Zero-configuration automatic language detection and localized response generator.
 * Supports:
 * - Tamil (Pure Tamil script + Tanglish phonetic transliteration)
 * - Hindi (Devanagari script + Hinglish phonetic transliteration)
 * - English (Standard Indian & Global English)
 */

const TAMIL_KEYWORDS = [
  'kaasu', 'panam', 'rooba', 'roobai', 'selavu', 'selavachu', 'kuduthen', 'kuduthinga',
  'vanginen', 'vangiten', 'vaanginen', 'kattinen', 'katnen', 'vanthathu', 'vanthuchu',
  'varavu', 'sambalam', 'kidaithathu', 'kedaichathu', 'netru', 'nethu', 'naalai', 'naalaiki',
  'kaaikari', 'maligai', 'kadai', 'kadaiyil', 'thayir', 'arisi', 'paruppu', 'pal', 'paal',
  'saapadu', 'tiffin', 'padam', 'vandi', 'vaadagai', 'marunthu', 'thangam', 'pangu',
  'mudalieedu', 'cheetu', 'seetu', 'thuni', 'latcham', 'aayiram', 'ayiram', 'kodi',
  'nooru', 'pathu', 'aaru', 'yezhu', 'yettu', 'onpathu', 'anchu', 'naalu', 'moonu',
  'rendu', 'onnu', 'evvalavu', 'evlo', 'ennaku', 'enakku', 'pannen', 'panniten',
  'kuduthuten', 'kodu', 'hatao', 'eduthuvidu', 'azhithuvidu', 'maathu', 'maathividu',
  'seri', 'illai', 'irukku', 'iruku', 'romba', 'mothatham', 'motham'
];

const HINDI_KEYWORDS = [
  'kharcha', 'kharch', 'diya', 'bhar diya', 'kharida', 'de diya', 'lag gaya', 'bhara',
  'aaya', 'aayi', 'mila', 'mili', 'kamaya', 'tankhwah', 'vetan', 'paisa', 'paise',
  'rupaye', 'rupay', 'nivesh', 'jama kiya', 'sona kharida', 'hazar', 'sau', 'lakh',
  'sabzi', 'doodh', 'ration', 'bijli', 'kiraya', 'dawa', 'shagun', 'vyapar', 'kal',
  'aaj', 'parso', 'kitna', 'kitne', 'kya', 'hai', 'tha', 'thi', 'hua', 'karo',
  'hatao', 'hata do', 'badlo', 'badal do', 'batao', 'dikhao', 'kul', 'jama'
];

/**
 * Automatically detect language from natural language text
 * @param {string} text 
 * @returns {'ta-IN' | 'hi-IN' | 'en-IN'}
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'en-IN';
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. Script checks (Unicode ranges)
  if (/[\u0B80-\u0BFF]/.test(raw)) return 'ta-IN'; // Tamil script
  if (/[\u0900-\u097F]/.test(raw)) return 'hi-IN'; // Devanagari / Hindi script

  // 2. Keyword & Phonetic Token analysis
  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  let tamilScore = 0;
  let hindiScore = 0;

  for (const word of words) {
    if (TAMIL_KEYWORDS.includes(word)) tamilScore += 2;
    if (HINDI_KEYWORDS.includes(word)) hindiScore += 2;
  }

  // Substring checks for compound words (e.g. "selavachu", "katnen")
  TAMIL_KEYWORDS.forEach(kw => {
    if (lower.includes(kw)) tamilScore += 1;
  });
  HINDI_KEYWORDS.forEach(kw => {
    if (lower.includes(kw)) hindiScore += 1;
  });

  if (tamilScore > hindiScore && tamilScore >= 2) return 'ta-IN';
  if (hindiScore > tamilScore && hindiScore >= 2) return 'hi-IN';

  return 'en-IN';
}

/**
 * Generate natural, localized spoken response mirroring the user's detected language
 */
export function generateLocalizedSpokenResponse({
  action,
  parsedData = {},
  lang = 'en-IN',
  totalExp = 0,
  totalInc = 0,
  totalInv = 0,
  allCount = 0,
  customMsg = null
}) {
  const cat = parsedData.category || 'General';
  const amt = parsedData.amount || 0;
  const amtFormatted = Number(amt).toLocaleString('en-IN');
  const type = (parsedData.transaction_type || 'expense').toLowerCase();

  // ── TAMIL RESPONSES ──
  if (lang === 'ta-IN') {
    if (action === 'create') {
      if (type === 'income') {
        return `சரி! ₹${amtFormatted} ${cat} வருமானம் பதிவு செய்யப்பட்டது.`;
      }
      if (type === 'investment') {
        return `சரி! ₹${amtFormatted} ${cat} முதலீடு பதிவு செய்யப்பட்டது.`;
      }
      return `சரி! ${cat}-க்கு ₹${amtFormatted} செலவு பதிவு செய்யப்பட்டது.`;
    }
    if (action === 'delete') {
      return `கடைசியாக பதிவு செய்த ${cat} பரிவர்த்தனை நீக்கப்பட்டது.`;
    }
    if (action === 'update') {
      return `${cat} பரிவர்த்தனை ₹${amtFormatted} என மாற்றப்பட்டது.`;
    }
    if (action === 'query') {
      if (totalExp > 0 || totalInc > 0) {
        return `உங்களிடம் மொத்தம் ${allCount} பரிவர்த்தனைகள் உள்ளன. மொத்த செலவு ₹${totalExp.toLocaleString('en-IN')}, வருமானம் ₹${totalInc.toLocaleString('en-IN')}.`;
      }
      return `பரிவர்த்தனைகள் எதுவும் இன்னும் பதிவு செய்யப்படவில்லை.`;
    }
    if (action === 'clarification') {
      return generateLocalizedFollowUp(parsedData, 'ta-IN');
    }
  }

  // ── HINDI RESPONSES ──
  if (lang === 'hi-IN') {
    if (action === 'create') {
      if (type === 'income') {
        return `बढ़िया! ₹${amtFormatted} की ${cat} आमदनी दर्ज कर ली गई है।`;
      }
      if (type === 'investment') {
        return `बढ़िया! ₹${amtFormatted} का ${cat} निवेश दर्ज कर लिया गया है।`;
      }
      return `समझ गया! ${cat} के लिए ₹${amtFormatted} का खर्च दर्ज कर लिया गया है।`;
    }
    if (action === 'delete') {
      return `आपका हालिया ${cat} लेनदेन हटा दिया गया है।`;
    }
    if (action === 'update') {
      return `${cat} का लेनदेन ₹${amtFormatted} में अपडेट कर दिया गया है।`;
    }
    if (action === 'query') {
      if (totalExp > 0 || totalInc > 0) {
        return `आपके कुल ${allCount} लेनदेन हैं। कुल खर्च ₹${totalExp.toLocaleString('en-IN')} और आमदनी ₹${totalInc.toLocaleString('en-IN')} है।`;
      }
      return `अभी तक कोई लेनदेन दर्ज नहीं किया गया है।`;
    }
    if (action === 'clarification') {
      return generateLocalizedFollowUp(parsedData, 'hi-IN');
    }
  }

  // ── ENGLISH RESPONSES (DEFAULT) ──
  if (action === 'create') {
    return `Got it! Recorded ${type.toUpperCase()} of ₹${amtFormatted} for ${cat}.`;
  }
  if (action === 'delete') {
    return `Deleted your most recent ${cat !== 'Other' ? cat : type} transaction.`;
  }
  if (action === 'update') {
    return `Updated your ${cat} transaction to ₹${amtFormatted}.`;
  }
  if (action === 'query') {
    if (totalExp > 0 || totalInc > 0) {
      return `You have ${allCount} total records. Total expenses are ₹${totalExp.toLocaleString('en-IN')} and income is ₹${totalInc.toLocaleString('en-IN')}.`;
    }
    return `No transactions found in your records yet.`;
  }
  if (action === 'clarification') {
    return generateLocalizedFollowUp(parsedData, 'en-IN');
  }

  return customMsg || `Understood!`;
}

/**
 * Generate localized follow-up question when fields are missing
 */
export function generateLocalizedFollowUp(data = {}, lang = 'en-IN') {
  const missing = data.missing_fields || [];
  const cat = (data.category && data.category !== 'Other' && data.category !== 'General') ? data.category : null;
  const amt = data.amount || 0;

  // Tamil
  if (lang === 'ta-IN') {
    if (missing.includes('amount') && missing.includes('category')) {
      return `எவ்வளவு செலவானது, மற்றும் எதற்காக?`;
    }
    if (missing.includes('amount')) {
      return cat ? `${cat}-க்கு எவ்வளவு ரூபாய் செலவானது?` : `எவ்வளவு ரூபாய் செலவு செய்தீர்கள்?`;
    }
    if (missing.includes('category')) {
      return `₹${amt} பதிவு செய்ய என்ன வகை (Category) குறிப்பிடவும்?`;
    }
    return `தயவுசெய்து பரிவர்த்தனை விவரங்களை கூறவும்.`;
  }

  // Hindi
  if (lang === 'hi-IN') {
    if (missing.includes('amount') && missing.includes('category')) {
      return `कितने रुपये खर्च हुए और किस काम के लिए?`;
    }
    if (missing.includes('amount')) {
      return cat ? `${cat} के लिए कितने रुपये खर्च किए?` : `कितने रुपये का खर्च हुआ?`;
    }
    if (missing.includes('category')) {
      return `₹${amt} किस श्रेणी (Category) में जोड़ना है?`;
    }
    return `कृपया इस लेनदेन का विवरण बताएं।`;
  }

  // English
  if (missing.includes('amount') && missing.includes('category')) {
    return `Sure! How much did you spend, and what was it for?`;
  }
  if (missing.includes('amount')) {
    return cat ? `How much was spent for ${cat}?` : `How much was spent?`;
  }
  if (missing.includes('category')) {
    return `Got ₹${amt}. What category should I log this under?`;
  }
  return `Could you please clarify the details of this transaction?`;
}
