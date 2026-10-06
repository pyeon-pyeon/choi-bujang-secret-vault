// Project URL과 publishable key만 공개합니다. 서버 전용 키는 사용하지 않습니다.
const PROJECT_URL = 'https://bggmpuwdrkrqqglduvlp.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_dPdvN9lFoONAF7STrbWziA_12SYfsrX';
const form = document.querySelector('#login-form');
const email = document.querySelector('#login-email');
const password = document.querySelector('#login-password');
const login = document.querySelector('#login-button');
const logout = document.querySelector('#logout-button');
const status = document.querySelector('#auth-status');
const message = document.querySelector('#auth-message');

const list = document.querySelector('#notes');
let loadVersion = 0;
let currentSession = null;
let sdk;
const noteForm = document.querySelector('#note-form');
const noteMessage = document.querySelector('#note-message');
async function noteRequest(path, method, body) {
  const { data, error } = await sdk.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('다시 로그인하세요.');
  const response = await fetch(path, {
    method, cache: 'no-store', headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`자료 요청 실패 (HTTP ${response.status})`);
  return response.json();
}

async function loadNotes(session) {
  const version = ++loadVersion;
  list.replaceChildren();
  const notice = (text) => {
    const item = document.createElement('li');
    item.textContent = text;
    list.replaceChildren(item);
  };
  if (!session?.access_token) { notice('로그인 후 자료를 불러옵니다.'); return; }
  notice('자료를 불러오는 중입니다.');
  try {
    const result = await fetch('/api/notes', {
      cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (version !== loadVersion) return;
    if (!result.ok) throw new Error(result.status === 401 ? '로그인 검증에 실패했습니다. 다시 로그인하세요.' : '자료를 불러올 수 없습니다.');
    const data = await result.json();
    if (version !== loadVersion) return;
    if (!Array.isArray(data)) throw new Error('자료 형식이 맞지 않습니다.');
    if (!data.length) { notice('등록된 가상 메모가 없습니다.'); return; }
    list.replaceChildren(...data.map(note => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      const content = document.createElement('span');
      title.textContent = note.title; content.textContent = note.body;
      item.append(title, content);
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '수정';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제';
      edit.addEventListener('click', async () => {
        edit.disabled = true;
        try {
          const latest = await noteRequest(`/api/notes/${note.id}`, 'GET');
          const newTitle = window.prompt('제목', latest.title); if (newTitle === null) return;
          const newBody = window.prompt('내용', latest.body); if (newBody === null) return;
          await noteRequest(`/api/notes/${note.id}`, 'PUT', { title: newTitle, body: newBody });
          noteMessage.textContent = '수정했습니다.'; await loadNotes(currentSession);
        } catch (error) { noteMessage.textContent = error.message; }
        finally { edit.disabled = false; }
      });
      remove.addEventListener('click', async () => {
        if (!window.confirm('이 가상 메모를 삭제할까요?')) return;
        remove.disabled = true;
        try { await noteRequest(`/api/notes/${note.id}`, 'DELETE'); noteMessage.textContent = '삭제했습니다.'; await loadNotes(currentSession); }
        catch (error) { noteMessage.textContent = error.message; }
        finally { remove.disabled = false; }
      });
      item.append(edit, remove); return item;
    }));
  } catch (error) { if (version === loadVersion) notice(error.message); }
}

let busy = false;
let signedIn = false;
function render(session) {
  currentSession = session;
  signedIn = Boolean(session?.user);
  noteForm.hidden = !signedIn;
  if (!signedIn) { noteForm.reset(); noteMessage.textContent = ''; }
  form.hidden = signedIn;
  logout.hidden = !signedIn;
  status.textContent = signedIn ? '로그인되었습니다.' : '로그아웃 상태입니다.';
  login.disabled = busy;
  logout.disabled = busy;
  if (signedIn) password.value = '';
  void loadNotes(session);
}
function setBusy(value) {
  busy = value;
  login.disabled = value;
  logout.disabled = value;
  email.disabled = value;
  password.disabled = value;
}
function showError(prefix, error) {
  // textContent로만 표시하며 입력값·세션·JWT를 출력하지 않습니다.
  message.textContent = `${prefix}: ${error?.message || '네트워크 연결을 확인하고 다시 시도하세요.'}`;
}

try {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.117.2');
  const supabase = createClient(PROJECT_URL, PUBLISHABLE_KEY);
  sdk = supabase;
  // 세션 보관·갱신과 로그인 상태 복원은 SDK에 맡깁니다.
  supabase.auth.onAuthStateChange((_event, session) => render(session));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || signedIn) return;
    setBusy(true);
    message.textContent = '로그인 중입니다.';
    try {
      const pending = supabase.auth.signInWithPassword({
        email: email.value.trim(), password: password.value,
      });
      password.value = '';
      const { data, error } = await pending;
      if (error) showError('로그인 실패', error);
      else {
        render(data.session);
        message.textContent = '로그인에 성공했습니다.';
      }
    } catch (error) { showError('로그인 실패', error); }
    finally { password.value = ''; setBusy(false); }
  });

  logout.addEventListener('click', async () => {
    if (busy || !signedIn) return;
    setBusy(true);
    message.textContent = '로그아웃 중입니다.';
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) showError('로그아웃 실패', error);
      else { render(null); message.textContent = '로그아웃되었습니다.'; }
    } catch (error) { showError('로그아웃 실패', error); }
    finally { setBusy(false); }
  });
} catch {
  status.textContent = '로그인 기능을 불러오지 못했습니다.';
  message.textContent = '네트워크 연결을 확인하고 페이지를 새로고침하세요.';
  login.disabled = true;
  logout.disabled = true;
}

noteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = noteForm.querySelector('button'); button.disabled = true;
  try {
    await noteRequest('/api/notes', 'POST', {
      title: document.querySelector('#note-title').value,
      body: document.querySelector('#note-body').value,
    });
    noteForm.reset(); noteMessage.textContent = '추가했습니다.';
    await loadNotes(currentSession);
  } catch (error) { noteMessage.textContent = error.message; }
  finally { button.disabled = false; }
});
