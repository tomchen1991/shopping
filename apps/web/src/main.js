import './style.css';
import { startManagement } from './management.js';
import { startPublicRoom } from './room.js';

const apiOrigin = import.meta.env.VITE_API_BASE_URL || '';
const apiUrl = path => (apiOrigin ? new URL(path, apiOrigin).toString() : path);
const status = document.querySelector('#health-status');
const checkButton = document.querySelector('#check-health');

async function checkHealth() {
  checkButton.disabled = true;
  status.textContent = '正在检查 API…';
  status.dataset.state = 'checking';

  try {
    const response = await fetch(apiUrl('/api/health'), {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || (await response.json()).status !== 'ok') {
      throw new Error('Unexpected health response');
    }
    status.textContent = 'API 连接正常';
    status.dataset.state = 'ok';
  } catch {
    status.textContent = '无法连接 API，请重试。';
    status.dataset.state = 'error';
  } finally {
    checkButton.disabled = false;
  }
}

const roomPath = /^\/room(?:\/(.*))?$/.exec(window.location.pathname);
if (roomPath) {
  document.getElementById('management-panel').hidden = true;
  document.querySelector('.health').hidden = true;
  void startPublicRoom(apiUrl, roomPath[1] ?? '');
} else {
  checkButton.addEventListener('click', checkHealth);
  void checkHealth();
  startManagement(apiUrl);
}
