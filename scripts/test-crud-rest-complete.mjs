import app from '../src/server.js';

async function run() {
  const baseUrl = 'http://localhost:3000';
  const testUser = 'rest_crud_test_' + Date.now();
  console.log('🚀 Running Full CRUD REST & Synchronization Verification for user:', testUser);

  // Wait 1000ms for server port
  await new Promise(r => setTimeout(r, 1000));

  // --- 1. DIRECT REST CREATE ---
  console.log('\n1. Testing POST /api/voice/transactions (CREATE)...');
  const createRes = await fetch(`${baseUrl}/api/voice/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUser,
      transaction_type: 'expense',
      category: 'Groceries',
      amount: 650,
      date: '2026-10-12',
      notes: 'Organic fruits & vegetables'
    })
  });
  const createData = await createRes.json();
  console.log('Create Response:', createRes.status, createData);
  if (!createRes.ok || !createData.success) {
    throw new Error('Create failed');
  }

  // --- 2. DIRECT REST READ ---
  console.log('\n2. Testing GET /api/voice/transactions (READ / LIST)...');
  const listRes1 = await fetch(`${baseUrl}/api/voice/transactions?userId=${testUser}`);
  const listData1 = await listRes1.json();
  console.log('List Response: count =', listData1.count, 'first item =', listData1.transactions[0]);
  if (listData1.count !== 1) {
    throw new Error(`Expected 1 transaction, got ${listData1.count}`);
  }
  const createdId = listData1.transactions[0].id;
  if (listData1.transactions[0].category !== 'Groceries') {
    throw new Error(`Expected category "Groceries", got "${listData1.transactions[0].category}"`);
  }

  // --- 3. DIRECT REST UPDATE ---
  console.log(`\n3. Testing PUT /api/voice/transactions/expense/${createdId} (UPDATE)...`);
  const updateRes = await fetch(`${baseUrl}/api/voice/transactions/expense/${createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUser,
      amount: 720,
      date: '2026-10-13',
      notes: 'Updated fruits & vegetables'
    })
  });
  const updateData = await updateRes.json();
  console.log('Update Response:', updateRes.status, updateData);
  if (!updateRes.ok || !updateData.success) {
    throw new Error('Update failed');
  }

  // Verify list reflection after update
  const listRes2 = await fetch(`${baseUrl}/api/voice/transactions?userId=${testUser}`);
  const listData2 = await listRes2.json();
  console.log('After update: amount =', listData2.transactions[0].amount, 'date =', listData2.transactions[0].date);
  if (listData2.transactions[0].amount !== 720 || listData2.transactions[0].date !== '2026-10-13') {
    throw new Error('Update did not persist properly');
  }

  // --- 4. QUERY SPENDING ---
  console.log('\n4. Testing POST /api/voice/query (READ / CATEGORY QUERY)...');
  const queryRes = await fetch(`${baseUrl}/api/voice/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUser,
      queryText: 'How much did I spend on groceries?'
    })
  });
  const queryData = await queryRes.json();
  console.log('Query Answer:', queryData.answer);
  if (!queryData.answer.includes('720')) {
    throw new Error('Query did not reflect 720 grocery spend');
  }

  // --- 5. DIRECT REST DELETE ---
  console.log(`\n5. Testing DELETE /api/voice/transactions/expense/${createdId} (DELETE)...`);
  const deleteRes = await fetch(`${baseUrl}/api/voice/transactions/expense/${createdId}?userId=${testUser}`, {
    method: 'DELETE'
  });
  const deleteData = await deleteRes.json();
  console.log('Delete Response:', deleteRes.status, deleteData);
  if (!deleteRes.ok || !deleteData.success) {
    throw new Error('Delete failed');
  }

  // Verify list reflection after delete (NO RESURRECTION)
  const listRes3 = await fetch(`${baseUrl}/api/voice/transactions?userId=${testUser}`);
  const listData3 = await listRes3.json();
  console.log('After delete: count =', listData3.count);
  if (listData3.count !== 0) {
    throw new Error(`Expected 0 transactions after delete, got ${listData3.count} (Resurrection bug!)`);
  }

  // --- 6. VOICE / CONVERSATIONAL FULL CYCLE ---
  console.log('\n6. Testing Voice / Conversational Agent CRUD Flow...');
  // Conversational Create
  const convCRes = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUser,
      text: 'Spent 400 rupees on dinner with friends today'
    })
  });
  const convCData = await convCRes.json();
  console.log('Voice Create Spoken:', convCData.spokenResponse);

  // Conversational Read
  const convQRes = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUser,
      text: 'What did I spend on dinner?'
    })
  });
  const convQData = await convQRes.json();
  console.log('Voice Query Spoken:', convQData.spokenResponse);

  // Conversational Update
  const convURes = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUser,
      text: 'Update dinner expense to 480 rupees'
    })
  });
  const convUData = await convURes.json();
  console.log('Voice Update Spoken:', convUData.spokenResponse);

  // Conversational Delete
  const convDRes = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUser,
      text: 'Delete my last dinner expense'
    })
  });
  const convDData = await convDRes.json();
  console.log('Voice Delete Spoken:', convDData.spokenResponse);

  // Check final count
  const listFinalRes = await fetch(`${baseUrl}/api/voice/transactions?userId=${testUser}`);
  const listFinalData = await listFinalRes.json();
  console.log('Final Transactions Count:', listFinalData.count);
  if (listFinalData.count !== 0) {
    throw new Error(`Expected 0 after conversational delete, got ${listFinalData.count}`);
  }

  console.log('\n✨ ALL CRUD TESTS (CREATE, READ, UPDATE, DELETE) COMPLETED WITH 100% SUCCESS!');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
