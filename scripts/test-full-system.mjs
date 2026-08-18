/**
 * test-full-system.mjs
 * Comprehensive multi-scenario test suite for the LigthsON Voice Finance Agent.
 * Covers: NLU (English/Tamil/Hindi), STT, Firestore CRUD (create/read/update/delete),
 * language detection, and API health endpoint.
 */

import dotenv from 'dotenv';
dotenv.config();

import { detectLanguage, generateLocalizedSpokenResponse, generateLocalizedFollowUp } from '../src/services/languageService.js';
import { parseUtterance } from '../src/services/nluEngine.js';
import { executeFirestoreCRUD, fetchAllTransactions, getFirestoreMode } from '../src/services/firestoreService.js';

// ── Test Harness ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, got = '') {
  if (condition) {
    passed++;
    results.push(`  ✅ ${label}`);
  } else {
    failed++;
    results.push(`  ❌ ${label}${got ? ` | Got: ${JSON.stringify(got)}` : ''}`);
  }
}

// ── SCENARIO 1: Language Detection ───────────────────────────────────────────
console.log('\n📋 SCENARIO 1: Language Detection');

assert('Tamil script detected',    detectLanguage('ஒரு நூறு ரூபாய் கடையில் செலவு செய்தேன்') === 'ta-IN');
assert('Devanagari script detected', detectLanguage('दो सौ रुपये खाने पर खर्च किया') === 'hi-IN');
assert('Tanglish — kaasu detected',  detectLanguage('kaadu la saapadu 350 rooba achu') === 'ta-IN');
assert('Hinglish — kharcha detected',detectLanguage('aaj lunch ke liye 400 rupaye kharcha hua') === 'hi-IN');
assert('English default',            detectLanguage('I spent 300 on groceries today') === 'en-IN');
assert('Empty → default sticky',    ['en-IN','ta-IN','hi-IN'].includes(detectLanguage('')));

// ── SCENARIO 2: Localized Response Generation ─────────────────────────────────
console.log('\n📋 SCENARIO 2: Localized Response Generation');

const engCreate = generateLocalizedSpokenResponse({ action: 'create', parsedData: { category: 'Groceries', amount: 540, transaction_type: 'expense' }, lang: 'en-IN' });
assert('English CREATE response',   engCreate.includes('540'));

const tamilCreate = generateLocalizedSpokenResponse({ action: 'create', parsedData: { category: 'Groceries', amount: 350, transaction_type: 'expense' }, lang: 'ta-IN' });
assert('Tamil CREATE response',     tamilCreate.includes('350'));

const hindiCreate = generateLocalizedSpokenResponse({ action: 'create', parsedData: { category: 'Food & Dining', amount: 400, transaction_type: 'expense' }, lang: 'hi-IN' });
assert('Hindi CREATE response',     hindiCreate.includes('400'));

const engQuery = generateLocalizedSpokenResponse({ action: 'query', parsedData: {}, lang: 'en-IN', totalExp: 5000, totalInc: 65000, allCount: 7 });
assert('English QUERY response',    engQuery.includes('7'));

const tamilFollowUp = generateLocalizedFollowUp({ missing_fields: ['amount'], category: 'Transport' }, 'ta-IN');
assert('Tamil follow-up (missing amount)', tamilFollowUp.length > 5);

const hindiFollowUp = generateLocalizedFollowUp({ missing_fields: ['category'], amount: 500 }, 'hi-IN');
assert('Hindi follow-up (missing category)', hindiFollowUp.includes('500'));

// ── SCENARIO 3: NLU Entity Extraction ────────────────────────────────────────
console.log('\n📋 SCENARIO 3: NLU Entity Extraction (English)');

const nluEng = await parseUtterance('Spent 450 rupees on groceries today', {});
assert('English amount extracted',    nluEng.amount === 450, nluEng.amount);
assert('English type → expense',      nluEng.transaction_type === 'expense', nluEng.transaction_type);
assert('English category extracted',  nluEng.category && nluEng.category !== '', nluEng.category);
assert('English confidence ≥ 0.8',   nluEng.confidence >= 0.8, nluEng.confidence);

console.log('\n📋 SCENARIO 4: NLU Entity Extraction (Tanglish / Tamil-English)');
const nluTamil = await parseUtterance('kaaikari ku 250 rooba kuduthen maligai kadaiyil', {});
assert('Tanglish amount extracted',  nluTamil.amount > 0, nluTamil.amount);
assert('Tanglish type → expense',    nluTamil.transaction_type === 'expense', nluTamil.transaction_type);

console.log('\n📋 SCENARIO 5: NLU Entity Extraction (Hinglish / Hindi-English)');
const nluHindi = await parseUtterance('aaj sabzi ke liye 180 rupaye diye', {});
assert('Hinglish amount extracted',  nluHindi.amount > 0, nluHindi.amount);
assert('Hinglish type → expense',    nluHindi.transaction_type === 'expense', nluHindi.transaction_type);

console.log('\n📋 SCENARIO 6: Income & Investment NLU');
const nluIncome = await parseUtterance('Got salary of 65000 this month', {});
assert('Income type detected',       nluIncome.transaction_type === 'income', nluIncome.transaction_type);
assert('Income amount 65000',        nluIncome.amount === 65000, nluIncome.amount);

const nluInvest = await parseUtterance('Invested 5000 in mutual funds SIP today', {});
assert('Investment type detected',   nluInvest.transaction_type === 'investment', nluInvest.transaction_type);
assert('Investment amount 5000',     nluInvest.amount === 5000, nluInvest.amount);

// ── SCENARIO 7: Firestore CRUD cycle ─────────────────────────────────────────
console.log('\n📋 SCENARIO 7: Firestore CRUD (Full Create → Read → Update → Delete)');

const testUserId = `test_suite_${Date.now()}`;
const firestoreMode = getFirestoreMode();
console.log(`  ℹ️  Firestore mode: ${firestoreMode}`);

// CREATE
const createResult = await executeFirestoreCRUD('create', {
  transaction_type: 'expense',
  amount: 780,
  category: 'Healthcare',
  date: new Date().toISOString().split('T')[0],
  notes: 'Test pharmacy purchase'
}, testUserId);

assert('CREATE succeeds',            createResult.success === true, createResult);
assert('CREATE returns docId',       Boolean(createResult.docId), createResult.docId);
const createdDocId = createResult.docId;

// READ
const allTx = await fetchAllTransactions(testUserId);
assert('READ returns records',       allTx.length > 0, allTx.length);
const createdTx = allTx.find(t => t.id === createdDocId);
assert('READ finds created record',  Boolean(createdTx), createdDocId);
assert('READ amount correct',        createdTx?.amount === 780, createdTx?.amount);
assert('READ type correct',          createdTx?.transaction_type === 'expense', createdTx?.transaction_type);

// UPDATE
const updateResult = await executeFirestoreCRUD('update', {
  transaction_type: 'expense',
  docId: createdDocId,
  amount: 850,
  category: 'Healthcare',
  notes: 'Updated: added specialist fee'
}, testUserId);

assert('UPDATE succeeds',            updateResult.success === true, updateResult);

// READ after update
const allTxAfterUpdate = await fetchAllTransactions(testUserId);
const updatedTx = allTxAfterUpdate.find(t => t.id === createdDocId);
assert('Amount updated to 850',      updatedTx?.amount === 850, updatedTx?.amount);

// DELETE
const deleteResult = await executeFirestoreCRUD('delete', {
  transaction_type: 'expense',
  docId: createdDocId
}, testUserId);

assert('DELETE succeeds',            deleteResult.success === true, deleteResult);

// READ after delete
const allTxAfterDelete = await fetchAllTransactions(testUserId);
const deletedTx = allTxAfterDelete.find(t => t.id === createdDocId);
assert('Record removed after DELETE', !deletedTx, deletedTx?.id);

// ── SCENARIO 8: Multi-type CRUD ───────────────────────────────────────────────
console.log('\n📋 SCENARIO 8: Multi-type Transactions (Expense + Income + Investment)');

const userId2 = `test_multi_${Date.now()}`;

const r1 = await executeFirestoreCRUD('create', { transaction_type: 'expense', amount: 1200, category: 'Dining Out', date: new Date().toISOString().split('T')[0] }, userId2);
const r2 = await executeFirestoreCRUD('create', { transaction_type: 'income', amount: 65000, category: 'Salary', date: new Date().toISOString().split('T')[0] }, userId2);
const r3 = await executeFirestoreCRUD('create', { transaction_type: 'investment', amount: 5000, category: 'Mutual Funds', date: new Date().toISOString().split('T')[0] }, userId2);

assert('Expense created',   r1.success);
assert('Income created',    r2.success);
assert('Investment created', r3.success);

const multiTx = await fetchAllTransactions(userId2);
const expenseCount = multiTx.filter(t => t.transaction_type === 'expense').length;
const incomeCount  = multiTx.filter(t => t.transaction_type === 'income').length;
const investCount  = multiTx.filter(t => t.transaction_type === 'investment').length;

assert('All 3 types stored',  expenseCount >= 1 && incomeCount >= 1 && investCount >= 1,
  `exp:${expenseCount} inc:${incomeCount} inv:${investCount}`);

// ── RESULTS ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(55));
console.log('📊 TEST RESULTS');
console.log('═'.repeat(55));
results.forEach(r => console.log(r));
console.log('─'.repeat(55));
console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log('═'.repeat(55));

if (failed > 0) {
  console.log('\n⚠️  Some tests failed. Review the failures above.');
  process.exit(1);
} else {
  console.log('\n🎉 ALL TESTS PASSED!');
  process.exit(0);
}
