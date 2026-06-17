import React, { useState } from 'react';
import './App.css';

// Point this at the deployed server URL when you ship it.
const PREDICT_URL = 'http://localhost:8080/predict';

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

function App() {
  const [image, setImage] = useState(null);
  const [grid, setGrid] = useState(null);
  const [savedAs, setSavedAs] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target.result);
      };
      reader.readAsDataURL(file);
      setGrid(null);
      setSavedAs(null);
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
      setSavedAs(data.saved_as);
    } catch (error) {
      console.error('Error:', error);
      setStatus('The sheet could not be read at this time.');
    } finally {
      setLoading(false);
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
      <div className="app-body">
        <h1>Balut Eye</h1>

        <div className="controls-container">
          <p>Upload a photo of the score sheet and Balut Eye will read the 10&times;8 table of handwritten numbers.<br/><br/>Only JPG/JPEG images are supported. For best results, use a flat, well-lit photo where the table fills the frame. A cell marked with /, \ or x counts as 0.</p>
          <input type="file" accept="image/jpeg" onChange={handleImageUpload} />
          <button onClick={handleSubmit} disabled={!image || loading}>
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

        {grid !== null && (
          <div className="result-container">
            <ResultTable grid={grid} />
            {savedAs && <p className="saved-note">Saved on the server as <code>{savedAs}</code></p>}
          </div>
        )}

        {image !== null && (
          <div className="image-container">
            <img src={image} alt="Uploaded sheet" className="image" />
          </div>
        )}

        <div className="copyright">© {new Date().getFullYear()} Svend K. Johannsen. All rights reserved. v1.0</div>
      </div>
    </div>
  );
}

export default App;
