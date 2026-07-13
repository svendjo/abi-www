import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { apiBase } from './config';
import matrixTL from './assets/background-matrix-tl.jpg';
import matrixTR from './assets/background-matrix-tr.jpg';

// Server endpoints; the host comes from the active environment (see config.js).
const READ_URL = `${apiBase}/read`;
const ACCEPT_URL = `${apiBase}/accept`;
const DECLINE_URL = `${apiBase}/decline`;
const SUBMIT_URL = `${apiBase}/feedback`;
const VERIFY_URL = `${apiBase}/verify`;

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

// The edit grid holds every cell as a string ('' for blank); convert integer cells
// back to numbers so a submitted correction matches the shape of a server-read grid
// (numbers for scores/points, 'x'/'-' and labels left as text). Used to promote the
// corrected edit grid into `grid` so the accept dialog renders and exports it.
function toGridValue(v) {
  if (v === '' || v == null) return '';
  const s = String(v).trim();
  return /^-?\d+$/.test(s) ? Number(s) : v;
}

// Columns (0-indexed) where a 0 means a STRIKE, not a real zero: the four game cells
// (1-4) and the Jackpot column (6). In the Score (5) and Points (7) columns a 0 is a
// real zero. Matches scorecard.strikes_allowed for the cells that are editable. The
// decline dialog uses a numeric keypad, so a strike is entered as 0 there; the
// canonical grid (read dialog, CSV/Excel, feedback, training) still uses "x".
const STRIKE_COLS = new Set([1, 2, 3, 4, 6]);

// Canonical grid -> edit representation: a strike "x" in a strike column shows as 0
// in the numeric editor (everything else is already a number or blank).
function toEditValue(v, c) {
  if (v === '' || v == null) return '';
  const s = String(v);
  return STRIKE_COLS.has(c) && (s === 'x' || s === 'X') ? '0' : s;
}

// Edit representation -> canonical: a 0 in a strike column is a strike, stored and
// displayed as "x"; otherwise fall back to toGridValue.
function fromEditValue(v, c) {
  if (STRIKE_COLS.has(c) && String(v).trim() === '0') return 'x';
  return toGridValue(v);
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
// columns, from the header row A down through the Balut row H. Same green as the
// rest of the grid (yellow is reserved for warning highlights).
function blockBorder(r, c) {
  if (r > 7 || (c !== 5 && c !== 6)) return undefined;
  const heavy = '3px solid #6a9651';
  const style = {};
  if (r === 0) style.borderTop = heavy;
  if (r === 7) style.borderBottom = heavy;
  if (c === 5) style.borderLeft = heavy;
  if (c === 6) style.borderRight = heavy;
  return style;
}

// The two totals rows carry a long label that needs a whole line: merge I1-I5
// into one cell for "Total Score" and J1-J7 into one for "Points - Grand Total".
// `cellSpan` gives the colSpan of the surviving (first) cell; `isMergedAway` marks
// the empty cells that span swallows so the render loop skips them.
function cellSpan(r, c) {
  if (r === 8 && c === 0) return 5;  // I1 covers I1-I5 ("Total Score")
  if (r === 9 && c === 0) return 7;  // J1 covers J1-J7 ("Points - Grand Total")
  return undefined;
}
function isMergedAway(r, c) {
  return (r === 8 && c >= 1 && c <= 4) || (r === 9 && c >= 1 && c <= 6);
}

// `warned` / `errored` are Sets of "r,c" keys for cells a consistency check flags:
// warnings draw a narrow yellow box around the number, errors a red one. Errors take
// precedence when a cell is in both. Shown in all three result dialogs.
const ResultTable = ({ grid, warned, errored }) => {
  return (
    <table className="result-table">
      <tbody>
        {grid.map((row, r) => (
          <tr key={r}>
            {row.map((value, c) => {
              if (isMergedAway(r, c)) return null;
              const key = `${r},${c}`;
              const cls = errored?.has(key) ? 'error-box' : warned?.has(key) ? 'warn-box' : null;
              return (
                <td key={c} colSpan={cellSpan(r, c)} style={blockBorder(r, c)}>
                  {cls ? <span className={cls}>{value}</span> : value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Only cells the server marks as handwritten (the `editable` mask) become inputs;
// printed labels and always-blank cells stay static text. Flagged cells get a
// coloured frame (on the input, or a box around static text): yellow for a warning,
// red for an error (error wins when a cell is in both).
const EditableTable = ({ editGrid, editable, onCell, warned, errored }) => {
  return (
    <table className="result-table editable">
      <tbody>
        {editGrid.map((row, r) => (
          <tr key={r}>
            {row.map((value, c) => {
              if (isMergedAway(r, c)) return null;
              const key = `${r},${c}`;
              const isErrored = errored?.has(key);
              const isWarned = warned?.has(key);
              const inputCls = isErrored ? 'error' : isWarned ? 'warn' : undefined;
              const boxCls = isErrored ? 'error-box' : isWarned ? 'warn-box' : null;
              return (
                <td key={c} colSpan={cellSpan(r, c)} style={blockBorder(r, c)}>
                  {editable?.[r]?.[c] ? (
                    <input
                      type="text"
                      // The Points column (index 7: B8-H8, I8, J8) can be negative, and
                      // iOS's numeric pad has no minus key -- give it the standard
                      // keyboard (which does). Every other editable cell is unsigned.
                      inputMode={c === 7 ? 'text' : 'numeric'}
                      className={inputCls}
                      value={value}
                      onChange={(e) => onCell(r, c, e.target.value)}
                      aria-label={`row ${r + 1} column ${c + 1}`}
                    />
                  ) : boxCls ? (
                    <span className={boxCls}>{value}</span>
                  ) : (
                    value
                  )}
                </td>
              );
            })}
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
  // Consistency issues come from two places and must not be conflated. `read*` are
  // the issues in the grid the READ and ACCEPT dialogs render (from /read, or from
  // /verify once a correction is submitted and promoted into `grid`); they gate 👍.
  // `edit*` track the live edit grid via /verify on every keystroke; they gate Submit.
  // Sharing one set let a user clear the red in the decline panel, press Back, and
  // then accept the still-broken original read.
  const [readWarningCells, setReadWarningCells] = useState([]);
  const [readErrorCells, setReadErrorCells] = useState([]);
  const [editWarningCells, setEditWarningCells] = useState([]);
  const [editErrorCells, setEditErrorCells] = useState([]);
  const [rotation, setRotation] = useState(0);              // OSD rotation (deg CW) the server applied
  const [previewSrc, setPreviewSrc] = useState(null);       // photo re-oriented to match the read
  const editSeededRef = useRef(false);                      // skip re-verifying the initial /read grid
  const [resultId, setResultId] = useState(null);           // server folder id for this read
  const [submitState, setSubmitState] = useState('idle');   // 'idle'|'saving'|'done'|'error'
  // Flow state, shared by the three result dialogs: 'opened' until the user either
  // accepts (👍) or submits a correction, then 'submitted' -- a one-way latch (only a
  // fresh read resets it). In 'submitted' the accept dialog's Back button is disabled.
  const [flowState, setFlowState] = useState('opened');     // 'opened' | 'submitted'
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

  // Re-check the correction grid against the server on every edit (debounced) so the
  // highlights in the decline panel update live as the user fixes cells. Only the
  // `edit*` sets move; the read dialog keeps showing its own read's issues. The first
  // run (initial seed from /read) is skipped -- those issues already came from /read.
  useEffect(() => {
    if (!editGrid) return undefined;
    if (!editSeededRef.current) { editSeededRef.current = true; return undefined; }
    const timer = setTimeout(() => {
      const form = new FormData();
      form.append('grid', JSON.stringify(editGrid));
      fetch(VERIFY_URL, { method: 'POST', body: form })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setEditWarningCells(data.warning_cells || []);
            setEditErrorCells(data.error_cells || []);
          }
        })
        .catch((e) => console.error('Verify error:', e));
    }, 300);
    return () => clearTimeout(timer);
  }, [editGrid]);

  // Re-orient the photo to match what the server read. `rotation` (deg CW) is
  // relative to the browser's EXIF-oriented rendering, so we load the photo the
  // normal way (an <img>, which the browser EXIF-orients) and rotate that on a
  // canvas -- no EXIF wrangling, and 90/270 gets correct dimensions.
  useEffect(() => {
    if (!image) { setPreviewSrc(null); return undefined; }
    let cancelled = false;
    const rot = ((rotation % 360) + 360) % 360;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const swap = rot === 90 || rot === 270;
        const canvas = document.createElement('canvas');
        canvas.width = swap ? img.naturalHeight : img.naturalWidth;
        canvas.height = swap ? img.naturalWidth : img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        setPreviewSrc(canvas.toDataURL('image/jpeg', 0.9));
      } catch (e) {
        console.error('Preview re-orient failed:', e);
        setPreviewSrc(image);  // fall back to the browser's own rendering
      }
    };
    img.onerror = () => { if (!cancelled) setPreviewSrc(image); };
    img.src = image;
    return () => { cancelled = true; };
  }, [image, rotation]);

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
        // Show the server's error detail verbatim -- the backend scrubs it, so we
        // don't inspect the error type here. `detail` is the message string; an
        // object detail falls back to its `message`, then to a raw dump.
        let detail = null;
        try {
          detail = (await response.json()).detail;
        } catch (e) {
          /* non-JSON error body */
        }
        setStatus(
          typeof detail === 'string'
            ? detail
            : detail && typeof detail === 'object'
            ? detail.message || JSON.stringify(detail)
            : `The sheet could not be read (status ${response.status}).`
        );
        return;
      }

      const data = await response.json();
      setGrid(data.grid);
      setEditable(data.editable);
      // Both views start from the read's own issues; only the edit copy then tracks /verify.
      setReadWarningCells(data.warning_cells || []);
      setReadErrorCells(data.error_cells || []);
      setEditWarningCells(data.warning_cells || []);
      setEditErrorCells(data.error_cells || []);
      setRotation(data.rotation || 0);
      // Seed the editable copy now so the (always-mounted) edit panel has data.
      // The seed matches the read, so don't re-verify it (its warnings came from /read).
      editSeededRef.current = false;
      setEditGrid(data.grid.map((row) => row.map((v, c) => toEditValue(v, c))));
      setResultId(data.id);
      setFeedbackMode('none');
      setSubmitState('idle');
      setFlowState('opened');   // new read -> start the flow over
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
    if (hasErrors) return;   // errors block accept; the button is disabled too
    sendVerdict(ACCEPT_URL);
    setFlowState('submitted');  // one-way latch
    setFeedbackMode('up');   // pan right to the accept dialog
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
      // Translate the numeric edit grid to canonical form (a 0 in a strike column
      // becomes "x") for both storage and display, so feedback/training and the
      // accept dialog match the read dialog's representation.
      const canonical = editGrid.map((row) => row.map((v, c) => fromEditValue(v, c)));
      const form = new FormData();
      form.append('id', resultId);
      form.append('grid', JSON.stringify(canonical));
      const res = await fetch(SUBMIT_URL, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      // Promote the corrected grid so the accept dialog renders and exports the
      // player's corrections, not the original read -- and with it the edit grid's
      // issues, which are now the ones the displayed grid actually has.
      setGrid(canonical);
      setReadWarningCells(editWarningCells);
      setReadErrorCells(editErrorCells);
      setSubmitState('done');
      setFlowState('submitted');  // one-way latch
      setFeedbackMode('up');      // pan to the accept dialog
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

  // Cells a consistency check flags, as Sets of "r,c" keys for quick lookup. The
  // read/accept dialogs highlight (and gate on) the issues of the grid they render;
  // the decline dialog highlights (and gates on) the issues of the grid being edited.
  const cellSet = (cells) => new Set(cells.map(([r, c]) => `${r},${c}`));
  const warnedSet = cellSet(readWarningCells);
  const erroredSet = cellSet(readErrorCells);
  const editWarnedSet = cellSet(editWarningCells);
  const editErroredSet = cellSet(editErrorCells);
  const hasWarnings = readWarningCells.length > 0;
  const hasErrors = readErrorCells.length > 0;      // blocks accept (thumbs-up)
  const editHasErrors = editErrorCells.length > 0;  // blocks submit

  // Photo preview shown inside every result dialog, above the rendered table.
  // previewSrc is the photo re-oriented (upright) to match the recognized grid.
  const imagePreview = previewSrc && (
    <div className="result-preview">
      <img src={previewSrc} alt="Your uploaded scorecard" />
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
            10&times;8 table fills the frame, then press <strong>Read Scorecard</strong>.</p>
          <p>The card must be <strong>completely filled in</strong> — every cell needs a number or a
            strike, or the read is rejected. In a game or Jackpot cell, a crossed-out mark
            (<code>/</code> <code>-</code> <code>\</code> <code>x</code> <code>X</code>) is a strike,
            shown as <code>x</code>. The Score and Points columns take no strike.</p>
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
                      handwritten cells are editable, and on a phone they bring up a number keypad
                      (the Points column keeps a minus key, for negative points).
                      In a game or Jackpot cell (columns 2&ndash;5 and 7), enter <code>0</code> for a
                      <strong> strike</strong> — it shows as <code>x</code> once submitted. In the
                      Score and Points columns (6 and 8), <code>0</code> is a real zero.</p>
                    <p>The card must be <strong>completely filled in</strong> — every editable cell
                      needs a number (a <code>0</code> counts).</p>
                    <p>Enter exactly what is <strong>written on the scorecard</strong>, even if it
                      doesn&rsquo;t make sense — wrong arithmetic, an impossible score, a miscounted
                      total. Don&rsquo;t correct the player&rsquo;s mistakes; record the paper as-is.</p>
                    <p>A <strong style={{ color: '#ffd633' }}>yellow</strong> outline is a warning
                      (a score or total that doesn&rsquo;t match the numbers); a
                      <strong style={{ color: '#ff4d4d' }}> red</strong> outline is an error (the
                      points don&rsquo;t add up, or a cell is left empty). The highlights update as
                      you type — the <strong>Submit</strong>{' '}
                      button stays disabled while any red remains, but yellow won&rsquo;t block you.</p>
                    <p>Your corrections are saved as ground truth to help improve the recognition.</p>
                  </InfoButton>
                  <h2>Bad read</h2>
                  <div className="result-scroll">
                    {imagePreview}
                    <div className="result-table-wrap">
                      {editGrid && (
                        <EditableTable
                          editGrid={editGrid}
                          editable={editable}
                          onCell={updateCell}
                          warned={editWarnedSet}
                          errored={editErroredSet}
                        />
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
                        {editHasErrors
                          ? 'Fix the cells outlined in red — their points don’t add up — then submit.'
                          : 'Fix any wrong numbers, then submit to help improve recognition.'}
                      </p>
                      <div className="result-actions">
                        <button type="button" className="result-secondary" onClick={() => setFeedbackMode('none')}>
                          Back
                        </button>
                        <button type="button" className="result-secondary" onClick={closeResult}>
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={submitCorrection}
                          disabled={submitState === 'saving' || editHasErrors}
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
                    <p>A <strong style={{ color: '#ffd633' }}>yellow</strong> cell is a warning —
                      a score or total that doesn&rsquo;t match what the numbers add up to. It&rsquo;s
                      just a heads-up; you can still accept.</p>
                    <p>A <strong style={{ color: '#ff4d4d' }}>red</strong> cell is an error — the
                      points don&rsquo;t add up. 👍 is disabled until you fix it, so press 👎 to
                      correct the sheet.</p>
                    <p>Press 👍 if it looks right, or 👎 to fix any wrong numbers.</p>
                  </InfoButton>
                  <h2>Scorecard</h2>
                  <div className="result-scroll">
                    {imagePreview}
                    <div className="result-table-wrap">
                      <ResultTable grid={grid} warned={warnedSet} errored={erroredSet} />
                    </div>
                  </div>
                  <p className="result-prompt">
                    {hasErrors
                      ? 'The cells outlined in red don’t add up — press 👎 to fix them before accepting.'
                      : 'Does this look right?'}
                  </p>
                  <div className="result-actions">
                    <button type="button" className="result-secondary" onClick={closeResult}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="thumb"
                      onClick={thumbsUp}
                      disabled={hasErrors}
                      aria-label="Good read"
                      title={hasErrors ? 'Fix the cells outlined in red first' : 'Good read'}
                    >
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
                    <p>Your scorecard is ready — as read, or with your corrections applied.
                      Download it as a <strong>CSV</strong> (plain text) or an
                      <strong> Excel</strong> (.xlsx) file.</p>
                    <p>A <strong style={{ color: '#ffd633' }}>yellow</strong> cell is a warning — a
                      score or total that doesn&rsquo;t match what the numbers add up to. It
                      didn&rsquo;t block accepting, but double-check it before you rely on the export.</p>
                  </InfoButton>
                  <h2>Scorecard ready</h2>
                  <div className="result-scroll">
                    {imagePreview}
                    <div className="result-table-wrap checked">
                      <div className="scorecard-stamp">
                        <ResultTable grid={grid} warned={warnedSet} errored={erroredSet} />
                        {!hasWarnings && !hasErrors && (
                          <span className="scorecard-check" aria-hidden="true">✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      type="button"
                      className="result-secondary"
                      onClick={() => setFeedbackMode('none')}
                      disabled={flowState === 'submitted'}
                    >
                      Back
                    </button>
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
