import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_MODE = 'memory';

const { executeFirestoreCRUD, fetchAllTransactions } = await import('../src/services/firestoreService.js');
const { conversationalAgent, confirmCommit } = await import('../src/controllers/voiceController.js');

async function invokeController(controller, body) {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  await controller({ body }, response);
  return response;
}

test('transaction create is idempotent and update/delete require the exact record ID', async () => {
  const userId = `crud_${Date.now()}_transaction`;
  const input = {
    transaction_type: 'expense',
    amount: 450,
    category: 'Groceries',
    date: '2026-10-07',
    notes: 'Weekly grocery shop',
    requestId: 'request-expense-1'
  };

  const created = await executeFirestoreCRUD('create', input, userId);
  const repeated = await executeFirestoreCRUD('create', input, userId);
  assert.equal(created.success, true);
  assert.equal(repeated.docId, created.docId);
  assert.equal(repeated.duplicate_prevented, true);
  assert.equal((await fetchAllTransactions(userId)).length, 1);

  const missingId = await executeFirestoreCRUD('update', { transaction_type: 'expense', amount: 500 }, userId);
  assert.equal(missingId.success, false);

  const updated = await executeFirestoreCRUD('update', {
    transaction_type: 'expense',
    recordId: created.docId,
    amount: 500
  }, userId);
  assert.equal(updated.success, true);
  assert.equal((await fetchAllTransactions(userId))[0].amount, 500);

  const deleted = await executeFirestoreCRUD('delete', {
    transaction_type: 'expense',
    recordId: created.docId
  }, userId);
  assert.equal(deleted.success, true);
  assert.equal((await fetchAllTransactions(userId)).length, 0);
});

test('investment CRUD preserves its goal/company metadata and synchronizes one ledger row', async () => {
  const userId = `crud_${Date.now()}_investment`;
  const created = await executeFirestoreCRUD('create', {
    transaction_type: 'investment',
    amount: 2500,
    category: 'Mutual Fund SIP',
    investmentType: 'Mutual Fund SIP',
    goalId: 'goal_education',
    goalName: 'Education',
    companyName: 'Example AMC',
    symbol: 'EXAMPLE',
    notes: 'Monthly contribution',
    requestId: 'request-investment-1'
  }, userId);

  assert.equal(created.success, true);
  const investment = (await executeFirestoreCRUD('read', { entityType: 'investment' }, userId)).records[0];
  assert.equal(investment.goalId, 'goal_education');
  assert.equal(investment.companyName, 'Example AMC');
  assert.equal((await fetchAllTransactions(userId)).length, 1);

  const updated = await executeFirestoreCRUD('update', {
    entityType: 'investment',
    recordId: created.docId,
    amount: 3000
  }, userId);
  assert.equal(updated.success, true);
  assert.equal((await fetchAllTransactions(userId))[0].amount, 3000);

  const deleted = await executeFirestoreCRUD('delete', {
    entityType: 'investment',
    recordId: created.docId
  }, userId);
  assert.equal(deleted.success, true);
  assert.equal((await fetchAllTransactions(userId)).length, 0);
});

test('goal CRUD rejects deleting goals that still have linked investments', async () => {
  const userId = `crud_${Date.now()}_goal`;
  const goal = await executeFirestoreCRUD('create', {
    entityType: 'goal',
    name: 'Education',
    presentCost: 500000,
    years: 8
  }, userId);
  assert.equal(goal.success, true);

  const investment = await executeFirestoreCRUD('create', {
    transaction_type: 'investment',
    amount: 1200,
    investmentType: 'Mutual Fund SIP',
    goalId: goal.docId,
    goalName: 'Education'
  }, userId);
  assert.equal(investment.success, true);

  const blockedDelete = await executeFirestoreCRUD('delete', {
    entityType: 'goal',
    recordId: goal.docId
  }, userId);
  assert.equal(blockedDelete.success, false);

  await executeFirestoreCRUD('delete', {
    entityType: 'investment',
    recordId: investment.docId
  }, userId);
  const deletedGoal = await executeFirestoreCRUD('delete', {
    entityType: 'goal',
    recordId: goal.docId
  }, userId);
  assert.equal(deletedGoal.success, true);
});

test('voice mutations are previews until explicit confirm-commit', async () => {
  const userId = `crud_${Date.now()}_preview`;
  const preview = await invokeController(conversationalAgent, {
    text: 'Spent 450 rupees on groceries today',
    userId,
    model: 'A',
    autoCommit: false
  });
  assert.equal(preview.body.requires_confirmation, true);
  assert.equal(preview.body.auto_committed, false);
  assert.equal((await fetchAllTransactions(userId)).length, 0);

  const parsedData = { ...preview.body.parsedData, requestId: 'voice-commit-preview-test' };
  const committed = await invokeController(confirmCommit, { parsedData, userId, operation: 'create' });
  assert.equal(committed.statusCode, 200);
  assert.equal(committed.body.committed, true);
  assert.equal((await fetchAllTransactions(userId)).length, 1);

  const repeatedCommit = await invokeController(confirmCommit, { parsedData, userId, operation: 'create' });
  assert.equal(repeatedCommit.body.db_execution.duplicate_prevented, true);
  assert.equal((await fetchAllTransactions(userId)).length, 1);
});

test('voice update and delete requests clarify rather than guessing a record', async () => {
  const userId = `crud_${Date.now()}_ambiguous`;
  const update = await invokeController(conversationalAgent, {
    text: 'Update my grocery expense to 700',
    userId,
    model: 'A',
    autoCommit: false
  });
  assert.equal(update.body.requires_clarification, true);
  assert.deepEqual(update.body.missing_fields, ['recordId']);

  const deletion = await invokeController(conversationalAgent, {
    text: 'Delete my last expense',
    userId,
    model: 'A',
    autoCommit: false
  });
  assert.equal(deletion.body.requires_clarification, true);
  assert.deepEqual(deletion.body.missing_fields, ['recordId']);
  assert.equal((await fetchAllTransactions(userId)).length, 0);
});

test('confirmed voice update/delete mutate only the explicitly identified record', async () => {
  const userId = `crud_${Date.now()}_record_actions`;
  const created = await executeFirestoreCRUD('create', {
    transaction_type: 'expense',
    amount: 450,
    category: 'Groceries'
  }, userId);

  const updatePreview = await invokeController(conversationalAgent, {
    text: `Update record id: ${created.docId} amount to 700`,
    userId,
    model: 'A',
    autoCommit: false
  });
  assert.equal(updatePreview.body.requires_confirmation, true);
  assert.equal((await fetchAllTransactions(userId))[0].amount, 450);

  const update = await invokeController(confirmCommit, {
    parsedData: {
      entityType: 'transaction',
      transaction_type: 'expense',
      recordId: created.docId,
      amount: 700
    },
    userId,
    operation: 'update'
  });
  assert.equal(update.body.committed, true);
  assert.equal((await fetchAllTransactions(userId))[0].amount, 700);

  const deletion = await invokeController(confirmCommit, {
    parsedData: { entityType: 'transaction', transaction_type: 'expense', recordId: created.docId },
    userId,
    operation: 'delete'
  });
  assert.equal(deletion.body.committed, true);
  assert.equal((await fetchAllTransactions(userId)).length, 0);
});

test('voice goal creation previews first and stores a named goal in the goals collection', async () => {
  const userId = `crud_${Date.now()}_goal_preview`;
  const preview = await invokeController(conversationalAgent, {
    text: 'Create a goal for Education with 500000',
    userId,
    model: 'A',
    autoCommit: false
  });
  assert.equal(preview.body.requires_confirmation, true);
  assert.equal(preview.body.parsedData.entityType, 'goal');
  assert.equal(preview.body.parsedData.name, 'Education');

  const committed = await invokeController(confirmCommit, {
    parsedData: { ...preview.body.parsedData, requestId: 'voice-goal-create-1' },
    userId,
    operation: 'create'
  });
  assert.equal(committed.body.committed, true);
  const goals = await executeFirestoreCRUD('read', { entityType: 'goal' }, userId);
  assert.equal(goals.count, 1);
  assert.equal(goals.records[0].name, 'Education');
});
