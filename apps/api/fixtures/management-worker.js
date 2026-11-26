import { createWorker } from '../src/worker.js';

// Test-only credentials. This file is not imported by the Wrangler entrypoint.
const testSessions = new Map([['test-alice', 'alice'], ['test-bob', 'bob'], ['test-room-owner', 'room-owner'], ['test-model-owner', 'model-owner']]);
export default createWorker({
  resolveIdentity(request) {
    const authorization = request.headers.get('Authorization');
    const cookie = request.headers.get('Cookie')?.split(';').map(part => part.trim())
      .find(part => part.startsWith('order_room_test='))?.slice('order_room_test='.length);
    const token = authorization ? /^Bearer (.+)$/.exec(authorization)?.[1] : cookie;
    const subject = testSessions.get(token);
    return subject ? { subject } : null;
  },
});
