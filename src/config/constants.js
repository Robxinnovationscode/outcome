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

// Synonyms and Keyword Mappings for Indian Context (English, Tamil, Tanglish, Hindi, Hinglish)
export const CATEGORY_SYNONYMS = {
  expense: {
    Groceries: [
      'grocery', 'groceries', 'sabzi', 'kirana', 'supermarket', 'd-mart', 'blinkit', 'zepto', 'instamart',
      'vegetables', 'milk', 'doodh', 'ration', 'maligai', 'kadai', 'kaaikari', 'pal', 'thayir', 'arisi', 'paruppu',
      // Tamil script
      'மளிகை', 'காய்கறி', 'பால்', 'தயிர்', 'அரிசி', 'பருப்பு', 'கடை', 'மளிகைக்கடை',
      // Hindi script
      'सब्ज़ी', 'सब्जी', 'दूध', 'किराना', 'राशन', 'दही', 'चावल', 'दाल'
    ],
    Transport: [
      'auto', 'cab', 'uber', 'ola', 'rapido', 'metro', 'bus', 'fare', 'fuel', 'petrol', 'diesel',
      'parking', 'toll', 'rickshaw', 'travel', 'flight', 'vandi', 'share auto', 'train', 'ticket',
      // Tamil script
      'வண்டி', 'ஆட்டோ', 'பேருந்து', 'ரயில்', 'பெட்ரோல்', 'டீசல்', 'பயணம்',
      // Hindi script
      'ऑटो', 'गाड़ी', 'गाड़ी', 'किराया', 'पेट्रोल', 'डीजल', 'बस', 'ट्रेन'
    ],
    Rent: [
      'room rent', 'house rent', 'flat rent', 'monthly rent', 'pg rent', 'vaadagai', 'veetu vaadagai', 'kiraya',
      // Tamil script
      'வாடகை', 'வீட்டு வாடகை',
      // Hindi script
      'किराया', 'घर का किराया', 'मकान किराया'
    ],
    Utilities: [
      'electricity', 'bijli', 'water bill', 'gas', 'cylinder', 'wifi', 'internet', 'broadband',
      'recharge', 'mobile bill', 'maid', 'cook', 'current bill', 'eb bill', 'power bill',
      // Tamil script
      'மின்சாரம்', 'மின்சார கட்டணம்', 'தண்ணீர்', 'கேஸ்', 'ரீசார்ஜ்',
      // Hindi script
      'बिजली', 'पानी का बिल', 'गैस', 'सिलेंडर', 'रिचार्ज'
    ],
    'Food & Dining': [
      'food', 'dining', 'restaurant', 'zomato', 'swiggy', 'lunch', 'dinner', 'breakfast', 'khana',
      'chai', 'coffee', 'cafe', 'snacks', 'pizza', 'burger', 'saapadu', 'tiffin', 'hotel', 'biryani', 'canteen',
      // Tamil script
      'சாப்பாடு', 'டிபன்', 'ஹோட்டல்', 'உணவு', 'பிரியாணி', 'காபி', 'தேநீர்',
      // Hindi script
      'खाना', 'नाश्ता', 'होटल', 'बिरयानी', 'चाय', 'कॉफ़ी', 'कॉफी'
    ],
    Entertainment: [
      'movie', 'cinema', 'netflix', 'prime', 'hotstar', 'game', 'gaming', 'concert', 'event',
      'party', 'fun', 'padam', 'theatre', 'ott', 'show',
      // Tamil script
      'படம்', 'திரைப்படம்', 'சினிமா', 'நாடகம்',
      // Hindi script
      'फिल्म', 'सिनेमा', 'मूवी', 'नाटक'
    ],
    Healthcare: [
      'doctor', 'hospital', 'medicine', 'dawa', 'pharmacy', 'clinic', 'medical', 'lab test',
      'health insurance', 'marunthu', 'maruthuvamani', 'tablet', 'checkup',
      // Tamil script
      'மருந்து', 'மருத்துவமனை', 'டாக்டர்', 'மாத்திரை',
      // Hindi script
      'दवा', 'दवाई', 'अस्पताल', 'डॉक्टर', 'इलाज'
    ],
    Shopping: [
      'clothes', 'shopping', 'amazon', 'flipkart', 'myntra', 'shoes', 'electronics', 'dress',
      'mall', 'purchase', 'thuni', 'pant', 'shirt', 'saree',
      // Tamil script
      'துணி', 'புடவை', 'ஆடை', 'ஷாப்பிங்',
      // Hindi script
      'कपड़े', 'कपड़ा', 'खरीदारी', 'शॉपिंग', 'साड़ी'
    ]
  },
  income: {
    Salary: [
      'salary', 'paycheck', 'monthly pay', 'stipend', 'wages', 'credited salary', 'sambalam',
      'tankhwah', 'vetan', 'சம்பளம்', 'மாதச் சம்பளம்', 'तनख्वाह', 'वेतन'
    ],
    Freelance: [
      'freelance', 'client project', 'contract', 'gig', 'upwork', 'fiverr', 'project work'
    ],
    Business: [
      'business', 'store sale', 'revenue', 'profit', 'shop sales', 'vyapar', 'thozhil', 'வியாபாரம்', 'தொழில்', 'व्यापार'
    ],
    Interest: [
      'interest', 'fd interest', 'bank interest', 'savings interest', 'dividend', 'vaddi', 'வட்டி', 'ब्याज'
    ],
    Gift: [
      'gift', 'shagun', 'birthday gift', 'reward', 'cashback', 'anbilippu', 'பரிசு', 'तोहफा', 'शगुन'
    ],
    Refund: [
      'refund', 'reimbursement', 'returned money', 'cashback', 'thirumba vanthathu', 'திரும்ப வந்தது', 'वापसी'
    ]
  },
  investment: {
    'Mutual Fund SIP': [
      'sip', 'mutual fund', 'mf', 'systematic investment', 'zerodha coin', 'groww', 'kuvera', 'fund'
    ],
    Stocks: [
      'stock', 'stocks', 'share', 'shares', 'equity', 'zerodha', 'groww', 'upstox', 'angel one',
      'pangu', 'share market', 'பங்கு', 'பங்குச்சந்தை', 'शेयर'
    ],
    'Fixed Deposit': [
      'fd', 'fixed deposit', 'term deposit', 'rd', 'recurring deposit'
    ],
    Gold: [
      'gold', 'sovereign gold bond', 'sgb', 'digital gold', 'jewellery', 'thangam', 'sona', 'தங்கம்', 'சோனா', 'सोना'
    ],
    'PPF/EPF': [
      'ppf', 'epf', 'pf', 'provident fund', 'nps', 'pension', 'cheetu', 'seetu', 'சீட்டு'
    ],
    Crypto: [
      'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'usdt', 'wazirx', 'coindcx'
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

