/**
 * globals.js  —  single source of truth for all shared mutable state
 *
 * Loaded as a plain (non-module) <script> BEFORE any module scripts so that
 * every module can read/write the same live arrays via window.*
 *
 * Modules should access state as:
 *   const characters = window.characters;
 *   window.characters.push(...);
 *   window.save();
 *
 * Or just reference the bare name — since this is a non-module script the
 * declarations land on window automatically.
 */

// ── Shared mutable state ────────────────────────────────────────────────────
var characters   = [];
var rooms        = [];
var objects      = [];
var map          = null;          // Leaflet map instance, set by initMap()
var facilitatorMode = true;
var activeRoomId    = null;
var userLat = null, userLng = null;
var gpsWatchId = null;
var simActive  = false;
var simInterval = null;
var editingCharId = null;
var editingRoomId = null;

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

// ── localStorage persistence ─────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem('lc_rooms', JSON.stringify(rooms));
    // Strip large binary blobs before writing chars — GitHub URLs survive
    const slimChars = characters.map(function(ch) {
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
    if (r) { var parsed = JSON.parse(r); rooms.length = 0; parsed.forEach(function(x){ rooms.push(x); }); }
    if (c) { var parsed2 = JSON.parse(c); characters.length = 0; parsed2.forEach(function(x){ characters.push(x); }); }
    if (o) { var parsed3 = JSON.parse(o); objects.length = 0; parsed3.forEach(function(x){ objects.push(x); }); }
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

// ── Bootstrap: load persisted data, then init map once DOM is ready ──────────
document.addEventListener('DOMContentLoaded', function() {
  // Restore saved GitHub token to the input
  var savedToken = localStorage.getItem('lc_gh_token');
  if (savedToken) {
    var inp = document.getElementById('gh-token-input');
    if (inp) inp.value = savedToken;
  }

  load();

  // initMap is defined by map.js (module). Modules execute after non-module
  // scripts but before DOMContentLoaded fires in the same tick, so
  // window.lcMap should already be populated. We call via the namespace.
  if (window.lcMap && window.lcMap.initMap) {
    window.lcMap.initMap();
  } else {
    // Fallback: wait one more tick for the modules to finish registering
    setTimeout(function() {
      window.lcMap && window.lcMap.initMap && window.lcMap.initMap();
    }, 0);
  }
});
