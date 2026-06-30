import React, { useState, useEffect } from 'react';
import './App.css';
import { apiBase } from './config';
import matrixTL from './assets/background-matrix-tl.jpg';
import matrixTR from './assets/background-matrix-tr.jpg';

// Server endpoints; the host comes from the active environment (see config.js).
const READ_URL = `${apiBase}/read`;
const ACCEPT_URL = `${apiBase}/accept`;
const DECLINE_URL = `${apiBase}/decline`;
const SUBMIT_URL = `${apiBase}/feedback`;

// Decline-dialog "glitch" bars: varied thickness (h, px), length (w, %), vertical
// position/spacing (top, %) and x start (left, %); v picks one of 3 x-shift variants.
const GLITCH_BARS = [
  { top: 5,  h: 3,  left: 0,  w: 34, v: 0, c: 'rgba(106,150,81,0.55)' },
  { top: 12, h: 10, left: 26, w: 58, v: 1, c: 'rgba(174,221,143,0.60)' },
  { top: 18, h: 2,  left: 58, w: 42, v: 2, c: 'rgba(106,150,81,0.50)' },
  { top: 28, h: 15, left: 0,  w: 70, v: 0, c: 'rgba(106,150,81,0.60)' },
  { top: 36, h: 4,  left: 44, w: 30, v: 2, c: 'rgba(174,221,143,0.50)' },
  { top: 45, h: 7,  left: 8,  w: 92, v: 1, c: 'rgba(106,150,81,0.55)' },
  { top: 54, h: 12, left: 52, w: 48, v: 0, c: 'rgba(174,221,143,0.62)' },
  { top: 61, h: 2,  left: 0,  w: 46, v: 2, c: 'rgba(106,150,81,0.45)' },
  { top: 70, h: 6,  left: 30, w: 64, v: 1, c: 'rgba(106,150,81,0.58)' },
  { top: 78, h: 16, left: 12, w: 52, v: 0, c: 'rgba(174,221,143,0.60)' },
  { top: 88, h: 3,  left: 50, w: 50, v: 2, c: 'rgba(106,150,81,0.50)' },
  { top: 94, h: 8,  left: 20, w: 40, v: 1, c: 'rgba(174,221,143,0.55)' },
];

// Remember T&C acceptance in a cookie so the user only accepts once.
const TERMS_COOKIE = 'balutEyeTermsAccepted';

function hasAcceptedTerms() {
  return document.cookie.split('; ').includes(`${TERMS_COOKIE}=1`);
}

function storeTermsAcceptance(accepted) {
  if (accepted) {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${TERMS_COOKIE}=1; max-age=${oneYear}; path=/; SameSite=Lax`;
  } else {
    document.cookie = `${TERMS_COOKIE}=; max-age=0; path=/; SameSite=Lax`;
  }
}

function csvCell(value) {
  const s = value === '' || value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function gridToCSV(grid) {
  return grid.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Heavier outline around the A6:H7 block -- the Score (col 6) and Jackpot (col 7)
// columns, from the header row A down through the Balut row H.
function blockBorder(r, c) {
  if (r > 7 || (c !== 5 && c !== 6)) return undefined;
  const heavy = '3px solid #d4af37';
  const style = {};
  if (r === 0) style.borderTop = heavy;
  if (r === 7) style.borderBottom = heavy;
  if (c === 5) style.borderLeft = heavy;
  if (c === 6) style.borderRight = heavy;
  return style;
}

const ResultTable = ({ grid }) => {
  return (
    <table className="result-table">
      <tbody>
        {grid.map((row, r) => (
          <tr key={r}>
            {row.map((value, c) => (
              <td key={c} style={blockBorder(r, c)}>{value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Only cells the server marks as handwritten (the `editable` mask) become inputs;
// printed labels and always-blank cells stay static text.
const EditableTable = ({ editGrid, editable, onCell }) => {
  return (
    <table className="result-table editable">
      <tbody>
        {editGrid.map((row, r) => (
          <tr key={r}>
            {row.map((value, c) => (
              <td key={c} style={blockBorder(r, c)}>
                {editable?.[r]?.[c] ? (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => onCell(r, c, e.target.value)}
                    aria-label={`row ${r + 1} column ${c + 1}`}
                  />
                ) : (
                  value
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// A small green "i" info badge that toggles a popover with an explanation. Sits
// inside a view at the top-right corner (mirrors the corner dice on the left).
const InfoButton = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="info">
      <button
        type="button"
        className="info-button"
        aria-label="What is this?"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <div className="info-popover" role="dialog" aria-label="Help">
          <button
            type="button"
            className="info-popover-close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          {children}
        </div>
      )}
    </div>
  );
};

function App() {
  const [image, setImage] = useState(null);
  const [grid, setGrid] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  // Result modal: shown after a successful read.
  const [showResult, setShowResult] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState('none'); // 'none' | 'up' | 'down'
  const [editGrid, setEditGrid] = useState(null);           // working copy for 'down'
  const [editable, setEditable] = useState(null);           // which cells may be edited
  const [resultId, setResultId] = useState(null);           // server folder id for this read
  const [submitState, setSubmitState] = useState('idle');   // 'idle'|'saving'|'done'|'error'
  // Terms & conditions: initialise from the cookie so returning users skip it.
  const [accepted, setAccepted] = useState(hasAcceptedTerms);
  const [showTerms, setShowTerms] = useState(false);

  const acceptTerms = (value) => {
    setAccepted(value);
    storeTermsAcceptance(value);
  };

  // Background "glitch": the default background.jpg lives in CSS; once a minute we
  // briefly override it with one of the two near-identical matrix-corner variants
  // (picked at random) for 500ms, then revert -- a subtle flicker effect.
  const [bgVariant, setBgVariant] = useState(null);
  const [glitchTick, setGlitchTick] = useState(0);  // bump to replay the decline-dialog glitch

  useEffect(() => {
    // Don't flicker for users who prefer reduced motion.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Preload both variants so the brief swap is instant (no flash while loading).
    [matrixTL, matrixTR].forEach((src) => { const img = new Image(); img.src = src; });

    let revert;
    const interval = setInterval(() => {
      setBgVariant(Math.random() < 0.5 ? matrixTL : matrixTR);  // flick to a corner
      revert = setTimeout(() => setBgVariant(null), 500);       // ...then back
    }, 60000);

    return () => { clearInterval(interval); clearTimeout(revert); };
  }, []);

  // Replay the decline-dialog glitch at a jittered interval (10s +/- 30%, i.e. 7-13s)
  // while that dialog is up. Bumping glitchTick remounts the overlay so its one-shot
  // CSS animation runs again.
  useEffect(() => {
    if (!(showResult && feedbackMode === 'down')) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let id;
    const schedule = () => {
      const ms = 10000 * (1 + (Math.random() * 2 - 1) * 0.3); // 7000-13000 ms
      id = setTimeout(() => { setGlitchTick((t) => t + 1); schedule(); }, ms);
    };
    schedule();
    return () => clearTimeout(id);
  }, [showResult, feedbackMode]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target.result);
      };
      reader.readAsDataURL(file);
      setGrid(null);
      setStatus(null);
    }
  };

  const handleSubmit = async () => {
    if (!image) return;

    setLoading(true);
    setStatus(null);
    setGrid(null);

    const formData = new FormData();
    const blob = dataURLtoBlob(image);
    formData.append('file', blob, 'image.jpg');

    try {
      const response = await fetch(READ_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded ${response.status}`);
      }

      const data = await response.json();
      setGrid(data.grid);
      setEditable(data.editable);
      // Seed the editable copy now so the (always-mounted) edit panel has data.
      setEditGrid(data.grid.map((row) => row.map((v) => (v === '' || v == null ? '' : String(v)))));
      setResultId(data.id);
      setFeedbackMode('none');
      setSubmitState('idle');
      setShowResult(true);
    } catch (error) {
      console.error('Error:', error);
      setStatus('The sheet could not be read at this time.');
    } finally {
      setLoading(false);
    }
  };

  const closeResult = () => setShowResult(false);

  // Record the thumbs verdict on the server (fire-and-forget); the pan happens regardless.
  const sendVerdict = (url) => {
    if (!resultId) return;
    const form = new FormData();
    form.append('id', resultId);
    fetch(url, { method: 'POST', body: form }).catch((e) => console.error('Verdict error:', e));
  };

  const thumbsUp = () => {
    sendVerdict(ACCEPT_URL);
    setFeedbackMode('up');   // pan right
  };

  const thumbsDown = () => {
    sendVerdict(DECLINE_URL);
    setFeedbackMode('down'); // pan left
  };

  const updateCell = (r, c, value) => {
    setEditGrid((prev) =>
      prev.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row))
    );
  };

  const downloadCSV = () => {
    downloadBlob(new Blob([gridToCSV(grid)], { type: 'text/csv;charset=utf-8;' }), 'scorecard.csv');
  };

  const downloadXLSX = async () => {
    // Load SheetJS on demand so it isn't in the main bundle (Excel is rarely used).
    const mod = await import('xlsx');
    const XLSX = mod.default || mod;
    const ws = XLSX.utils.aoa_to_sheet(grid);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scorecard');
    XLSX.writeFile(wb, 'scorecard.xlsx');
  };

  const submitCorrection = async () => {
    setSubmitState('saving');
    try {
      const form = new FormData();
      form.append('id', resultId);
      form.append('grid', JSON.stringify(editGrid));
      const res = await fetch(SUBMIT_URL, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      setSubmitState('done');
    } catch (err) {
      console.error('Submit error:', err);
      setSubmitState('error');
    }
  };

  function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  // Photo preview shown inside every result dialog, above the rendered table.
  const imagePreview = image && (
    <div className="result-preview">
      <img src={image} alt="Your uploaded scorecard" />
    </div>
  );

  return (
    <div className="App">
      <div
        className="app-body"
        style={bgVariant ? { backgroundImage: `url(${bgVariant})` } : undefined}
      >
        <InfoButton>
          <p><strong>Balut Eye</strong> reads the handwritten numbers off a photo of a Balut scorecard.</p>
          <p>Accept the terms, upload a flat, well-lit <strong>JPG/JPEG</strong> photo where the
            10&times;8 table fills the frame, then press <strong>Read the sheet</strong>. A cell
            marked <code>/ \ x</code> or left blank counts as a strike (shown as <code>x</code>).</p>
        </InfoButton>
        <h1>Balut Eye</h1>
        <p className="tagline">Take a photo of a Balut scorecard.</p>

        <div className="terms-acceptance">
          <input
            type="checkbox"
            id="accept-terms"
            checked={accepted}
            onChange={(e) => acceptTerms(e.target.checked)}
          />
          <span className="terms-text">
            <label htmlFor="accept-terms">I accept the</label>{' '}
            <button
              type="button"
              className="terms-link"
              onClick={() => setShowTerms(true)}
            >
              terms and conditions
            </button>
          </span>
        </div>

        <div className="controls-container">
          {/* Camera button: capture="environment" opens the rear camera directly on mobile;
              on desktop the browser ignores capture and falls back to a file picker. */}
          <label className="camera-button" title="Take a photo" aria-label="Take a photo with the camera">
            <span aria-hidden="true">📷</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} hidden />
          </label>
          <button onClick={handleSubmit} disabled={!image || loading || !accepted}>
            {loading ? 'Reading…' : 'Read scorecard'}
          </button>
        </div>

        {status !== null && (
          <div className="result-bubble-container">
            <div className="result-bubble">
              <p className="result-bubble-text">{status}</p>
            </div>
          </div>
        )}

        <div className="copyright">© {new Date().getFullYear()} Svend K. Johannsen. All rights reserved. v1.0</div>
      </div>

      {showResult && grid && (
        <div className="result-overlay" onClick={closeResult}>
          <div
            className="result-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="result-viewport">
              <div
                className="result-track"
                style={{
                  transform: `translateX(${{ down: '0%', none: '-100%', up: '-200%' }[feedbackMode]})`,
                }}
              >
                {/* Decline dialog -- correct the scorecard (left panel, reached by thumbs-down / pan left) */}
                <section className="result-panel">
                  <InfoButton>
                    <p>Fix any cells Balut Eye read wrong, then <strong>Submit</strong>. Only the
                      handwritten cells are editable — type <code>x</code> for a strike.</p>
                    <p>Your corrections are saved as ground truth to help improve the recognition.</p>
                  </InfoButton>
                  <h2>Bad read</h2>
                  <div className="result-scroll">
                    {imagePreview}
                    <div className="result-table-wrap">
                      {editGrid && (
                        <EditableTable editGrid={editGrid} editable={editable} onCell={updateCell} />
                      )}
                    </div>
                  </div>
                  {submitState === 'done' ? (
                    <>
                      <p className="result-thanks">Thanks! Your corrections were submitted.</p>
                      <div className="result-actions">
                        <button type="button" className="result-secondary" onClick={closeResult}>
                          Close
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="result-prompt">
                        Fix any wrong numbers, then submit to help improve recognition.
                      </p>
                      <div className="result-actions">
                        <button type="button" className="result-secondary" onClick={closeResult}>
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={submitCorrection}
                          disabled={submitState === 'saving'}
                        >
                          {submitState === 'saving' ? 'Submitting…' : 'Submit'}
                        </button>
                      </div>
                      {submitState === 'error' && (
                        <p className="result-error">Could not submit. Please try again.</p>
                      )}
                    </>
                  )}
                </section>

                {/* Read dialog -- the read result (center panel) */}
                <section className="result-panel">
                  <InfoButton>
                    <p>This is what Balut Eye read from your photo. Strikes show as <code>x</code>.</p>
                    <p>Press 👍 if it looks right, or 👎 to fix any wrong numbers.</p>
                  </InfoButton>
                  <h2>Scorecard</h2>
                  <div className="result-scroll">
                    {imagePreview}
                    <div className="result-table-wrap">
                      <ResultTable grid={grid} />
                    </div>
                  </div>
                  <p className="result-prompt">Does this look right?</p>
                  <div className="result-actions">
                    <button type="button" className="result-secondary" onClick={closeResult}>
                      Close
                    </button>
                    <button type="button" className="thumb" onClick={thumbsUp} aria-label="Good read" title="Good read">
                      👍
                    </button>
                    <button
                      type="button"
                      className="thumb"
                      onClick={thumbsDown}
                      aria-label="Bad read"
                      title="Bad read"
                    >
                      👎
                    </button>
                  </div>
                </section>

                {/* Accept dialog -- accepted; download (right panel, reached by thumbs-up / pan right) */}
                <section className="result-panel">
                  <InfoButton>
                    <p>Your scorecard was read correctly. Download it as a <strong>CSV</strong>
                      (plain text) or an <strong>Excel</strong> (.xlsx) file.</p>
                  </InfoButton>
                  <h2>Good read</h2>
                  <div className="result-scroll">
                    {imagePreview}
                    <div className="result-table-wrap checked">
                      <div className="scorecard-stamp">
                        <ResultTable grid={grid} />
                        <span className="scorecard-check" aria-hidden="true">✓</span>
                      </div>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button type="button" className="result-secondary" onClick={closeResult}>
                      Close
                    </button>
                    <button type="button" onClick={downloadCSV}>CSV</button>
                    <button type="button" onClick={downloadXLSX}>Excel</button>
                  </div>
                </section>
              </div>
            </div>
          </div>
          {/* Whole-screen green "glitch" -- shown while the decline dialog is up.
              position:fixed covers the viewport; pointer-events:none lets every
              click through, so the modal's grid/buttons stay fully interactive. */}
          {feedbackMode === 'down' && (
            <div className="glitch-overlay" key={glitchTick} aria-hidden="true">
              {GLITCH_BARS.map((b, i) => (
                <span
                  key={i}
                  className={`glitch-bar glitch-bar-${b.v}`}
                  style={{ top: `${b.top}%`, left: `${b.left}%`, width: `${b.w}%`,
                           height: `${b.h}px`, background: b.c }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showTerms && (
        <div className="terms-overlay" onClick={() => setShowTerms(false)}>
          <div
            className="terms-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="terms-title">Terms and Conditions</h2>
            <div className="terms-body">
              <p>Last updated {new Date().getFullYear()}. Please read these terms
                carefully before using Balut Eye (the &ldquo;Service&rdquo;). By
                checking the acceptance box you agree to be bound by them.</p>

              <h3>1. The Service</h3>
              <p>Balut Eye reads handwritten numbers from a photograph of a Balut
                score sheet that you upload, and returns its best interpretation of
                the table. The Service is provided for convenience only and may be
                inaccurate; you are responsible for checking the results.</p>

              <h3>2. Uploaded images and ownership</h3>
              <p>When you submit an image it is sent to the Service&rsquo;s server
                for processing. <strong>By uploading an image you irrevocably give
                up any ownership of, and all rights to, that image, and assign them
                to the operator of the Service.</strong> You grant the operator a
                perpetual, worldwide, royalty-free licence to store, use, reproduce,
                modify, and process the image and its contents for any purpose,
                including improving the Service. You confirm that you own or
                otherwise have the right to upload each image and to transfer these
                rights, and you should not upload images containing sensitive
                personal information.</p>

              <h3>3. Acceptable use</h3>
              <p>You agree not to use the Service for any illegal or unlawful
                purpose, and not to upload any image or content that is illegal or
                that you do not have the legal right to upload. You are solely
                responsible for the content you upload and for ensuring it complies
                with all applicable laws. You further agree not to misuse the
                Service, including attempting to disrupt it, overload it, or
                reverse-engineer it.</p>

              <h3>4. No warranty</h3>
              <p>The Service is provided &ldquo;as is&rdquo; and &ldquo;as
                available&rdquo;, without warranties of any kind, whether express or
                implied, including fitness for a particular purpose and accuracy of
                results.</p>

              <h3>5. Limitation of liability</h3>
              <p>To the maximum extent permitted by law, the operator of the Service
                shall not be liable for any indirect, incidental, or consequential
                damages arising out of your use of, or inability to use, the
                Service.</p>

              <h3>6. Changes</h3>
              <p>These terms may be updated from time to time. Continued use of the
                Service after changes take effect constitutes acceptance of the
                revised terms.</p>

              <h3>7. Contact</h3>
              <p>Questions about these terms can be directed to the operator of the
                Service.</p>
            </div>
            <div className="terms-actions">
              <button
                type="button"
                className="terms-secondary"
                onClick={() => setShowTerms(false)}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => { acceptTerms(true); setShowTerms(false); }}
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
