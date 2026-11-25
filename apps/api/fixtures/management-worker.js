import { createWorker } from '../src/worker.js';

// Test-only credentials. This file is not imported by the Wrangler entrypoint.
const testSessions = new Map([['Bearer test-alice', 'alice'], ['Bearer test-bob', 'bob']]);
export default createWorker({
  resolveIdentity(request) {
    const subject = testSessions.get(request.headers.get('Authorization'));
    return subject ? { subject } : null;
  },
});
