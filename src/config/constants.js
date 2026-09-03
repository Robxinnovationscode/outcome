/**
 * Constants and Category Taxonomy for Voice-Enabled Transaction Agent API
 * Based on LigthsON Technical Requirements Specification
 */

export const CATEGORY_TAXONOMY = {
  income: [
    'Active',
    'Passive'
  ],
  expense: [
    'Essential',
    'Mandatory',
    'Discretionary'
  ],
  investment: [
    'Mutual Fund',
    'Stocks',
    'Fixed Deposit',
    'Recurring Deposit',
    'Savings',
    'Gold',
    'Other'
  ]
};

// Detailed sub-items under each primary classification
export const CATEGORY_SUBITEMS = {
  expense: {
    Essential: [
      'Groceries', 'Child care', 'Clothing', 'Education', 'Emergency Fund',
      'Fuel - Cooking', 'Fuel - Vehicles', 'Home care', 'Medical Care',
      'Personal grooming', 'Pet care', 'Rents / Mortgage', 'Transportation',
      'Utilities - Electricity', 'Utilities - Gas', 'Utilities - Phone(s)',
      'Utilities - TV / Internet', 'Utilities - Water', 'Utilities Maintenance cost',
      'Vehicle Maintenance cost', 'Miscellaneous'
    ],
    Mandatory: [
      'EMI - Education', 'EMI - Personal', 'EMI - Property', 'EMI - Vehicle',
      'Fees & Charges - Consultation', 'Insurance - Fire', 'Insurance - Health',
      'Insurance - Life (Term / Pension / Moneyback)', 'Insurance - Property',
      'Insurance - Travel', 'Insurance - Vehicle', 'Loan Repayment',
      'PPF/VPF - Retirement fund', 'Tax - Income', 'Tax - utilities'
    ],
    Discretionary: [
      'Food Dining', 'Charitable donations', 'Fun / Entertainment', 'Gifts',
      'Home Décor', 'Luxury clothing / Jewelery', 'Sports items',
      'Subscriptions / dues', 'Tours & travel', 'Vehicle Purchase', 'Shopping'
    ]
  },
  income: {
    Active: [
      'Salary', 'Freelancing', 'Bonuses', 'Loans', 'Refunds/Reimbursements', 'Wages', 'Stipend'
    ],
    Passive: [
      'Capital gains', 'Dividends', 'Financial Aid', 'Income - Business',
      'Income - Chit', 'Income - Interest', 'Rental Income'
    ]
  }
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

// Synonyms and Keyword Mappings for Indian Context (English, Tamil, Tanglish, Hindi, Hinglish)
// Directly maps keywords to the standardized primary category
export const CATEGORY_SYNONYMS = {
  expense: {
    Essential: [
      'grocery', 'groceries', 'sabzi', 'kirana', 'supermarket', 'd-mart', 'blinkit', 'zepto', 'instamart',
      'vegetables', 'milk', 'doodh', 'ration', 'maligai', 'kadai', 'kaaikari', 'pal', 'thayir', 'arisi', 'paruppu',
      'electricity', 'bijli', 'water bill', 'gas', 'cylinder', 'wifi', 'internet', 'broadband',
      'recharge', 'mobile bill', 'maid', 'cook', 'current bill', 'eb bill', 'power bill',
      'room rent', 'house rent', 'flat rent', 'monthly rent', 'pg rent', 'vaadagai', 'veetu vaadagai', 'kiraya',
      'auto', 'cab', 'uber', 'ola', 'rapido', 'metro', 'bus', 'fare', 'fuel', 'petrol', 'diesel',
      'doctor', 'hospital', 'medicine', 'dawa', 'pharmacy', 'clinic', 'medical', 'lab test', 'tablet', 'checkup',
      'child care', 'school', 'education', 'fees', 'essential',
      // Tamil script
      'மளிகை', 'காய்கறி', 'பால்', 'தயிர்', 'அரிசி', 'பருப்பு', 'வாடகை', 'மின்சாரம்', 'தண்ணீர்', 'கேஸ்',
      'மருந்து', 'மருத்துவமனை', 'டாக்டர்', 'மாத்திரை', 'பெட்ரோல்', 'டீசல்',
      // Hindi script
      'सब्ज़ी', 'सब्जी', 'दूध', 'किराना', 'राशन', 'किराया', 'बिजली', 'पानी का बिल', 'गैस', 'दवा', 'अस्पताल', 'पेट्रोल'
    ],
    Mandatory: [
      'emi', 'loan', 'loan repayment', 'home loan', 'car loan', 'personal loan',
      'insurance', 'lic', 'term insurance', 'health insurance', 'life insurance', 'vehicle insurance',
      'tax', 'income tax', 'tds', 'property tax', 'gst', 'ppf', 'vpf', 'epf', 'pf', 'pension',
      // Tamil script
      'கடன்', 'வரி', 'காப்பீடு', 'இன்சூரன்ஸ்',
      // Hindi script
      'कर्ज', 'किस्त', 'ईएमआई', 'बीमा', 'टैक्स'
    ],
    Discretionary: [
      'food', 'dining', 'restaurant', 'zomato', 'swiggy', 'lunch', 'dinner', 'breakfast', 'khana',
      'chai', 'coffee', 'cafe', 'snacks', 'pizza', 'burger', 'saapadu', 'tiffin', 'hotel', 'biryani', 'canteen',
      'movie', 'cinema', 'netflix', 'prime', 'hotstar', 'game', 'gaming', 'concert', 'event', 'party', 'fun', 'padam', 'theatre', 'ott', 'show',
      'clothes', 'shopping', 'amazon', 'flipkart', 'myntra', 'shoes', 'electronics', 'dress', 'mall', 'purchase',
      'luxury', 'jewellery', 'gold purchase', 'travel', 'trip', 'vacation', 'resort', 'tour', 'gift', 'donation',
      // Tamil script
      'சாப்பாடு', 'உணவு', 'பிரியாணி', 'காபி', 'படம்', 'திரைப்படம்', 'சினிமா', 'துணி', 'ஷாப்பிங்', 'சுற்றுலா',
      // Hindi script
      'खाना', 'नाश्ता', 'होटल', 'बिरयानी', 'सिनेमा', 'मूवी', 'शॉपिंग', 'कपड़े', 'घूमना', 'पार्टी'
    ]
  },
  income: {
    Active: [
      'salary', 'paycheck', 'monthly pay', 'stipend', 'wages', 'credited salary', 'sambalam',
      'tankhwah', 'vetan', 'freelance', 'client project', 'contract', 'gig', 'upwork', 'fiverr',
      'bonus', 'incentive', 'commission', 'refund', 'reimbursement', 'cashback',
      // Tamil script
      'சம்பளம்', 'மாதச் சம்பளம்', 'கூலி',
      // Hindi script
      'तनख्वाह', 'वेतन', 'मजदूरी', 'बोनस'
    ],
    Passive: [
      'interest', 'fd interest', 'bank interest', 'savings interest', 'dividend', 'dividends',
      'capital gains', 'stock profit', 'rent received', 'rental income', 'business profit',
      'store sale', 'revenue', 'chit', 'seetu', 'financial aid', 'vaddi',
      // Tamil script
      'வட்டி', 'வியாபாரம்', 'தொழில்', 'பங்கு லாபம்',
      // Hindi script
      'ब्याज', 'व्यापार', 'मुनाफा', 'डिविडेंड', 'किराया मिला'
    ]
  },
  investment: {
    'Mutual Fund': [
      'sip', 'mutual fund', 'mf', 'systematic investment', 'zerodha coin', 'groww', 'kuvera', 'index fund'
    ],
    Stocks: [
      'stock', 'stocks', 'share', 'shares', 'equity', 'zerodha', 'groww', 'upstox', 'angel one',
      'pangu', 'share market', 'பங்கு', 'பங்குச்சந்தை', 'शेयर'
    ],
    'Fixed Deposit': [
      'fd', 'fixed deposit', 'term deposit'
    ],
    'Recurring Deposit': [
      'rd', 'recurring deposit'
    ],
    Savings: [
      'savings', 'savings account', 'emergency savings'
    ],
    Gold: [
      'gold', 'sovereign gold bond', 'sgb', 'digital gold', 'jewellery', 'thangam', 'sona', 'தங்கம்', 'सोना'
    ],
    Other: [
      'crypto', 'bitcoin', 'btc', 'ppf', 'nps', 'pension', 'cheetu', 'seetu'
    ]
  }
};

// Common Indian number words (English, Hindi, Hinglish, Tamil, Tanglish)
export const NUMBER_WORDS = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'ek': 1, 'do': 2, 'teen': 3, 'chaar': 4, 'paanch': 5, 'chhey': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
  'onnu': 1, 'rendu': 2, 'moonu': 3, 'naalu': 4, 'anchu': 5, 'aaru': 6, 'yezhu': 7, 'yettu': 8, 'onpathu': 9, 'pathu': 10,
  // Tamil Script numbers
  'ஒன்று': 1, 'இரண்டு': 2, 'மூன்று': 3, 'நான்கு': 4, 'ஐந்து': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10,
  'நூறு': 100, 'இருநூறு': 200, 'முந்நூறு': 300, 'நானூறு': 400, 'ஐந்நூறு': 500, 'ஆயிரம்': 1000, 'இரண்டாயிரம்': 2000, 'ஐந்தாயிரம்': 5000, 'பத்தாயிரம்': 10000, 'லட்சம்': 100000, 'கோடி': 10000000,
  // Hindi Script numbers
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'सौ': 100, 'हज़ार': 1000, 'हजार': 1000, 'लाख': 100000, 'करोड़': 10000000,
  // Phonetic scales
  'sau': 100, 'hundred': 100, 'nooru': 100, 'irunooru': 200, 'munnooru': 300, 'naanooru': 400, 'ainooru': 500,
  'hazar': 1000, 'hazhaar': 1000, 'thousand': 1000, 'k': 1000, 'aayiram': 1000, 'ayiram': 1000, 'rendaayiram': 2000, 'anchayiram': 5000, 'pathayiram': 10000,
  'lakh': 100000, 'lac': 100000, 'lakhs': 100000, 'latcham': 100000,
  'crore': 10000000, 'cr': 10000000, 'kodi': 10000000
};

