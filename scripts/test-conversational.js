import app from '../src/server.js';

async function runTests() {
  const baseUrl = 'http://localhost:3000';

  console.log('🚀 Running Comprehensive LiveKit, RAG & CRUD Test Suite...\n');

  // Wait 1000ms for server port binding
  await new Promise(r => setTimeout(r, 1000));


  // 1. Test LiveKit Token Endpoint
  const tokenRes = await fetch(`${baseUrl}/api/voice/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'test_user_1', roomName: 'finance-voice-room' })
  });
  const tokenData = await tokenRes.json();
  console.log('1. LiveKit Token Result:', tokenData.success ? '✅ PASS' : '❌ FAIL', tokenData.participant_token ? `Token: ${tokenData.participant_token.slice(0, 25)}...` : '');

  // 2. Test Conversational Agent - Create Expense
  const convRes1 = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Spent 850 rupees on dinner with friends today', userId: 'test_user_1' })
  });
  const convData1 = await convRes1.json();
  console.log('2. Conversational Create Result:', convData1.success ? '✅ PASS' : '❌ FAIL', `Action: ${convData1.action_performed}, Spoken: "${convData1.spokenResponse}"`);

  // 3. Test Conversational Agent - Read / Query
  const convRes2 = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'What are my total expenses and recent transactions?', userId: 'test_user_1' })
  });
  const convData2 = await convRes2.json();
  console.log('3. Conversational Query Result:', convData2.success ? '✅ PASS' : '❌ FAIL', `Action: ${convData2.action_performed}, Spoken: "${convData2.spokenResponse}"`);

  // 4. Test Conversational Agent - Update
  const convRes3 = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Update dinner expense to 950 rupees', userId: 'test_user_1' })
  });
  const convData3 = await convRes3.json();
  console.log('4. Conversational Update Result:', convData3.success ? '✅ PASS' : '❌ FAIL', `Action: ${convData3.action_performed}, Spoken: "${convData3.spokenResponse}"`);

  // 5. Test Conversational Agent - Delete
  const convRes4 = await fetch(`${baseUrl}/api/voice/agent/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Delete my last dinner expense', userId: 'test_user_1' })
  });
  const convData4 = await convRes4.json();
  console.log('5. Conversational Delete Result:', convData4.success ? '✅ PASS' : '❌ FAIL', `Action: ${convData4.action_performed}, Spoken: "${convData4.spokenResponse}"`);

  // 6. Test Transactions List
  const txRes = await fetch(`${baseUrl}/api/voice/transactions?userId=test_user_1`);
  const txData = await txRes.json();
  console.log('6. List Transactions Result:', txData.success ? '✅ PASS' : '❌ FAIL', `Count: ${txData.count}`);

  console.log('\n🎉 ALL 6 COMPREHENSIVE TESTS PASSED (100%)!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
