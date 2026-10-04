// The Tournament tab: organizers photograph every card at a tournament (Upload),
// finish the cards the worker couldn't (Review), and everyone signed in sees the
// per-day ranking (Standings). See abi-server/tournament.py for the routes; nothing
// here reads a card -- the photo goes straight to S3 and the worker reads it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiBase } from './config';

const T = `${apiBase}/tournament`;
const GAME_KEY = 'balutEyeTournamentGame';      // the sticky game drop-down
const ROWS = [1, 2, 3, 4, 5, 6, 7];
const ROW_NAMES = ["4's", "5's", "6's", 'Straight', 'Full House', 'Choice', 'Balut'];
const COLS = ['A', 'B', 'C', 'D', 'J'];
const STATUS_LABEL = {
  uploaded: 'in queue', reading: 'reading', read: 'read',
  review: 'needs review', failed: 'failed', rejected: 'rejected',
};

async function post(path, token, fields) {
  const form = new FormData();
  Object.entries(fields || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') form.append(k, v);
  });
  const res = await fetch(`${T}/${path}`, {
    method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const { detail } = await res.json();
      if (typeof detail === 'string') msg = detail;
    } catch (e) { /* not JSON */ }
    throw new Error(msg);
  }
  return res.json();
}

function loadGame() {
  try { return JSON.parse(localStorage.getItem(GAME_KEY) || 'null'); } catch (e) { return null; }
}

function saveGame(value) {
  try { localStorage.setItem(GAME_KEY, JSON.stringify(value)); } catch (e) { /* fine */ }
}

// points · score · baluts -- the ranking order, everywhere.
const triplet = (r) => (r ? `${r.points} · ${r.score} · ${r.baluts}` : '');

// The same, for tables: points first and strongest, since they decide the rank.
const Triplet = ({ r }) => (
  <span className="triplet">
    <b>{r.points}</b><span className="dot">·</span>{r.score}<span className="dot">·</span>{r.baluts}
  </span>
);

function Tournament({ token, onSignIn }) {
  const [list, setList] = useState(null);
  const [organizer, setOrganizer] = useState(false);
  const [tid, setTid] = useState(null);
  const [page, setPage] = useState('standings');
  const [needsReview, setNeedsReview] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    post('list', token).then((body) => {
      setList(body.tournaments);
      setOrganizer(body.organizer);
      const sticky = loadGame();
      const first = body.tournaments.find((t) => t.id === sticky?.tid) || body.tournaments[0];
      setTid(first ? first.id : null);
      if (body.organizer) setPage('upload');
    }).catch((e) => setError(e.message));
  }, [token]);

  const tournament = useMemo(() => (list || []).find((t) => t.id === tid), [list, tid]);

  if (!token) {
    return (
      <div className="tour-panel">
        <p>The tournament pages are for signed-in members.</p>
        <button type="button" onClick={onSignIn}>Sign in</button>
      </div>
    );
  }
  if (error) return <div className="tour-panel"><p className="tour-error">{error}</p></div>;
  if (!list) return <div className="tour-panel"><p>Loading…</p></div>;
  if (!list.length) return <div className="tour-panel"><p>No tournaments yet.</p></div>;

  return (
    <div className="tour-panel">
      <div className="tour-row">
        <select value={tid || ''} onChange={(e) => setTid(e.target.value)} aria-label="Tournament">
          {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {organizer && (
      <div className="tour-tabs" role="tablist">
        {organizer && (
          <>
            <button type="button" className={page === 'upload' ? 'on' : ''} onClick={() => setPage('upload')}>Upload</button>
            <button type="button" className={page === 'review' ? 'on' : ''} onClick={() => setPage('review')}>
              Review{needsReview ? ` (${needsReview})` : ''}
            </button>
          </>
        )}
        <button type="button" className={page === 'standings' ? 'on' : ''} onClick={() => setPage('standings')}>Standings</button>
      </div>
      )}
      {tournament && page === 'upload' && (
        <Upload token={token} tournament={tournament} onCounts={setNeedsReview} />
      )}
      {tournament && page === 'review' && (
        <Review token={token} tournament={tournament} onCounts={setNeedsReview} />
      )}
      {tournament && page === 'standings' && <Standings token={token} tournament={tournament} />}
    </div>
  );
}

// --- Upload -------------------------------------------------------------------------

function Upload({ token, tournament, onCounts }) {
  const games = tournament.days.flatMap((d) => d.games);
  const sticky = loadGame();
  const [game, setGame] = useState(
    sticky?.tid === tournament.id && games.some((g) => g.number === sticky.game)
      ? sticky.game : games[0].number);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [counts, setCounts] = useState({});

  const refresh = useCallback(() => {
    post('cards', token, { tournament: tournament.id, game, status: 'none' })
      .then((b) => { setCounts(b.counts); onCounts(b.needs_review); })
      .catch(() => {});
  }, [token, tournament.id, game, onCounts]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);   // the progress line updates as cards are read
    return () => clearInterval(id);
  }, [refresh]);

  const pickGame = (n) => {
    setGame(n);
    saveGame({ tid: tournament.id, game: n });
  };

  const upload = async () => {
    setBusy(true);
    setMessage(null);
    let done = 0;
    try {
      for (const file of files) {
        const type = file.type || 'image/jpeg';
        const { upload: target } = await post('upload', token,
          { tournament: tournament.id, game, content_type: type });
        const res = await fetch(target.url, { method: target.method, headers: target.headers, body: file });
        if (!res.ok) throw new Error(`The photo upload failed (${res.status}).`);
        done += 1;
        setMessage(`Uploaded ${done} of ${files.length}.`);
      }
      setFiles([]);
      setMessage(`Uploaded ${done} card${done === 1 ? '' : 's'}.`);
      refresh();
    } catch (e) {
      setMessage(`${e.message} ${done} of ${files.length} uploaded.`);
    } finally {
      setBusy(false);
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="tour-page">
      <div className="tour-help">
        <p>Collect a round at a time: pick the <strong>game</strong> the cards were played in,
          then photograph every card from that game. The game you pick is the card&rsquo;s game,
          and it stays selected until you change it.</p>
        <p><strong>Camera</strong> takes one photo with the phone&rsquo;s camera.
          <strong> Photos</strong> picks one or more photos you took earlier.
          <strong> Upload scorecard</strong> sends them; it returns as soon as each photo is
          stored, so you can carry on with the next card straight away.</p>
        <p>Each card is then read in the background. The line below counts this game&rsquo;s
          cards as they are read; any that need a person go to <strong>Review</strong>.</p>
      </div>
      <div className="tour-row">
        <select value={game} onChange={(e) => pickGame(Number(e.target.value))} aria-label="Game">
          {tournament.days.flatMap((d) => d.games).map((g) => (
            <option key={g.number} value={g.number}>{g.label}</option>
          ))}
        </select>
      </div>
      <div className="tour-row">
        <label className="camera-button tour-file" title="Take a photo">
          Camera
          <input type="file" accept="image/*" capture="environment" hidden
                 onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>
        <label className="camera-button tour-file" title="Choose photos">
          Photos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                 onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>
        <button type="button" onClick={upload} disabled={!files.length || busy}>
          {busy ? 'Uploading…' : files.length > 1 ? `Upload ${files.length} scorecards` : 'Upload scorecard'}
        </button>
      </div>
      {message && <p className="tour-note">{message}</p>}
      <p className="tour-note">
        This game: {total} uploaded · {counts.read || 0} read · {(counts.review || 0) + (counts.failed || 0)} need review · {(counts.uploaded || 0) + (counts.reading || 0)} in queue
      </p>
    </div>
  );
}

// --- Review -------------------------------------------------------------------------

function Review({ token, tournament, onCounts }) {
  const [all, setAll] = useState(false);
  const [cards, setCards] = useState([]);
  const [open, setOpen] = useState(null);

  const refresh = useCallback(() => {
    post('cards', token, { tournament: tournament.id, status: all ? null : 'review,failed,rejected' })
      .then((b) => { setCards(b.cards); onCounts(b.needs_review); })
      .catch(() => {});
  }, [token, tournament.id, all, onCounts]);

  useEffect(() => { refresh(); }, [refresh]);

  const openCard = (cardId) => { setOpen(cardId); window.scrollTo(0, 0); };
  if (open) {
    return <CardEditor token={token} tournament={tournament} id={open}
                       onClose={() => { setOpen(null); refresh(); }} onOpen={openCard} />;
  }
  return (
    <div className="tour-page">
      <div className="tour-help">
        <p>Every card is read by AI. Most are saved straight away; the ones listed here
          need a person. Your job is to check each one against its photo and either fix it,
          have it read again, or reject it.</p>
        <p>A card lands here when a UBN isn&rsquo;t a member or doesn&rsquo;t match the
          name on the card, when the number of players is wrong for the day, when a cell was
          left blank, when two cards claim the same players and game, or when reading failed.
          Open a card to see why.</p>
        <p>Tick <strong>Show every card</strong> to spot-check cards that were saved without
          review.</p>
      </div>
      <label className="settings-toggle">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <span>Show every card, for spot checks</span>
      </label>
      {!cards.length && <p className="tour-note">Nothing to review.</p>}
      <ul className="tour-cards">
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" className="tour-card" onClick={() => openCard(c.id)}>
              <span className={`tour-pill ${c.status}`}>{STATUS_LABEL[c.status]}</span>
              <span>Game {c.game} · {c.type}</span>
              <span>{(c.players || []).map((p) => `${p.name} ${p.ubn}`).join(' & ')}</span>
              <span className="tour-faint">{(c.problems || [])[0] || triplet(c.result)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardEditor({ token, tournament, id, onClose, onOpen }) {
  const [data, setData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    post('card', token, { tournament: tournament.id, id }).then((b) => {
      setData(b);
      const ps = (b.card.players || []).map((p) => ({ name: p.name || '', ubn: p.ubn || '' }));
      while (ps.length < (b.card.players_expected || 1)) ps.push({ name: '', ubn: '' });
      setPlayers(ps);
      const empty = Object.fromEntries(ROWS.flatMap((r) => COLS.filter((c) => !(r === 7 && c === 'J')).map((c) => [`${c}${r}`, ''])));
      const n = b.card.type === 'double' ? 2 : 1;
      setSheets(b.sheets.length === n ? b.sheets : Array.from({ length: n }, () => ({ ...empty })));
    }).catch((e) => setError(e.message));
  }, [token, tournament.id, id]);

  // The result is recomputed on every edit, so the organizer sees what will be saved.
  useEffect(() => {
    if (!data) return undefined;
    const timer = setTimeout(() => {
      post('verify', token, { tournament: tournament.id, id,
        players: JSON.stringify(players), sheets: JSON.stringify(sheets) })
        .then(setCheck).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [token, tournament.id, id, data, players, sheets]);

  const act = async (path, extra) => {
    setBusy(true);
    setError(null);
    try {
      const out = await post(path, token, { tournament: tournament.id, id, ...extra });
      if (path === 'correct' && out.card.status !== 'read') {
        setError((out.card.problems || []).join(' ') || 'Still needs review.');
      } else {
        onClose();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="tour-page"><p>{error || 'Loading…'}</p></div>;
  const card = data.card;
  const setCell = (i, name, v) => setSheets((prev) => prev.map((s, j) => (j === i ? { ...s, [name]: v } : s)));
  const setPlayer = (i, field, v) => setPlayers((prev) => prev.map((p, j) => (j === i ? { ...p, [field]: v } : p)));

  return (
    <div className="tour-page tour-editor">
      <div className="tour-row">
        <span className={`tour-pill ${card.status}`}>{STATUS_LABEL[card.status]}</span>
        <span>Game {card.game} · {card.type} · uploaded {(card.uploaded_at || '').slice(11, 16)}</span>
      </div>
      {(card.problems || []).map((p) => <p key={p} className="tour-error">{p}</p>)}
      {card.duplicate_of && (
        <button type="button" className="tour-add" onClick={() => onOpen(card.duplicate_of)}>
          Open the other card for these players
        </button>
      )}
      <div className="tour-editor-cols">
      <div className="tour-editor-photo">
        <a href={data.photo_url} target="_blank" rel="noreferrer" title="Open the photo full size">
          <UprightPhoto src={data.photo_url} rotation={data.balut_eye?.rotation || 0} />
        </a>
      </div>
      <div className="tour-editor-form">
      <div className="tour-help">
        <p>Compare what was read with the photo, and correct it to match the card.</p>
        <p><strong>Players:</strong> type each UBN; the member&rsquo;s name appears beside it,
          which catches a mistyped number. <strong>Remove</strong> anyone read by mistake.</p>
        <p><strong>Cells:</strong> enter the game cells and jackpots exactly as written, a
          number or <code>x</code> for a strike. Score and points are calculated from them,
          and the result below updates as you type.</p>
        <p><strong>Save result</strong> counts the card. <strong>Read again</strong> sends it
          back to the AI (for example after an outage). <strong>Reject card</strong> is for a
          photo nobody can read: the players&rsquo; game stays empty until a new photo is
          uploaded.</p>
      </div>
      <h3 className="tour-h3">Players</h3>
      {players.map((p, i) => (
        <div className="tour-row" key={i}>
          <input className="tour-input" value={p.ubn} placeholder="UBN" inputMode="numeric"
                 onChange={(e) => setPlayer(i, 'ubn', e.target.value.replace(/\D/g, ''))} />
          <input className="tour-input wide" value={p.name} placeholder="Name"
                 onChange={(e) => setPlayer(i, 'name', e.target.value)} />
          <span className="tour-faint">{check?.member_names?.[i] || 'not a member'}</span>
          {players.length > 1 && (
            <button type="button" className="tour-remove" title="Not a player on this card"
                    onClick={() => setPlayers((prev) => prev.filter((_, j) => j !== i))}>
              Remove
            </button>
          )}
        </div>
      ))}
      {players.length < (card.players_expected || 1) && (
        <button type="button" className="tour-add"
                onClick={() => setPlayers((prev) => [...prev, { name: '', ubn: '' }])}>
          Add a player
        </button>
      )}
      <div className="tour-sheets">
      {sheets.map((s, i) => (
        <table className="tour-grid" key={i}>
          <caption>{sheets.length > 1 ? `Sheet ${'AB'[i]}` : 'Game cells and jackpots'}</caption>
          <thead><tr><th />{COLS.map((c) => <th key={c} className={c === 'J' ? 'jcol' : undefined}>{c}</th>)}</tr></thead>
          <tbody>
            {ROWS.map((r, k) => (
              <tr key={r}>
                <th>{ROW_NAMES[k]}</th>
                {COLS.map((c) => (r === 7 && c === 'J' ? <td key={c} className="jcol" /> : (
                  <td key={c} className={c === 'J' ? 'jcol' : undefined}>
                    <input value={s[`${c}${r}`] ?? ''} aria-label={`${c}${r}`}
                           onChange={(e) => setCell(i, `${c}${r}`, e.target.value.replace(/[^0-9xX-]/g, ''))} />
                  </td>
                )))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      </div>
      <p className="tour-note tour-result">
        Result: <strong>{triplet(check?.result)}</strong> <span className="tour-faint">points · score · baluts, recomputed as you edit</span>
      </p>
      {(check?.problems || []).map((p) => <p key={p} className="tour-faint">{p}</p>)}
      {(check?.hints || []).map((p) => <p key={p} className="tour-faint">{p}</p>)}
      {error && <p className="tour-error">{error}</p>}
      <div className="result-actions">
        <button type="button" className="result-secondary" onClick={onClose}>Back</button>
        <button type="button" className="result-secondary" disabled={busy} onClick={() => act('reject')}>Reject card</button>
        <button type="button" className="result-secondary" disabled={busy} onClick={() => act('retry')}>Read again</button>
        <button type="button" disabled={busy || (check?.problems || []).length > 0}
                onClick={() => act('correct', { players: JSON.stringify(players), sheets: JSON.stringify(sheets) })}>
          Save result
        </button>
      </div>
      </div>
      </div>
    </div>
  );
}

// The photo turned upright the way Balut Eye found it (single cards only; the
// rotation is deg CW relative to the browser's own EXIF-oriented rendering), drawn on
// a canvas as the practice page does. Falls back to the plain photo if the canvas
// can't be read (a cross-origin image without CORS) or there is no rotation.
function UprightPhoto({ src, rotation }) {
  const [shown, setShown] = useState(src);
  useEffect(() => {
    const rot = ((rotation % 360) + 360) % 360;
    setShown(src);
    if (!rot) return undefined;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
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
        setShown(canvas.toDataURL('image/jpeg', 0.9));
      } catch (e) {
        /* tainted canvas: keep the plain photo */
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, rotation]);
  return <img className="tour-photo" src={shown} alt="The scorecard" />;
}

// --- Standings ----------------------------------------------------------------------

function Standings({ token, tournament }) {
  const [day, setDay] = useState(tournament.days[0].day);
  const [table, setTable] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    const load = () => post('standings', token, { tournament: tournament.id, day })
      .then((b) => { if (live) setTable(b); }).catch((e) => live && setError(e.message));
    load();
    const id = setInterval(load, 15000);   // live during the tournament
    return () => { live = false; clearInterval(id); };
  }, [token, tournament.id, day]);

  return (
    <div className="tour-page">
      <div className="tour-row">
        <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Day">
          {tournament.days.map((d) => (
            <option key={d.day} value={d.day}>{d.label} · {d.players === 2 ? 'teams' : 'individual'}</option>
          ))}
        </select>
      </div>
      <div className="tour-help">
        <p>Each day is ranked on its own; pick another day from the list above. Every cell
          is a game&rsquo;s result: <strong>points · score · baluts</strong>, and Total adds
          up each of the three.</p>
        <p>Players are ranked by total points, then total score, then baluts, highest
          first. Players equal on all three share a rank. A game that hasn&rsquo;t been
          read yet shows as &ldquo;not read yet&rdquo; and counts as nothing, so the table
          fills in as the cards are read.</p>
      </div>
      {error && <p className="tour-error">{error}</p>}
      {table && !table.rows.length && <p className="tour-note">No results yet.</p>}
      {table && table.rows.length > 0 && (
        <div className="tour-scroll">
          <table className="tour-standings">
            <thead>
              <tr>
                <th className="num">#</th><th className="sticky">Players</th>
                {table.games.map((g) => <th key={g.number} className="num">Game {g.number}{g.type === 'double' ? ' · double' : ''}</th>)}
                <th className="sticky-right num">Total</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.key}>
                  <td className="num rank">{r.rank}</td>
                  <td className="sticky">{r.names.join(' & ')}<br /><span className="tour-faint">{r.ubns.join(' & ') || r.key}</span></td>
                  {r.games.map((g, i) => (
                    <td key={i} className="num">{g ? <Triplet r={g} /> : <span className="tour-faint">not read yet</span>}</td>
                  ))}
                  <td className="sticky-right num total"><Triplet r={r.total} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Tournament;
