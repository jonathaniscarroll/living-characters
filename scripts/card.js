// card.js — character cards and talk panel

let _selectedCharId = null;
let _spriteInterval = null;
let _spriteAnimator  = null;

function openCard(charId) {
  _selectedCharId = charId;
  const ch = characters.find(c => c.id === charId);
  selectedChar = ch || charId;
  if (!ch) return;
  const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
  const animEl = document.getElementById('card-anim');

  // Clear any previous sprite interval
  if (_spriteInterval) { clearInterval(_spriteInterval); _spriteInterval = null; }
  _spriteAnimator = null;

  if (ch.sprites) {
    // Sprite sheet animation in 'talk' state
    const SpriteAnimator = window.lcSprite && window.lcSprite.SpriteAnimator;
    if (SpriteAnimator) {
      _spriteAnimator = new SpriteAnimator(ch.sprites, ch.animData || ch.photoData);
      _spriteAnimator.setState('talk');
      // Seed the first frame immediately
      const firstSrc = _spriteAnimator.currentSrc();
      animEl.innerHTML = `<img id="card-sprite-img" src="${firstSrc}" alt="${ch.name}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
      _spriteInterval = setInterval(() => {
        const newSrc = _spriteAnimator.tick(250);
        if (newSrc) {
          const img = document.getElementById('card-sprite-img');
          if (img) img.src = newSrc;
        }
      }, 250);
    } else {
      // SpriteAnimator not loaded yet — fall back to static image
      const src = ch.animData || ch.photoData || null;
      animEl.innerHTML = src
        ? `<img src="${src}" alt="${ch.name}" style="max-width:100%;max-height:100%;object-fit:contain;">`
        : '<div class="placeholder">🧸</div>';
    }
  } else if (ch.animData) {
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
  // Stop sprite animation
  if (_spriteInterval) { clearInterval(_spriteInterval); _spriteInterval = null; }
  _spriteAnimator = null;

  // Tell AR view to go idle
  if (window.ARView && typeof window.ARView.setCharacterState === 'function') {
    window.ARView.setCharacterState('idle');
  }

  document.getElementById('card').classList.remove('open');
  _selectedCharId = null;
  selectedChar = null;
  closeTalkPanel();
}

function editSelectedChar() {
  // Capture the ID *before* closeCard() nulls _selectedCharId
  const idToEdit = _selectedCharId;
  if (!idToEdit) return;
  closeCard();
  window.lcModals.openCharModal(idToEdit);
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
