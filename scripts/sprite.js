/**
 * scripts/sprite.js
 * Sprite frame animator for living-characters billboard system.
 * No external dependencies. Exposed as window.SpriteAnimator.
 */

const FPS = { idle: 1, walk: 4, talk: 3, listen: 2 };
const STATES = ['idle', 'walk', 'talk', 'listen'];

class SpriteAnimator {
  /**
   * @param {{ idle?: string[], walk?: string[], talk?: string[], listen?: string[] }} sprites
   * @param {string|null} fallbackSrc  single image dataUrl/URL used if no sprite frames exist
   */
  constructor(sprites, fallbackSrc) {
    this._sprites = sprites || {};
    this._fallback = fallbackSrc || null;
    this._state = 'idle';
    this._elapsed = 0;
    this._lastFrame = null;

    this._activeState = this._resolveState('idle');
    this._lastFrame = this._frameAt(0);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Switch animation state. Resets elapsed timer.
   * @param {'idle'|'walk'|'talk'|'listen'} state
   */
  setState(state) {
    if (this._state === state) return;
    this._state = state;
    this._elapsed = 0;
    this._activeState = this._resolveState(state);
    this._lastFrame = this._frameAt(0);
  }

  /**
   * Advance the animation by deltaMs milliseconds.
   * @param {number} deltaMs
   * @returns {string|null} current dataUrl if the frame changed this tick, else null
   */
  tick(deltaMs) {
    const frames = this._activeFrames();
    if (!frames || frames.length === 0) return null;

    if (frames.length === 1) {
      const f = frames[0];
      if (f !== this._lastFrame) { this._lastFrame = f; return f; }
      return null;
    }

    const fps = FPS[this._activeState] || 1;
    const frameDuration = 1000 / fps;
    const prevIndex = Math.floor(this._elapsed / frameDuration) % frames.length;

    this._elapsed += deltaMs;

    const nextIndex = Math.floor(this._elapsed / frameDuration) % frames.length;
    const newFrame = frames[nextIndex];

    if (nextIndex !== prevIndex || newFrame !== this._lastFrame) {
      this._lastFrame = newFrame;
      return newFrame;
    }
    return null;
  }

  /**
   * Returns the current frame dataUrl regardless of whether it changed.
   * @returns {string|null}
   */
  currentFrame() {
    return this._lastFrame;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  _resolveState(desired) {
    if (this._sprites[desired] && this._sprites[desired].length > 0) return desired;
    for (const s of STATES) {
      if (this._sprites[s] && this._sprites[s].length > 0) return s;
    }
    return null;
  }

  _activeFrames() {
    if (this._activeState && this._sprites[this._activeState]?.length > 0) {
      return this._sprites[this._activeState];
    }
    if (this._fallback) return [this._fallback];
    return null;
  }

  _frameAt(index) {
    const frames = this._activeFrames();
    if (!frames || frames.length === 0) return null;
    return frames[index % frames.length];
  }
}

// ---------------------------------------------------------------------------
// Expose globally
// ---------------------------------------------------------------------------

window.SpriteAnimator = SpriteAnimator;
