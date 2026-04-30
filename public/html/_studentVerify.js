// ══════════════════════════════════════════════════════════════════════════
// Vibe — student .edu verification flow
//
// Shared modal that walks the user through three states:
//   1. enter .edu email
//   2. "we sent a link" + demo "i clicked the link" button
//   3. verified — school unlocked, campus tab open
//
// Persists to vibe_user_v1.studentVerification = { status, email, school, ts }
// Dispatches a 'vibeStudentVerified' event on success so pages can refresh UI.
// Requires _persistence.js (vibeLoad / vibeSave) loaded first.
// ══════════════════════════════════════════════════════════════════════════

(function studentVerifyInit(){

  // ── .edu domain → school name lookup ───────────────────────────────────
  // Common US schools first; falls back to a clean derivation.
  const SCHOOL_LOOKUP = {
    'iu.edu':         'Indiana University',
    'indiana.edu':    'Indiana University',
    'stanford.edu':   'Stanford University',
    'mit.edu':        'MIT',
    'berkeley.edu':   'UC Berkeley',
    'harvard.edu':    'Harvard University',
    'yale.edu':       'Yale University',
    'princeton.edu':  'Princeton University',
    'columbia.edu':   'Columbia University',
    'cornell.edu':    'Cornell University',
    'upenn.edu':      'University of Pennsylvania',
    'nyu.edu':        'NYU',
    'ucla.edu':       'UCLA',
    'usc.edu':        'USC',
    'umich.edu':      'University of Michigan',
    'illinois.edu':   'University of Illinois',
    'utexas.edu':     'University of Texas at Austin',
    'wisc.edu':       'University of Wisconsin',
    'cmu.edu':        'Carnegie Mellon University',
    'gatech.edu':     'Georgia Tech',
    'duke.edu':       'Duke University',
    'northwestern.edu':'Northwestern University',
    'uchicago.edu':   'University of Chicago',
    'brown.edu':      'Brown University',
    'dartmouth.edu':  'Dartmouth College'
  };
  function deriveSchool(domain) {
    const d = domain.toLowerCase();
    if (SCHOOL_LOOKUP[d]) return SCHOOL_LOOKUP[d];
    // Fallback: take the bit before .edu, capitalize, prefix "University"
    const root = d.replace(/\.edu$/, '').split('.').slice(-1)[0];
    return root.charAt(0).toUpperCase() + root.slice(1) + ' University';
  }

  // ── Status helpers (read from vibe_user_v1) ────────────────────────────
  function _user() { return (typeof vibeLoad === 'function') ? vibeLoad('vibe_user_v1') : null; }
  function getStatus() {
    const u = _user();
    return u?.studentVerification?.status || 'unverified';
  }
  function isVerified() { return getStatus() === 'verified'; }
  function getSchool() {
    const u = _user();
    return u?.studentVerification?.school || null;
  }
  function getEmail() {
    const u = _user();
    return u?.studentVerification?.email || null;
  }

  function setVerified(email, school) {
    const u = _user() || {};
    u.studentVerification = { status: 'verified', email, school, ts: Date.now() };
    if (typeof vibeSave === 'function') vibeSave('vibe_user_v1', u);
    document.dispatchEvent(new CustomEvent('vibeStudentVerified', {
      detail: { email, school }
    }));
  }

  // For debugging / fresh-onboarded testing
  function clearVerification() {
    const u = _user();
    if (!u) return;
    delete u.studentVerification;
    if (typeof vibeSave === 'function') vibeSave('vibe_user_v1', u);
    document.dispatchEvent(new CustomEvent('vibeStudentVerified', { detail: null }));
  }

  // ── Modal styles (injected once) ───────────────────────────────────────
  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      @keyframes svBackdropIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes svModalIn    { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes svPulse      { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.08); opacity: 1; } }
      @keyframes svSpinSlow   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes svRingBreathe { 0%,100% { transform: scale(1); opacity: .35; } 50% { transform: scale(1.5); opacity: 0; } }

      #svBackdrop {
        position: fixed; inset: 0; z-index: 9998;
        background: rgba(20,20,22,.5); backdrop-filter: blur(3px);
        display: flex; align-items: center; justify-content: center;
        animation: svBackdropIn .2s ease-out;
        font-family: 'DM Sans', sans-serif;
      }
      #svModal {
        background: white; border-radius: 18px;
        width: 440px; max-width: 92vw; max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 24px 64px rgba(0,0,0,.28);
        animation: svModalIn .25s cubic-bezier(.2,.8,.2,1);
        position: relative;
      }
      #svModal .sv-close {
        position: absolute; top: 14px; right: 16px;
        width: 28px; height: 28px; border-radius: 50%;
        background: rgba(28,28,30,.05); border: none;
        font-size: 16px; color: #8A8580; cursor: none;
        display: flex; align-items: center; justify-content: center;
        line-height: 1; transition: all .15s;
        font-family: 'DM Sans', sans-serif;
      }
      #svModal .sv-close:hover { background: rgba(28,28,30,.1); color: #1C1C1E; }

      #svModal .sv-body { padding: 36px 32px 28px; text-align: center; }
      #svModal .sv-icon-wrap {
        width: 64px; height: 64px; border-radius: 18px;
        margin: 0 auto 20px;
        display: flex; align-items: center; justify-content: center;
        position: relative;
      }
      #svModal .sv-icon-wrap.coral { background: linear-gradient(135deg, #FFE5DB, #FFD0BD); }
      #svModal .sv-icon-wrap.purple { background: linear-gradient(135deg, #E8DEFF, #D5C5FF); }
      #svModal .sv-icon-wrap.green  { background: linear-gradient(135deg, #D5F5E3, #A9DFBF); }
      #svModal .sv-icon-wrap .sv-pulse-ring {
        position: absolute; inset: 0; border-radius: 18px;
        border: 1.5px solid #FF5C35;
        animation: svRingBreathe 2.4s ease-out infinite;
      }
      #svModal .sv-icon-wrap.green .sv-pulse-ring { border-color: #2ECC71; }

      #svModal h2 {
        font-family: 'Fraunces', serif; font-size: 24px; font-weight: 900;
        color: #1C1C1E; letter-spacing: -.5px; line-height: 1.2;
        margin-bottom: 10px;
      }
      #svModal .sv-sub {
        font-size: 14px; color: #5A5550; line-height: 1.6;
        max-width: 340px; margin: 0 auto 22px;
      }
      #svModal .sv-sub strong { color: #1C1C1E; font-weight: 600; }

      #svModal .sv-input-wrap { margin-bottom: 16px; text-align: left; }
      #svModal .sv-input {
        width: 100%; padding: 13px 16px;
        border: 1px solid rgba(28,28,30,.12); border-radius: 12px;
        background: #FAF7F2; font-family: 'DM Sans', sans-serif;
        font-size: 14px; color: #1C1C1E;
        transition: all .15s;
      }
      #svModal .sv-input:focus { outline: none; border-color: #FF5C35; background: white; }
      #svModal .sv-input.error { border-color: #FF5C35; background: #FFF0EC; }
      #svModal .sv-error {
        font-size: 12px; color: #FF5C35; margin-top: 8px; padding: 0 4px;
        display: none; text-align: left;
      }
      #svModal .sv-error.show { display: block; }

      #svModal .sv-btn-primary {
        width: 100%; padding: 13px;
        background: #1C1C1E; color: white;
        border: none; border-radius: 100px;
        font-family: 'DM Sans', sans-serif;
        font-size: 14px; font-weight: 600; cursor: none;
        transition: all .15s;
      }
      #svModal .sv-btn-primary:hover { background: #FF5C35; }
      #svModal .sv-btn-primary:disabled { background: rgba(28,28,30,.15); cursor: none; }
      #svModal .sv-btn-primary.coral { background: #FF5C35; }
      #svModal .sv-btn-primary.coral:hover { background: #ff7055; }
      #svModal .sv-btn-primary.green { background: #2ECC71; }
      #svModal .sv-btn-primary.green:hover { background: #27AE60; }

      #svModal .sv-btn-ghost {
        background: none; border: none; color: #8A8580;
        font-family: 'DM Sans', sans-serif; font-size: 12.5px;
        font-weight: 500; cursor: none; margin-top: 14px;
        padding: 6px 12px; transition: color .15s;
      }
      #svModal .sv-btn-ghost:hover { color: #1C1C1E; }

      #svModal .sv-microcopy {
        font-size: 11.5px; color: #8A8580; line-height: 1.55;
        margin-top: 16px; padding: 0 8px;
      }
      #svModal .sv-microcopy strong { color: #FF5C35; font-weight: 600; }

      #svModal .sv-school-pill {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 14px; background: #FAF7F2;
        border-radius: 100px; margin: 0 auto 22px;
        font-size: 13px; color: #1C1C1E; font-weight: 500;
      }
      #svModal .sv-school-pill .sv-pill-dot {
        width: 7px; height: 7px; border-radius: 50%; background: #2ECC71;
        box-shadow: 0 0 6px #2ECC71;
        animation: svPulse 2s ease-in-out infinite;
      }
      #svModal .sv-school-pill strong { font-weight: 700; }

      #svModal .sv-envelope-anim {
        font-size: 32px; line-height: 1; animation: svPulse 2.4s ease-in-out infinite;
      }
      #svModal .sv-cap-icon { font-size: 30px; }

      /* Cursor support for cursor-none pages */
      #svBackdrop, #svModal, #svModal * { cursor: none !important; }
      #svModal input { cursor: text !important; }
    `;
    document.head.appendChild(s);
  }

  // ── Cursor binding (for pages with custom cursor) ──────────────────────
  function bindCursor(root) {
    const c = document.getElementById('cursor');
    const r = document.getElementById('cursorRing');
    if (!c || !r) return;
    root.querySelectorAll('button, input, a').forEach(el => {
      if (el._svCursorBound) return;
      el._svCursorBound = true;
      el.addEventListener('mouseenter', () => { c.classList.add('hover'); r.classList.add('hover'); });
      el.addEventListener('mouseleave', () => { c.classList.remove('hover'); r.classList.remove('hover'); });
    });
  }

  // ── Modal lifecycle ────────────────────────────────────────────────────
  let backdrop = null;
  let pendingEmail = null;
  let pendingSchool = null;

  function open() {
    if (document.getElementById('svBackdrop')) return;
    injectStyles();
    backdrop = document.createElement('div');
    backdrop.id = 'svBackdrop';
    backdrop.innerHTML = `<div id="svModal" role="dialog" aria-modal="true"><button class="sv-close" aria-label="Close">×</button><div class="sv-content"></div></div>`;
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.sv-close').onclick = close;
    document.body.appendChild(backdrop);
    renderState1();
    document.addEventListener('keydown', escClose);
  }

  function close() {
    backdrop?.remove(); backdrop = null;
    pendingEmail = null; pendingSchool = null;
    document.removeEventListener('keydown', escClose);
  }

  function escClose(e) { if (e.key === 'Escape') close(); }

  function setContent(html) {
    if (!backdrop) return;
    const c = backdrop.querySelector('.sv-content');
    c.innerHTML = html;
    bindCursor(backdrop);
  }

  // ── State 1 — enter .edu email ─────────────────────────────────────────
  function renderState1() {
    setContent(`
      <div class="sv-body">
        <div class="sv-icon-wrap coral">
          <div class="sv-pulse-ring"></div>
          <span class="sv-cap-icon">🎓</span>
        </div>
        <h2>Verify your student status</h2>
        <p class="sv-sub">Unlock your campus tab — events, jobs, clubs, and people from your school. We'll match the .edu domain to your school automatically.</p>

        <div class="sv-input-wrap">
          <input class="sv-input" id="svEmail" type="email" placeholder="your.name@school.edu" autocomplete="email" autofocus>
          <div class="sv-error" id="svEmailError">That doesn't look like a .edu address.</div>
        </div>

        <button class="sv-btn-primary" id="svSendBtn">Send verification link</button>

        <div class="sv-microcopy">We never share your email. Only the school name appears on your profile.</div>
      </div>
    `);
    const input = backdrop.querySelector('#svEmail');
    const btn   = backdrop.querySelector('#svSendBtn');
    const err   = backdrop.querySelector('#svEmailError');

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
    });
    input.addEventListener('input', () => {
      input.classList.remove('error');
      err.classList.remove('show');
    });

    btn.onclick = () => {
      const v = input.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.edu$/.test(v)) {
        input.classList.add('error');
        err.classList.add('show');
        input.focus();
        return;
      }
      const domain = v.split('@')[1];
      pendingEmail = v;
      pendingSchool = deriveSchool(domain);
      renderState2();
    };
    setTimeout(() => input.focus(), 60);
  }

  // ── State 2 — "we sent a link" ─────────────────────────────────────────
  function renderState2() {
    setContent(`
      <div class="sv-body">
        <div class="sv-icon-wrap purple">
          <div class="sv-pulse-ring" style="border-color:#7C5CFC;"></div>
          <span class="sv-envelope-anim">✉️</span>
        </div>
        <h2>Check your email</h2>
        <p class="sv-sub">We sent a verification link to <strong>${escapeHTML(pendingEmail)}</strong>. Click it to confirm you're a student at <strong>${escapeHTML(pendingSchool)}</strong>.</p>

        <button class="sv-btn-primary coral" id="svConfirmBtn">I clicked the link →</button>
        <button class="sv-btn-ghost" id="svBackBtn">Use a different email</button>

        <div class="sv-microcopy"><strong>Demo mode</strong> — clicking the button above simulates a real verification link click. The full flow uses a one-time link sent to your inbox.</div>
      </div>
    `);
    backdrop.querySelector('#svConfirmBtn').onclick = () => {
      setVerified(pendingEmail, pendingSchool);
      renderState3();
    };
    backdrop.querySelector('#svBackBtn').onclick = renderState1;
  }

  // ── State 3 — verified ─────────────────────────────────────────────────
  function renderState3() {
    const onCampus = location.pathname.toLowerCase().endsWith('/campus.html');
    setContent(`
      <div class="sv-body">
        <div class="sv-icon-wrap green">
          <div class="sv-pulse-ring"></div>
          <span class="sv-cap-icon">✓</span>
        </div>
        <h2>You're verified</h2>
        <p class="sv-sub">Welcome to Vibe as a verified student. Your campus tab is now unlocked.</p>

        <div class="sv-school-pill">
          <span class="sv-pill-dot"></span>
          <span>Student · <strong>${escapeHTML(pendingSchool)}</strong></span>
        </div>

        <button class="sv-btn-primary green" id="svDoneBtn">${onCampus ? 'Open Campus' : 'Go to Campus →'}</button>
      </div>
    `);
    backdrop.querySelector('#svDoneBtn').onclick = () => {
      close();
      if (onCampus) {
        // Already on campus — just refresh the page so the gate hides
        window.location.reload();
      } else {
        window.location.href = '/html/campus.html';
      }
    };
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  window.studentVerify = {
    open,
    close,
    isVerified,
    getStatus,
    getSchool,
    getEmail,
    setVerified,    // exposed for debugging / direct hookup
    clearVerification,
    deriveSchool
  };
})();
