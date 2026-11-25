import { createWorker } from './worker.js';

import { handleAuth, resolveSession } from './auth.js';
export { AuthSession } from './auth-session.js';

export default createWorker({ resolveIdentity: resolveSession, handleAuth });
