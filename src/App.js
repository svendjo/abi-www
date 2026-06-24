import React, { useState, useEffect } from 'react';
import './App.css';
import matrixTL from './assets/background-matrix-tl.jpg';
import matrixTR from './assets/background-matrix-tr.jpg';

// Point these at the deployed server URLs when you ship it.
const PREDICT_URL = 'http://localhost:8080/predict';
const SUBMIT_URL = 'http://localhost:8080/feedback';

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

// A printed label cell (e.g. "4's", "Total Score", or the "-" no-jackpot marker)
// is not editable; numbers and blank cells are.
function isLabelCell(value) {
  return typeof value === 'string' && value.trim() !== '' && Number.isNaN(Number(value));
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

const ResultTable = ({ grid }) => {
  return (
    <table className="result-table">
      <tbody>
        {grid.map((row, r) => (
          <tr key={r}>
            {row.map((value, c) => (
              <td key={c}>{value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const EditableTable = ({ editGrid, onCell }) => {
  return (
    <table className="result-table editable">
      <tbody>
        {editGrid.map((row, r) => (
          <tr key={r}>
            {row.map((value, c) => (
              <td key={c}>
                {isLabelCell(value) ? (
                  value
                ) : (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => onCell(r, c, e.target.value)}
                    aria-label={`row ${r + 1} column ${c + 1}`}
                  />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
      const response = await fetch(PREDICT_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded ${response.status}`);
      }

      const data = await response.json();
      setGrid(data.grid);
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

  const thumbsDown = () => {
    // Start from the read grid, as editable strings.
    setEditGrid(grid.map((row) => row.map((v) => (v === '' || v == null ? '' : String(v)))));
    setSubmitState('idle');
    setFeedbackMode('down');
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
      if (image) form.append('file', dataURLtoBlob(image), 'image.jpg');
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

  return (
    <div className="App">
      <div
        className="app-body"
        style={bgVariant ? { backgroundImage: `url(${bgVariant})` } : undefined}
      >
        <h1>Balut Eye</h1>

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
          <p>Upload a photo of the score sheet and Balut Eye will read the 10&times;8 table of handwritten numbers.<br/><br/>Only JPG/JPEG images are supported. For best results, use a flat, well-lit photo where the table fills the frame. A cell marked with /, \ or x counts as 0.</p>
          <input type="file" accept="image/jpeg" onChange={handleImageUpload} />
          <button onClick={handleSubmit} disabled={!image || loading || !accepted}>
            {loading ? 'Reading…' : 'Read the sheet'}
          </button>
        </div>

        {status !== null && (
          <div className="result-bubble-container">
            <div className="result-bubble">
              <p className="result-bubble-text">{status}</p>
            </div>
          </div>
        )}

        {image !== null && (
          <div className="image-container">
            <img src={image} alt="Uploaded sheet" className="image" />
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
            aria-labelledby="result-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="result-title">
              {feedbackMode === 'down' ? 'Correct the scorecard' : 'Scorecard read'}
            </h2>

            <div className="result-table-wrap">
              {feedbackMode === 'down' ? (
                <EditableTable editGrid={editGrid} onCell={updateCell} />
              ) : (
                <ResultTable grid={grid} />
              )}
            </div>

            {feedbackMode === 'none' && (
              <>
                <p className="result-prompt">Does this look right?</p>
                <div className="result-actions">
                  <button type="button" className="result-secondary" onClick={closeResult}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="thumb"
                    onClick={() => setFeedbackMode('up')}
                    aria-label="Looks right"
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    className="thumb"
                    onClick={thumbsDown}
                    aria-label="Needs correction"
                  >
                    👎
                  </button>
                </div>
              </>
            )}

            {feedbackMode === 'up' && (
              <>
                <p className="result-prompt">Great — download the result:</p>
                <div className="result-actions">
                  <button type="button" onClick={downloadCSV}>CSV</button>
                  <button type="button" onClick={downloadXLSX}>Excel</button>
                  <button type="button" className="result-secondary" onClick={closeResult}>
                    Close
                  </button>
                </div>
              </>
            )}

            {feedbackMode === 'down' && (
              <>
                <p className="result-prompt">
                  Fix any wrong numbers, then submit to help improve recognition.
                </p>
                {submitState === 'done' ? (
                  <>
                    <p className="result-thanks">Thanks! Your corrections were submitted.</p>
                    <div className="result-actions">
                      <button type="button" onClick={closeResult}>Done</button>
                    </div>
                  </>
                ) : (
                  <div className="result-actions">
                    <button
                      type="button"
                      className="result-secondary"
                      onClick={() => setFeedbackMode('none')}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={submitCorrection}
                      disabled={submitState === 'saving'}
                    >
                      {submitState === 'saving' ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                )}
                {submitState === 'error' && (
                  <p className="result-error">Could not submit. Please try again.</p>
                )}
              </>
            )}
          </div>
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
