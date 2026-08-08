import http from 'http';
import { parseUtterance } from '../src/services/nluEngine.js';
import { executeFirestoreCRUD } from '../src/services/firestoreService.js';
import { CATEGORY_TAXONOMY } from '../src/config/constants.js';

console.log('🧪 Starting Voice-Enabled Transaction Agent API Verification Suite...\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('--- TEST GROUP 1: Rule-Based NLU & Taxonomy Classification ---');
  
  // Test 1: Simple Expense Command
  const exp1 = await parseUtterance('Spent 500 rupees on groceries today');
  assert(exp1.transaction_type === 'expense', 'Transaction type identified as expense');
  assert(exp1.amount === 500, `Amount extracted correctly as 500 (Got: ${exp1.amount})`);
  assert(exp1.category === 'Groceries', `Category mapped to Groceries (Got: ${exp1.category})`);
  assert(exp1.missing_fields.length === 0, 'No missing fields for complete utterance');

  // Test 2: Income Utterance
  const inc1 = await parseUtterance('Add 25,000 salary credited to bank account');
  assert(inc1.transaction_type === 'income', 'Transaction type identified as income');
  assert(inc1.amount === 25000, `Amount extracted correctly as 25000 (Got: ${inc1.amount})`);
  assert(inc1.category === 'Salary', `Category mapped to Salary (Got: ${inc1.category})`);

  // Test 3: Investment Utterance
  const inv1 = await parseUtterance('Invested 5000 in Mutual Fund SIP');
  assert(inv1.transaction_type === 'investment', 'Transaction type identified as investment');
  assert(inv1.amount === 5000, `Amount extracted correctly as 5000 (Got: ${inv1.amount})`);
  assert(inv1.category === 'Mutual Fund SIP', `Category mapped to Mutual Fund SIP (Got: ${inv1.category})`);

  // Test 4: Conversational Fallback & Missing Fields
  const missing1 = await parseUtterance('Add an expense');
  assert(missing1.missing_fields.includes('amount'), 'Identified missing amount field');

  console.log('\n--- TEST GROUP 2: Model B Firestore CRUD Execution ---');
  const crudRes = await executeFirestoreCRUD('create', exp1, 'test_user_123');
  assert(crudRes.success === true, 'Firestore CRUD operation executed successfully');
  assert(crudRes.data.source === 'voice_agent', 'Audit tag source: "voice_agent" present per Section 5.2');

  console.log(`\n==================================================`);
  console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
  console.log(`==================================================\n`);

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
