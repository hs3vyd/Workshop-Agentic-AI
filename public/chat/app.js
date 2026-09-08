const messagesEl = document.querySelector('#messages');
const form = document.querySelector('#form');
const input = document.querySelector('#message');
const provider = document.querySelector('#provider');
const model = document.querySelector('#model');
const history = [];

function addMessage(role, content) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = content;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  addMessage('user', message);
  history.push({ role: 'user', content: message });
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, history: history.slice(0, -1), provider: provider.value, model: model.value.trim() || undefined }) });
    const data = await response.json();
    const reply = data.reply || data.error || 'ไม่สามารถรับคำตอบจากระบบได้';
    addMessage('assistant', reply);
    history.push({ role: 'assistant', content: reply });
  } catch (error) {
    addMessage('assistant', 'เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ กรุณาลองใหม่');
  } finally { button.disabled = false; input.focus(); }
});