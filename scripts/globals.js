/**
 * globals.js  —  single source of truth for all shared mutable state
 *
 * Loaded as a plain (non-module) <script> BEFORE any module scripts so that
 * every module can read/write the same live arrays via window.*
 */

// ── Shared mutable state ────────────────────────────────────────────────────
var characters      = [];
var rooms           = [];
var objects         = [];
var map             = null;   // Leaflet map instance
var facilitatorMode = true;
var activeRoomId    = null;
var selectedChar    = null;   // currently open character card
var userLat = null, userLng = null;
var gpsWatchId  = null;
var simActive   = false;
var simInterval = null;
var editingCharId = null;
var editingRoomId = null;
var editingObjId  = null;

// ── Temp upload buffers (modals.js writes, saveCharacter/saveRoom reads) ──────
var tempPhotoData   = null;
var tempAnimData    = null;
var tempBackdropData = null;
var tempBackdropUrl  = undefined;

// ── Three.js scene state ──────────────────────────────────────────────────
var threeScene       = null;
var threeRenderer    = null;
var threeCamera      = null;
var threeAnimFrameId = null;
var glbMixers        = [];

// ── Mood definitions ─────────────────────────────────────────────────────────
var MOODS = [
  { label: 'Happy',      color: '#FFD700', emoji: '😊' },
  { label: 'Sad',        color: '#6495ED', emoji: '😢' },
  { label: 'Angry',      color: '#FF4500', emoji: '😠' },
  { label: 'Scared',     color: '#9370DB', emoji: '😨' },
  { label: 'Excited',    color: '#FF69B4', emoji: '🤩' },
  { label: 'Curious',    color: '#20B2AA', emoji: '🤔' },
  { label: 'Mysterious', color: '#708090', emoji: '🕵️' },
  { label: 'Friendly',   color: '#32CD32', emoji: '🤗' },
];

var DEFAULT_GLB_URL = 'https://raw.githubusercontent.com/jonathaniscarroll/living-characters/main/assets/default-character.glb';

// ── Room scene colour tables ────────────────────────────────────────────────────
var FLOOR_COLORS = {
  grass:  '#2d5a27',
  forest: '#1a3a1a',
  wood:   '#8b6914',
  stone:  '#696969',
};

var WALL_COLORS = {
  grass:  '#3a7a32',
  forest: '#2d5a27',
  wood:   '#a0522d',
  stone:  '#808080',
};

// ── Dialogue prompt types ───────────────────────────────────────────────────
var PROMPT_TYPES = [
  { key: 'hello',    label: '👋 Hello',    placeholder: 'What do they say first?',           hint: 'Shown when you first meet this character.' },
  { key: 'question', label: '❓ Question', placeholder: 'What question do they ask you?',      hint: 'An open question for visitors to think about.' },
  { key: 'secret',   label: '🤫 Secret',   placeholder: 'What secret do they share?',          hint: 'Shown after a short pause — feels special.' },
  { key: 'farewell', label: '👋 Farewell',  placeholder: 'What do they say when you leave?',   hint: 'Shown when the visitor closes the card.' },
  { key: 'item',     label: '🎒 Item story', placeholder: 'Tell me about one of your items…', hint: 'Shown when tapping an item in the inventory.' },
];

// scratch var used by room.js handleRoomTap closure
var charsInRoom = [];

// ── localStorage persistence ─────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem('lc_rooms', JSON.stringify(rooms));
    // Strip binary blobs — large assets are already uploaded to GitHub as URLs.
    var slimChars = characters.map(function(ch) {
      var slim = Object.assign({}, ch);
      delete slim.photoData;
      delete slim.animData;
      delete slim.sprites;
      return slim;
    });
    localStorage.setItem('lc_chars', JSON.stringify(slimChars));
    localStorage.setItem('lc_objects', JSON.stringify(objects));
  } catch (e) {
    console.warn('lc: localStorage save failed', e);
  }
}

function load() {
  try {
    var r = localStorage.getItem('lc_rooms');
    var c = localStorage.getItem('lc_chars');
    var o = localStorage.getItem('lc_objects');
    if (r) { var pr = JSON.parse(r); rooms.length = 0; pr.forEach(function(x){ rooms.push(x); }); }
    if (c) { var pc = JSON.parse(c); characters.length = 0; pc.forEach(function(x){ characters.push(x); }); }
    if (o) { var po = JSON.parse(o); objects.length = 0; po.forEach(function(x){ objects.push(x); }); }
  } catch (e) {
    console.warn('lc: localStorage load failed', e);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 3000);
}

// ── Global wrappers for module functions called as bare names ─────────────────
function renderMapPins() {
  if (window.lcMap && window.lcMap.renderMapPins) window.lcMap.renderMapPins();
}
function updateCompass() {
  if (window.lcMap && window.lcMap.updateCompass) window.lcMap.updateCompass();
}
function openCard(id) {
  if (window.lcCard && window.lcCard.openCard) window.lcCard.openCard(id);
}
function closeCard() {
  if (window.lcCard && window.lcCard.closeCard) window.lcCard.closeCard();
}
function openRoom(id) {
  if (window.lcRoom && window.lcRoom.openRoom) window.lcRoom.openRoom(id);
}
function closeRoom() {
  if (window.lcRoom && window.lcRoom.closeRoom) window.lcRoom.closeRoom();
}
function closeTalkPanel() {
  if (window.lcCard && window.lcCard.closeTalkPanel) window.lcCard.closeTalkPanel();
}
function openTalkPanel(ch) {
  if (window.lcCard && window.lcCard.openTalkPanel) window.lcCard.openTalkPanel(ch);
}
function buildRoomScene(room) {
  if (window.lcRoom && window.lcRoom.buildRoomScene) window.lcRoom.buildRoomScene(room);
}
function openCharModal(charId) {
  if (window.lcModals && window.lcModals.openCharModal) window.lcModals.openCharModal(charId);
}
function openRoomModal(roomId) {
  if (window.lcModals && window.lcModals.openRoomModal) window.lcModals.openRoomModal(roomId);
}
function openObjModal(objId) {
  // room.js has its own openObjModal that takes priority; fall back to modals.js
  if (window.lcRoom && window.lcRoom.openObjModal) window.lcRoom.openObjModal(objId);
  else if (window.lcModals && window.lcModals.openObjModal) window.lcModals.openObjModal(objId);
}
function togglePromptPill(btn) {
  if (window.lcModals && window.lcModals.togglePromptPill) window.lcModals.togglePromptPill(btn);
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var savedToken = localStorage.getItem('lc_gh_token');
  if (savedToken) {
    var inp = document.getElementById('gh-token-input');
    if (inp) inp.value = savedToken;
  }

  load();

  if (window.lcMap && window.lcMap.initMap) {
    window.lcMap.initMap();
  } else {
    setTimeout(function() {
      window.lcMap && window.lcMap.initMap && window.lcMap.initMap();
    }, 0);
  }
});
