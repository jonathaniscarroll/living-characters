// card.js — character cards and talk panel

let _selectedCharId = null;

function openCard(charId) {
  _selectedCharId = charId;
  // AR (and anything else reading window.selectedChar) needs the full object,
  // not just the id string. Keep the id assignment as a fallback for legacy callers.
  const ch = characters.find(c => c.id === charId);
  selectedChar = ch || charId;
  if (!ch) return;
  const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
  const animEl = document.getElementById('card-anim');
  if (ch.animData) {
    animEl.innerHTML = `<img src="${ch.animData}" alt="${ch.name} animation" style="max-width:100%;max-height:100%;object-fit:contain;">`;
  } else if (ch.photoData) {
    animEl.innerHTML = `<img src="${ch.photoData}" alt="${ch.name}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
  } else {
    animEl.innerHTML = '<div class="placeholder">🧸</div>';
  }
  document.getElementById('card-name').textContent = ch.name;

  // Show scheduled location
  const activeRoomId = window.lcMap ? window.lcMap.getActiveRoomId(ch) : ((ch.roomIds && ch.roomIds[0]) || ch.roomId);
  const room = rooms.find(r => r.id === activeRoomId);
  const isHome = activeRoomId === ch.homeRoomId;
  const isWork = activeRoomId === ch.workRoomId;
  const contextLabel = isHome ? ' 🏠' : isWork ? ' 💼' : '';
  document.getElementById('card-location').textContent = (room ? room.name : '') + contextLabel;

  document.getElementById('card-mood-dot').style.background = mood.color;
  document.getElementById('card-mood-text').textContent = mood.emoji + ' ' + mood.label;
  const itemsList = document.getElementById('card-items-list');
  itemsList.innerHTML = (ch.items || []).map(it => `<span class="item-chip">${it}</span>`).join('');

  // Build dialogue — surface home/work passage first if contextually appropriate
  const passList = document.getElementById('card-passage-list');
  passList.innerHTML = '';
  const contextType = isHome ? 'home' : isWork ? 'work' : null;
  const orderedPassages = [...(ch.passages || [])];
  if (contextType) {
    // Bubble the context passage to the top
    const ctxIdx = orderedPassages.findIndex(p => p.type === contextType);
    if (ctxIdx > 0) {
      const [ctx] = orderedPassages.splice(ctxIdx, 1);
      orderedPassages.unshift(ctx);
    }
  }
  orderedPassages.forEach(p => {
    if (!p.text) return;
    const block = document.createElement('div');
    block.className = 'dialogue-block';
    block.innerHTML = `<div class="passage-type">${p.type}</div><div class="passage-text">${p.text}</div>`;
    passList.appendChild(block);
  });

  document.getElementById('card').classList.add('open');
}

function closeCard() {
  document.getElementById('card').classList.remove('open');
  _selectedCharId = null;
  selectedChar = null;
  closeTalkPanel();
}

function editSelectedChar() {
  if (!_selectedCharId) return;
  closeCard();
  window.lcModals.openCharModal(_selectedCharId);
}

function deleteSelectedChar() {
  if (!_selectedCharId) return;
  if (!confirm('Remove this character?')) return;
  characters = characters.filter(c => c.id !== _selectedCharId);
  closeCard();
  window.renderMapPins();
  window.save();
}

function talkToSelectedChar() {
  const ch = characters.find(c => c.id === _selectedCharId);
  if (!ch) return;
  openTalkPanel(ch);
}

function openTalkPanel(ch) {
  document.getElementById('talk-char-name').textContent = ch.name;
  const bubble = document.getElementById('talk-bubble');
  bubble.textContent = 'Tap a prompt below to hear what they say…';
  bubble.className = 'empty';
  const btns = document.getElementById('talk-btns');
  btns.innerHTML = '';

  // Determine context for this character right now
  const activeRoomId = window.lcMap ? window.lcMap.getActiveRoomId(ch) : ((ch.roomIds && ch.roomIds[0]) || ch.roomId);
  const isHome = activeRoomId === ch.homeRoomId;
  const isWork = activeRoomId === ch.workRoomId;
  const contextType = isHome ? 'home' : isWork ? 'work' : null;

  const passages = (ch.passages || []).filter(p => p.text);
  passages.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'talk-btn' + (p.type === contextType ? ' active' : '');
    btn.textContent = p.type.replace(/-/g, ' ');
    btn.onclick = () => {
      bubble.textContent = p.text;
      bubble.className = '';
      btns.querySelectorAll('.talk-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    btns.appendChild(btn);
  });

  // If there's a context-appropriate passage, auto-show it
  if (contextType) {
    const ctxPassage = passages.find(p => p.type === contextType);
    if (ctxPassage) {
      bubble.textContent = ctxPassage.text;
      bubble.className = '';
    }
  }

  document.getElementById('talk-panel').classList.add('open');
}

function closeTalkPanel() {
  document.getElementById('talk-panel').classList.remove('open');
}

function pulseMoodRing(charId) {
  // future: animate the mood ring for a specific character pin
}

window.lcCard = { openCard, closeCard, editSelectedChar, deleteSelectedChar, talkToSelectedChar, openTalkPanel, closeTalkPanel, pulseMoodRing };
export { openCard, closeCard, editSelectedChar, deleteSelectedChar, talkToSelectedChar, openTalkPanel, closeTalkPanel, pulseMoodRing };
