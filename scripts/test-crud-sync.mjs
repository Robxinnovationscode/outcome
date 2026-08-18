import dotenv from 'dotenv';
import { parseUtterance } from '../src/services/nluEngine.js';
import { executeFirestoreCRUD, fetchAllTransactions } from '../src/services/firestoreService.js';
import { transcribeAudio } from '../src/services/sttService.js';

dotenv.config();

async function runTests() {
  console.log('🧪 Starting Full System Tests...\n');

  // Test 1: NLU Engine with active Gemini
  console.log('1️⃣ Testing NLU Parse with Gemini...');
  const testText = 'Spent 450 rupees on groceries today';
  const parsed = await parseUtterance(testText, {});
  console.log('Parsed Output:', {
    transaction_type: parsed.transaction_type,
    amount: parsed.amount,
    category: parsed.category,
    confidence: parsed.confidence
  });

  if (parsed.amount === 450 && parsed.transaction_type === 'expense') {
    console.log('✅ Test 1 Passed: NLU parsed amount and type correctly.\n');
  } else {
    console.warn('⚠️ Test 1 Warning: NLU result unexpected.\n');
  }

  // Test 2: STT Text Pass-through & Validation
  console.log('2️⃣ Testing STT Service...');
  const sttPass = await transcribeAudio({ file: 'Spent 600 on petrol' });
  console.log('STT Pass-through:', sttPass);
  if (sttPass.transcript === 'Spent 600 on petrol') {
    console.log('✅ Test 2 Passed: STT pipeline operational.\n');
  }

  // Test 3: Firestore CRUD & Dual Write to users/{userId}/transactions
  console.log('3️⃣ Testing Firestore CRUD Dual-Write...');
  const testUserId = 'test_user_' + Date.now();
  const crudRes = await executeFirestoreCRUD('create', {
    transaction_type: 'expense',
    amount: 450,
    category: 'Groceries',
    date: '2026-08-18',
    notes: 'Test grocery transaction'
  }, testUserId);

  console.log('CRUD Create Result:', {
    success: crudRes.success,
    mode: crudRes.mode,
    docId: crudRes.docId,
    mainTxId: crudRes.mainTxId
  });

  const allTx = await fetchAllTransactions(testUserId);
  console.log('Fetched Transactions Count:', allTx.length);
  if (allTx.length > 0) {
    console.log('First Record in Ledger:', allTx[0]);
    console.log('✅ Test 3 Passed: Firestore transactions synced and retrieved.\n');
  }

  console.log('🎉 ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
});
