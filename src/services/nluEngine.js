import { CATEGORY_TAXONOMY, CATEGORY_SYNONYMS, NUMBER_WORDS, DEFAULT_CONFIDENCE_THRESHOLD } from '../config/constants.js';

/**
 * Parse transcript text into structured transaction object conforming to Section 3.2 schema.
 *
 * @param {string} transcript - Natural language transcript string (English, Tamil, Tanglish, Hindi, Hinglish)
 * @param {Object} options - Configuration and session context
 * @param {Object} options.customTaxonomy - Optional custom category taxonomy overriding default
 * @param {Object} options.sessionContext - Context from multi-turn conversation
 * @returns {Promise<Object>} Structured JSON schema output
 */
export async function parseUtterance(transcript, options = {}) {
  const taxonomy = options.customTaxonomy || CATEGORY_TAXONOMY;
  const context = options.sessionContext || {};

  // Clean and normalize input
  const text = (transcript || '').trim();
  if (!text || text.length < 2) {
    return {
      transaction_type: 'expense',
      amount: 0,
      currency: 'INR',
      category: 'Other',
      date: getTodayFormatted(),
      notes: '',
      confidence: 0.1,
      missing_fields: ['amount', 'category']
    };
  }

  // 1. Check if LLM provider (OpenAI / Gemini) is available for deep multi-lingual NLU
  if (process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY) {
    try {
      const llmResult = await parseUtteranceWithLLM(text, taxonomy, context);
      if (llmResult && llmResult.transaction_type) {
        return llmResult;
      }
    } catch (err) {
      console.warn('⚠️ LLM NLU parse failed, falling back to rule-based NLU:', err.message);
    }
  }

  // 2. Multi-Lingual Rule-Based NLU Engine (English, Tamil, Tanglish, Hindi, Hinglish)
  return parseUtteranceRuleBased(text, taxonomy, context);
}

/**
 * Rule-Based Multi-Lingual NLU Parser (English, Tamil, Tanglish, Hindi, Hinglish)
 */
function parseUtteranceRuleBased(text, taxonomy, context = {}) {
  const lowerText = text.toLowerCase().trim();

  let transaction_type = context.transaction_type || null;
  let amount = context.amount || null;
  let category = context.category || null;
  let date = context.date || getTodayFormatted();
  let notes = text;
  let confidence = 0.95;
  const missing_fields = [];

  // A. Detect Transaction Type across Languages
  if (!transaction_type) {
    const expenseKeywords = [
      // English
      'spent', 'spend', 'paid', 'buying', 'bought', 'expense', 'purchased', 'cost', 'bill paid', 'gave',
      // Hindi / Hinglish
      'kharcha', 'diya', 'bhar diya', 'kharida', 'de diya', 'kharch', 'lag gaya', 'bhara',
      // Tamil / Tanglish
      'selavu', 'kuduthen', 'vaanginen', 'kattinen', 'selavachu', 'kaasu kuduthen', 'rooba kuduthen',
      'bill katnen', 'selavu pannen', 'kadaiyil', 'vangiten'
    ];
    const incomeKeywords = [
      // English
      'received', 'got', 'credited', 'earned', 'salary', 'income', 'stipend', 'deposit',
      // Hindi / Hinglish
      'aaya', 'mila', 'kamaya', 'payment received', 'credited to account', 'tankhwah', 'vetan',
      // Tamil / Tanglish
      'sambalam', 'vanthathu', 'varavu', 'kidaithathu', 'kaasu vanthathu', 'panam vanthathu',
      'credit aachu', 'sambalam vanthuchu', 'kaasu kedaichathu'
    ];
    const investmentKeywords = [
      // English
      'invested', 'investment', 'sip', 'mutual fund', 'stocks', 'stock', 'fixed deposit',
      'fd', 'rd', 'ppf', 'epf', 'nps', 'gold', 'crypto', 'shares',
      // Hindi / Hinglish
      'nivesh', 'jama kiya', 'sona kharida',
      // Tamil / Tanglish
      'mudalieedu', 'invest pannen', 'thangam vaanginen', 'seetu', 'cheetu potten', 'pangu vaanginen'
    ];

    let incomeScore = 0;
    let expenseScore = 0;
    let investmentScore = 0;

    expenseKeywords.forEach(k => { if (lowerText.includes(k)) expenseScore += 2; });
    incomeKeywords.forEach(k => { if (lowerText.includes(k)) incomeScore += 2; });
    investmentKeywords.forEach(k => { if (lowerText.includes(k)) investmentScore += 2; });

    // Check category synonyms for type hints
    for (const [type, catMap] of Object.entries(CATEGORY_SYNONYMS)) {
      for (const [catName, synonyms] of Object.entries(catMap)) {
        if (synonyms.some(s => lowerText.includes(s))) {
          if (type === 'expense') expenseScore += 1;
          if (type === 'income') incomeScore += 1;
          if (type === 'investment') investmentScore += 1;
        }
      }
    }

    if (investmentScore > expenseScore && investmentScore > incomeScore) {
      transaction_type = 'investment';
    } else if (incomeScore > expenseScore && incomeScore > investmentScore) {
      transaction_type = 'income';
    } else if (expenseScore > 0) {
      transaction_type = 'expense';
    } else {
      // If amount or financial sentence is present, assume expense as default
      if (lowerText.includes('add') || lowerText.includes('log') || extractAmount(lowerText)) {
        transaction_type = 'expense';
        confidence -= 0.1;
      }
    }
  }

  // B. Extract Amount
  if (!amount) {
    amount = extractAmount(lowerText);
  }

  // C. Extract Category (returns NULL if not mentioned in text)
  if (!category) {
    category = extractCategory(lowerText, transaction_type || 'expense', taxonomy);
  }

  // D. Extract Date (English / Hindi / Tamil)
  if (lowerText.includes('yesterday') || lowerText.includes('kal') || lowerText.includes('netru') || lowerText.includes('nethu')) {
    date = getOffsetDateFormatted(-1);
  } else if (lowerText.includes('day before yesterday') || lowerText.includes('munnadi')) {
    date = getOffsetDateFormatted(-2);
  } else if (lowerText.includes('tomorrow') || lowerText.includes('naalai') || lowerText.includes('naalaiki')) {
    date = getOffsetDateFormatted(1);
  } else {
    // Check YYYY-MM-DD pattern
    const dateMatch = lowerText.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/);
    if (dateMatch) {
      date = dateMatch[1].replace(/\//g, '-');
    }
  }

  // E. Identify Missing Fields & Ambiguity
  if (!transaction_type) {
    missing_fields.push('transaction_type');
    confidence -= 0.25;
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    missing_fields.push('amount');
    confidence -= 0.35;
    amount = null;
  }
  if (!category) {
    missing_fields.push('category');
    confidence -= 0.2;
    category = null; // Do NOT falsely set to Groceries!
  }

  confidence = Math.max(0.10, Math.min(0.99, parseFloat(confidence.toFixed(2))));

  return {
    transaction_type: transaction_type || 'expense',
    amount: amount !== null ? parseFloat(amount.toFixed(2)) : 0,
    currency: 'INR',
    category: category || 'Other',
    date: date,
    notes: notes,
    confidence: confidence,
    missing_fields: missing_fields
  };
}

/**
 * Extract numerical amount from Indian phrases (English, Hindi, Hinglish, Tamil, Tanglish)
 */
function extractAmount(text) {
  // 1. Direct Currency Match: ₹500, Rs. 500, 500 rupees, 500 rooba, 500 roobai, 500 inr, 500 rupay
  const currencyMatch = text.match(/(?:(?:rs\.?|inr|₹|rupees?|rooba|roobai|rupaye?|kaasu|panam)\s*)?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:rs\.?|inr|rupees?|rooba|roobai|rupaye?|bucks)?/i);

  // 2. Handle Thousands / k (5k, 10k, 2.5k, 20 hazar, 5 aayiram)
  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:k|thousand|hazar|aayiram|ayiram)\b/i);
  if (kMatch) {
    return parseFloat(kMatch[1]) * 1000;
  }

  // 3. Handle Lakhs (1.5 lakh, 2 lacs, 1 latcham)
  const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lacs?|lac|latcham)\b/i);
  if (lakhMatch) {
    return parseFloat(lakhMatch[1]) * 100000;
  }

  // 4. Handle Crores / Kodi (1 crore, 2 kodi)
  const croreMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:crore|cr|kodi)\b/i);
  if (croreMatch) {
    return parseFloat(croreMatch[1]) * 10000000;
  }

  if (currencyMatch && currencyMatch[1]) {
    const rawNum = currencyMatch[1].replace(/,/g, '');
    const val = parseFloat(rawNum);
    if (!isNaN(val) && val > 0) return val;
  }

  // 5. Named Number Words (Tamil, Hindi, English)
  const wordTokens = text.split(/\s+/);
  for (const token of wordTokens) {
    const cleaned = token.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (NUMBER_WORDS[cleaned] !== undefined && NUMBER_WORDS[cleaned] > 0) {
      return NUMBER_WORDS[cleaned];
    }
  }

  // 6. Generic Number Fallback
  const numMatch = text.match(/\b(\d+)\b/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  return null;
}

/**
 * Extract Category based on Taxonomies and Synonyms across Languages
 * Returns NULL if no category is mentioned in text (prevents false Groceries default)
 */
function extractCategory(text, type, taxonomy) {
  const availableCategories = taxonomy[type] || CATEGORY_TAXONOMY[type] || [];
  const typeSynonyms = CATEGORY_SYNONYMS[type] || {};

  // Check exact category name match first
  for (const cat of availableCategories) {
    if (text.includes(cat.toLowerCase())) {
      return cat;
    }
  }

  // Check synonym match for this transaction type
  for (const [catName, synonyms] of Object.entries(typeSynonyms)) {
    if (availableCategories.includes(catName)) {
      if (synonyms.some(syn => text.includes(syn))) {
        return catName;
      }
    }
  }

  // Global search across all categories if type was ambiguous
  for (const [t, catMap] of Object.entries(CATEGORY_SYNONYMS)) {
    for (const [catName, synonyms] of Object.entries(catMap)) {
      if (synonyms.some(syn => text.includes(syn))) {
        return catName;
      }
    }
  }

  // DO NOT default to Groceries! Return null so caller asks clarification.
  return null;
}

/**
 * Multi-lingual LLM parser implementation if API keys are configured
 */
async function parseUtteranceWithLLM(text, taxonomy, context) {
  const prompt = `You are a Multi-Lingual Personal Finance Voice Transaction Classifier supporting English, Tamil (தமிழ்), Tanglish, Hindi (हिंदी), and Hinglish.
Parse the following voice utterance into a strict JSON object matching this schema:

{
  "transaction_type": "income" | "expense" | "investment",
  "amount": number,
  "currency": "INR",
  "category": string or null,
  "date": "YYYY-MM-DD",
  "notes": string,
  "confidence": number,
  "missing_fields": string[]
}

Available Taxonomy Categories:
- Income: ${taxonomy.income.join(', ')}
- Expense: ${taxonomy.expense.join(', ')}
- Investment: ${taxonomy.investment.join(', ')}

Rules:
1. Category must match one of the exact category names above, or null if unidentifiable.
2. If amount is mentioned (e.g., 500 rooba, ₹500, 500 ரூபாய், 500 rupaye), extract the numerical value.
3. If the user said words like 'selavu', 'kharcha', 'paid', 'spent', 'kuduthen', set transaction_type to 'expense'.
4. If missing_fields has items, list them (e.g. ["category"] or ["amount"]).
5. Return strictly valid JSON with no markdown wrapping.

Today's Date: ${getTodayFormatted()}
Context from previous turn: ${JSON.stringify(context)}
User Utterance: "${text}"`;

  // 1. Google Gemini Flash (Native Multi-Lingual & JSON Mode)
  const geminiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
  if (geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              maxOutputTokens: 300
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        }
      }
    } catch (gErr) {
      console.warn('⚠️ Gemini NLU parse failed:', gErr.message);
    }
  }

  // 2. OpenAI GPT-4o-mini
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const data = await res.json();
        return JSON.parse(data.choices[0].message.content);
      }
    } catch (oErr) {
      console.warn('⚠️ OpenAI NLU parse failed:', oErr.message);
    }
  }

  return null;
}

function getTodayFormatted() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getOffsetDateFormatted(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

