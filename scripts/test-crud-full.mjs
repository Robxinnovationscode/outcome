import dotenv from 'dotenv';
import { executeFirestoreCRUD, fetchAllTransactions } from '../src/services/firestoreService.js';
import { isFirebaseConfigured, getFirestore } from '../src/config/firebase.js';

dotenv.config();

async function run() {
  console.log('Testing CRUD operations...');
  const testUser = 'crud_test_' + Date.now();

  // 1. CREATE
  console.log('\n--- 1. Testing CREATE ---');
  const createRes = await executeFirestoreCRUD('create', {
    transaction_type: 'expense',
    amount: 500,
    category: 'Groceries',
    notes: 'Weekly fresh vegetables',
    date: '2026-10-12'
  }, testUser);
  console.log('Create result:', createRes);

  let txs = await fetchAllTransactions(testUser);
  console.log('Transactions after create (count):', txs.length);
  console.log('Transaction item:', txs[0]);

  if (txs.length !== 1) {
    console.error('FAIL: Expected 1 transaction, got', txs.length);
  }
  if (txs[0]?.amount !== 500) {
    console.error('FAIL: Expected amount 500, got', txs[0]?.amount);
  }

  const createdId = txs[0]?.id;

  // 2. UPDATE by docId
  console.log('\n--- 2. Testing UPDATE by docId ---');
  const updateRes = await executeFirestoreCRUD('update', {
    transaction_type: 'expense',
    docId: createdId,
    amount: 750,
    notes: 'Updated note',
    date: '2026-10-13'
  }, testUser);
  console.log('Update result:', updateRes);

  txs = await fetchAllTransactions(testUser);
  console.log('Transactions after update:', txs);
  if (txs[0]?.amount !== 750) {
    console.error('FAIL: Expected updated amount 750, got', txs[0]?.amount);
  }
  if (txs[0]?.date !== '2026-10-13') {
    console.error('FAIL: Expected updated date 2026-10-13, got', txs[0]?.date);
  }

  // 3. DELETE by docId
  console.log('\n--- 3. Testing DELETE by docId ---');
  const deleteRes = await executeFirestoreCRUD('delete', {
    transaction_type: 'expense',
    docId: createdId
  }, testUser);
  console.log('Delete result:', deleteRes);

  txs = await fetchAllTransactions(testUser);
  console.log('Transactions after delete (count):', txs.length);
  if (txs.length !== 0) {
    console.error('FAIL: Expected 0 transactions after delete, got', txs.length);
  }

  // 4. Test Conversational / voice-style UPDATE and DELETE (without docId)
  console.log('\n--- 4. Testing CREATE, then UPDATE without docId, then DELETE without docId ---');
  await executeFirestoreCRUD('create', {
    transaction_type: 'expense',
    amount: 300,
    category: 'Essential',
    notes: 'Milk and bread'
  }, testUser);

  txs = await fetchAllTransactions(testUser);
  console.log('After create 2, count:', txs.length, 'amount:', txs[0]?.amount);

  const updateNoIdRes = await executeFirestoreCRUD('update', {
    transaction_type: 'expense',
    category: 'Essential',
    amount: 350
  }, testUser);
  console.log('Update without docId result:', updateNoIdRes);

  txs = await fetchAllTransactions(testUser);
  console.log('After update without docId, amount:', txs[0]?.amount);
  if (txs[0]?.amount !== 350) {
    console.error('FAIL: Expected amount 350, got', txs[0]?.amount);
  }

  const deleteNoIdRes = await executeFirestoreCRUD('delete', {
    transaction_type: 'expense',
    category: 'Essential'
  }, testUser);
  console.log('Delete without docId result:', deleteNoIdRes);

  txs = await fetchAllTransactions(testUser);
  console.log('After delete without docId, count:', txs.length);
  if (txs.length !== 0) {
    console.error('FAIL: Expected 0 transactions after delete, got', txs.length);
  }

  console.log('\nDone test run.');
  process.exit(0);
}

run().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
