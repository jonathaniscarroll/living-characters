// card.js — character card, talk panel, close-up GLB on talk

function openCard(charId) {
  selectedChar = characters.find(c => c.id === charId);
  if (!selectedChar) return;
  const mood = MOODS.find(m => m.label === selectedChar.mood) || MOODS[0];
  const roomIds = selectedChar.roomIds || [selectedChar.roomId];
  const roomNames = roomIds.map(id => rooms.find(r => r.id === id)?.name).filter(Boolean);
  const animEl = document.getElementById('card-anim');
  animEl.innerHTML = '';
  if (selectedChar.animData) {
    const img = document.createElement('img'); img.src = selectedChar.animData; animEl.appendChild(img);
  } else if (selectedChar.photoData) {
    const img = document.createElement('img'); img.src = selectedChar.photoData; animEl.appendChild(img);
  } else {
    animEl.innerHTML = '<div class="placeholder">🧸</div>';
  }
  document.getElementById('card-name').textContent = selectedChar.name;
  document.getElementById('card-location').textContent = roomNames.length ? '📍 ' + roomNames.join(' · ') : '';
  document.getElementById('card-mood-dot').style.background = mood.color;
  document.getElementById('card-mood-text').textContent = mood.emoji + ' ' + mood.label;
  const il = document.getElementById('card-items-list');
  il.innerHTML = '';
  (selectedChar.items || []).forEach(item => {
    const c = document.createElement('div'); c.className = 'item-chip'; c.textContent = item; il.appendChild(c);
  });
  const pl = document.getElementById('card-passage-list');
  pl.innerHTML = '';
  (selectedChar.passages || []).forEach(p => {
    const pt = PROMPT_TYPES.find(t => t.key === p.type) || { label: p.type };
    const b = document.createElement('div');
    b.className = 'dialogue-block';
    b.innerHTML = `<div class="passage-type">${pt.label}</div><div class="passage-text">${p.text || '<em>nothing yet</em>'}</div>`;
    pl.appendChild(b);
  });
  document.getElementById('card').classList.add('open');
}

function closeCard() {
  document.getElementById('card').classList.remove('open');
  selectedChar = null;
}

function editSelectedChar() {
  if (!selectedChar) return;
  closeCard();
  openCharModal(selectedChar.id);
}

function deleteSelectedChar() {
  if (!selectedChar || !confirm('Remove ' + selectedChar.name + '?')) return;
  characters = characters.filter(c => c.id !== selectedChar.id);
  closeCard(); renderMapPins(); updateCompass(); save();
}

function talkToSelectedChar() {
  if (!selectedChar) return;
  const primaryRoomId = (selectedChar.roomIds && selectedChar.roomIds[0]) || selectedChar.roomId;
  if (primaryRoomId && !document.getElementById('room-view').classList.contains('open')) {
    openRoom(primaryRoomId);
    setTimeout(() => {
      openTalkPanel(selectedChar);
      if (window.lcRoom?.spawnTalkCloseUp) window.lcRoom.spawnTalkCloseUp(selectedChar);
    }, 450);
  } else {
    openTalkPanel(selectedChar);
    if (window.lcRoom?.spawnTalkCloseUp) window.lcRoom.spawnTalkCloseUp(selectedChar);
  }
  closeCard();
}

function openTalkPanel(ch) {
  const passages = ch.passages || [];
  document.getElementById('talk-char-name').textContent = ch.name;
  const bubble = document.getElementById('talk-bubble');
  bubble.textContent = 'Tap a prompt below to hear what they say…';
  bubble.className = 'empty';
  const btnsEl = document.getElementById('talk-btns');
  btnsEl.innerHTML = '';
  if (!passages.length) {
    bubble.textContent = ch.name + ' has nothing to say yet. Edit them to add dialogue!';
    bubble.className = '';
  } else {
    passages.forEach(p => {
      const pt = PROMPT_TYPES.find(t => t.key === p.type) || { label: p.type, key: p.type };
      const btn = document.createElement('button');
      btn.className = 'talk-btn';
      btn.textContent = pt.label;
      btn.onclick = () => {
        btnsEl.querySelectorAll('.talk-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bubble.textContent = p.text || '…';
        bubble.className = '';
        pulseMoodRing(ch.id);
      };
      btnsEl.appendChild(btn);
    });
  }
  document.getElementById('talk-panel').classList.add('open');
}

function closeTalkPanel() {
  document.getElementById('talk-panel').classList.remove('open');
  if (window.lcRoom?.dismissTalkCloseUp) window.lcRoom.dismissTalkCloseUp();
}

function pulseMoodRing(charId) {
  if (!threeScene) return;
  threeScene.traverse(obj => {
    if (obj._moodRingCharId === charId) {
      const t0 = performance.now();
      const pulse = () => {
        const t = (performance.now() - t0) / 400;
        if (t > 1) { obj.scale.setScalar(1); return; }
        obj.scale.setScalar(1 + 0.4 * Math.sin(t * Math.PI));
        requestAnimationFrame(pulse);
      };
      pulse();
    }
  });
}

window.lcCard = {
  openCard, closeCard, editSelectedChar, deleteSelectedChar,
  talkToSelectedChar, openTalkPanel, closeTalkPanel, pulseMoodRing
};

export {
  openCard, closeCard, editSelectedChar, deleteSelectedChar,
  talkToSelectedChar, openTalkPanel, closeTalkPanel, pulseMoodRing
};
