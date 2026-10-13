const installButton = document.querySelector('#install-app');
const installStatus = document.querySelector('#install-status');
const networkStatus = document.querySelector('#network-status');
let installPrompt;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function showInstallStatus() {
  installStatus.textContent = standalone() ? '설치형 화면으로 사용 중입니다. 기기 승인은 별도입니다.' : '브라우저에서 사용 중입니다.';
}
function showNetworkStatus() {
  networkStatus.textContent = navigator.onLine
    ? '네트워크 연결이 감지됐습니다. 실제 서버 접근은 요청 결과로 확인합니다.'
    : '오프라인입니다. 자료 읽기·수정은 연결 후 가능합니다.';
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event; installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installButton.disabled = true;
  try { await installPrompt.prompt(); await installPrompt.userChoice; }
  finally { installPrompt = null; installButton.hidden = true; installButton.disabled = false; }
});
window.addEventListener('appinstalled', () => {
  installPrompt = null; installButton.hidden = true;
  installStatus.textContent = '앱이 설치됐습니다. 기기 등록·승인은 별도로 확인해야 합니다.';
});
window.addEventListener('online', showNetworkStatus);
window.addEventListener('offline', showNetworkStatus);
showInstallStatus(); showNetworkStatus();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {
    networkStatus.textContent += ' 오프라인 안내 준비에 실패했습니다.';
  });
}
