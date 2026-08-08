import { CATEGORY_TAXONOMY, CATEGORY_SYNONYMS, NUMBER_WORDS, DEFAULT_CONFIDENCE_THRESHOLD } from '../config/constants.js';

/**
 * Parse transcript text into structured transaction object conforming to Section 3.2 schema.
 *
 * @param {string} transcript - Natural language transcript string
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
  const lowerText = text.toLowerCase();

  // 1. Check if LLM provider (OpenAI / Gemini) is available for deep NLU
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

  // 2. Powerful Rule-Based & Heuristic NLU Engine
  return parseUtteranceRuleBased(text, taxonomy, context);
}

/**
 * Rule-Based NLU Parser with Indian Financial Accent & Terminology Support
 */
function parseUtteranceRuleBased(text, taxonomy, context = {}) {
  const lowerText = text.toLowerCase();

  let transaction_type = context.transaction_type || null;
  let amount = context.amount || null;
  let category = context.category || null;
  let date = context.date || getTodayFormatted();
  let notes = text;
  let confidence = 0.95;
  const missing_fields = [];

  // A. Detect Transaction Type
  if (!transaction_type) {
    const expenseKeywords = [
      'spent', 'spend', 'paid', 'buying', 'bought', 'expense', 'purchased',
      'cost', 'kharcha', 'diya', 'bhar diya', 'bill paid', 'gave', 'de diya'
    ];
    const incomeKeywords = [
      'received', 'got', 'credited', 'earned', 'salary', 'income', 'stipend',
      'aaya', 'mila', 'payment received', 'credited to account', 'deposit'
    ];
    const investmentKeywords = [
      'invested', 'investment', 'sip', 'mutual fund', 'stocks', 'stock',
      'fixed deposit', 'fd', 'rd', 'ppf', 'epf', 'nps', 'gold', 'crypto', 'shares', 'nivesh'
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
      // Default to expense if unclear, but lower confidence
      if (lowerText.includes('add') || lowerText.includes('log')) {
        confidence -= 0.15;
      }
    }
  }

  // B. Extract Amount
  if (!amount) {
    amount = extractAmount(lowerText);
  }

  // C. Extract Category
  if (!category) {
    category = extractCategory(lowerText, transaction_type || 'expense', taxonomy);
  }

  // D. Extract Date
  if (lowerText.includes('yesterday') || lowerText.includes('kal')) {
    date = getOffsetDateFormatted(-1);
  } else if (lowerText.includes('day before yesterday')) {
    date = getOffsetDateFormatted(-2);
  } else if (lowerText.includes('tomorrow')) {
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
    confidence -= 0.3;
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    missing_fields.push('amount');
    confidence -= 0.35;
    amount = null;
  }
  if (!category) {
    missing_fields.push('category');
    confidence -= 0.2;
    category = transaction_type ? (taxonomy[transaction_type]?.[0] || 'Other') : 'Other';
  }

  // Clamp confidence score between 0.10 and 0.99
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
 * Extract numerical amount from Indian financial phrases (e.g. ₹500, 500 rs, 5k, 20 hazar, 1.5 lakh)
 */
function extractAmount(text) {
  // 1. Direct Regex for Currency prefix/suffix (e.g. ₹500, Rs. 500, 500 rupees, 500 INR, 500.50)
  const currencyMatch = text.match(/(?:(?:rs\.?|inr|₹|rupees?|rs)\s*)?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:rs\.?|inr|rupees?|bucks)?/i);
  
  // 2. Handle 5k, 10k, 2.5k
  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:k|thousand|hazar)\b/i);
  if (kMatch) {
    return parseFloat(kMatch[1]) * 1000;
  }

  // 3. Handle Lakhs (e.g. 1.5 lakh, 2 lacs)
  const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lacs?|lac)\b/i);
  if (lakhMatch) {
    return parseFloat(lakhMatch[1]) * 100000;
  }

  if (currencyMatch && currencyMatch[1]) {
    const rawNum = currencyMatch[1].replace(/,/g, '');
    const val = parseFloat(rawNum);
    if (!isNaN(val) && val > 0) return val;
  }

  // 4. Word to number fallback (e.g. "five hundred", "300")
  const numMatch = text.match(/\b(\d+)\b/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  return null;
}

/**
 * Extract Category based on Taxonomies and Indian Synonyms
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

  // Check synonym match
  for (const [catName, synonyms] of Object.entries(typeSynonyms)) {
    if (availableCategories.includes(catName)) {
      if (synonyms.some(syn => text.includes(syn))) {
        return catName;
      }
    }
  }

  // Global search across all categories if type was misclassified
  for (const [t, catMap] of Object.entries(CATEGORY_SYNONYMS)) {
    for (const [catName, synonyms] of Object.entries(catMap)) {
      if (synonyms.some(syn => text.includes(syn))) {
        return catName;
      }
    }
  }

  return availableCategories[0] || 'Other';
}

/**
 * Optional LLM parser implementation if API keys are set
 */
async function parseUtteranceWithLLM(text, taxonomy, context) {
  const prompt = `
You are a Voice Transaction Classifier for a personal finance application.
Parse the following voice utterance into a JSON object matching this schema:

Schema:
{
  "transaction_type": "income" | "expense" | "investment",
  "amount": number,
  "currency": "INR",
  "category": string,
  "date": "YYYY-MM-DD",
  "notes": string,
  "confidence": number, // 0.0 to 1.0
  "missing_fields": string[] // e.g. ["amount", "category"] if ambiguous or omitted
}

Taxonomy per type:
- Income: ${taxonomy.income.join(', ')}
- Expense: ${taxonomy.expense.join(', ')}
- Investment: ${taxonomy.investment.join(', ')}

Today's Date: ${getTodayFormatted()}
Context from previous turn: ${JSON.stringify(context)}
User Utterance: "${text}"

Respond strictly with valid JSON only. No markdown ticks, no commentary.
`;

  if (process.env.OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
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
