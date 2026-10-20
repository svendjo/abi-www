// The green icon buttons that pick a photo: Camera (Practice and Tournament) and
// Photos (Tournament). Each is a <label> around a hidden file input, so a tap opens
// the camera or the photo library directly.

// Outline camera icon for the capture button, replacing the 📷 emoji (which rendered
// as a different picture on every platform and couldn't take the button's colour).
// Strokes use currentColor, so it inherits the button's text colour on hover too.
const CameraIcon = () => (
  <svg
    className="camera-icon"
    viewBox="0 0 24 24"
    width="32"
    height="32"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {/* Body with the raised shutter housing on top */}
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13.5" r="4.3" />
    {/* Flash bulb -- filled, so it reads as a dot rather than a tiny ring */}
    <circle cx="18.2" cy="9.8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

// Photo-library icon in the same outline style: a picture (sun and hills) with a
// second one stacked behind it, for "several photos taken earlier".
const PhotosIcon = () => (
  <svg
    className="camera-icon"
    viewBox="0 0 24 24"
    width="32"
    height="32"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {/* The photo behind: only its top and right edges show */}
    <path d="M6 4.5V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-.5" />
    <rect x="2" y="6" width="16" height="16" rx="2" />
    <circle cx="7" cy="11" r="1.6" fill="currentColor" stroke="none" />
    <path d="M2.5 20l5-5 3 3 3-3.5 4.5 4.5" />
  </svg>
);

export const CameraButton = ({ onChange }) => (
  <label className="camera-button" title="Take a photo" aria-label="Take a photo with the camera">
    <CameraIcon />
    {/* capture="environment" opens the rear camera directly on mobile; on desktop the
        browser ignores capture and falls back to a file picker. */}
    <input type="file" accept="image/*" capture="environment" onChange={onChange} hidden />
  </label>
);

export const PhotosButton = ({ onChange }) => (
  <label className="camera-button" title="Choose photos" aria-label="Choose photos you took earlier">
    <PhotosIcon />
    <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onChange} hidden />
  </label>
);
