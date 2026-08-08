/**
 * Constants and Category Taxonomy for Voice-Enabled Transaction Agent API
 * Based on LigthsON Technical Requirements Specification
 */

export const CATEGORY_TAXONOMY = {
  income: [
    'Salary',
    'Freelance',
    'Business',
    'Interest',
    'Gift',
    'Refund',
    'Other'
  ],
  expense: [
    'Groceries',
    'Transport',
    'Rent',
    'Utilities',
    'Food & Dining',
    'Entertainment',
    'Healthcare',
    'Shopping',
    'Other'
  ],
  investment: [
    'Mutual Fund SIP',
    'Stocks',
    'Fixed Deposit',
    'Gold',
    'PPF/EPF',
    'Crypto',
    'Other'
  ]
};

export const TRANSACTION_TYPES = ['income', 'expense', 'investment'];

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.70;

export const DEFAULT_CURRENCY = 'INR';

export const SUPPORTED_LANGUAGES = [
  'en-IN', // English (Indian accent) - REQUIRED
  'hi-IN', // Hindi - DESIRABLE
  'ta-IN', // Tamil - DESIRABLE
  'hinglish' // Hinglish/Tanglish code-mixed - NICE TO HAVE
];

// Synonyms and Keyword Mappings for Indian Context & Hinglish
export const CATEGORY_SYNONYMS = {
  expense: {
    Groceries: ['grocery', 'groceries', 'sabzi', 'kirana', 'supermarket', 'd-mart', 'blinkit', 'zepto', 'instamart', 'vegetables', 'milk', 'doodh', 'ration'],
    Transport: ['auto', 'cab', 'uber', 'ola', 'rapido', 'metro', 'bus', 'fare', 'fuel', 'petrol', 'diesel', 'parking', 'toll', 'rickshaw', 'travel', 'flight'],
    Rent: ['room rent', 'house rent', 'flat rent', 'monthly rent', 'pg rent'],
    Utilities: ['electricity', 'bijli', 'water bill', 'gas', 'cylinder', 'wifi', 'internet', 'broadband', 'recharge', 'mobile bill', 'maid', 'cook'],
    'Food & Dining': ['food', 'dining', 'restaurant', 'zomato', 'swiggy', 'lunch', 'dinner', 'breakfast', 'khana', 'chai', 'coffee', 'cafe', 'snacks', 'pizza', 'burger'],
    Entertainment: ['movie', 'cinema', 'netflix', 'prime', 'hotstar', 'game', 'gaming', 'concert', 'event', 'party', 'fun'],
    Healthcare: ['doctor', 'hospital', 'medicine', 'dawa', 'pharmacy', 'clinic', 'medical', 'lab test', 'health insurance'],
    Shopping: ['clothes', 'shopping', 'amazon', 'flipkart', 'myntra', 'shoes', 'electronics', 'dress', 'mall', 'purchase']
  },
  income: {
    Salary: ['salary', 'paycheck', 'monthly pay', 'stipend', 'wages', 'credited salary'],
    Freelance: ['freelance', 'client project', 'contract', 'gig', 'upwork', 'fiverr'],
    Business: ['business', 'store sale', 'revenue', 'profit', 'shop sales'],
    Interest: ['interest', 'fd interest', 'bank interest', 'savings interest', 'dividend'],
    Gift: ['gift', 'shagun', 'birthday gift', 'reward', 'cashback'],
    Refund: ['refund', 'reimbursement', 'returned money', 'cashback']
  },
  investment: {
    'Mutual Fund SIP': ['sip', 'mutual fund', 'mf', 'systematic investment', 'zerodha coin', 'groww', 'kuvera'],
    Stocks: ['stock', 'stocks', 'share', 'shares', 'equity', 'zerodha', 'groww', 'upstox', 'angel one'],
    'Fixed Deposit': ['fd', 'fixed deposit', 'term deposit', 'rd', 'recurring deposit'],
    Gold: ['gold', 'sovereign gold bond', 'sgb', 'digital gold', 'jewellery'],
    'PPF/EPF': ['ppf', 'epf', 'pf', 'provident fund', 'nps', 'pension'],
    Crypto: ['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'usdt', 'wazirx', 'coindcx']
  }
};

// Common Indian number words (Hindi / Hinglish / Tamil)
export const NUMBER_WORDS = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'ek': 1, 'do': 2, 'teen': 3, 'chaar': 4, 'paanch': 5, 'chhey': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
  'sau': 100, 'hundred': 100,
  'hazar': 1000, 'hazhaar': 1000, 'thousand': 1000, 'k': 1000,
  'lakh': 100000, 'lac': 100000, 'lakhs': 100000,
  'crore': 10000000, 'cr': 10000000
};
