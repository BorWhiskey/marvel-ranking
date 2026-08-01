import React, { useState, useEffect, useRef, useCallback } from "react";
import { GripVertical, X, Plus, Film, ChevronDown, Download, Upload } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, firebaseConfigured } from "./firebaseClient";

// ---------- Phase palette (mapped loosely to the Infinity Stones) ----------
const PHASES = {
  P1: { label: "Phase 1", sub: "Space", color: "#4C8DFF" },
  P2: { label: "Phase 2", sub: "Reality", color: "#E2483D" },
  P3: { label: "Phase 3", sub: "Power", color: "#9D5CE0" },
  P4: { label: "Phase 4", sub: "Time", color: "#2FB673" },
  P5: { label: "Phase 5", sub: "Mind", color: "#E0B93D" },
  P6: { label: "Phase 6", sub: "Soul", color: "#E0793D" },
  EXT: { label: "Extended", sub: "Non-MCU", color: "#8B92A8" },
};

// ---------- Default catalog ----------
const DEFAULTS = [
  ["Iron Man", "2008-05-02", "P1"],
  ["The Incredible Hulk", "2008-06-13", "P1"],
  ["Iron Man 2", "2010-05-07", "P1"],
  ["Thor", "2011-05-06", "P1"],
  ["Captain America: The First Avenger", "2011-07-22", "P1"],
  ["The Avengers", "2012-05-04", "P1"],
  ["Iron Man 3", "2013-05-03", "P2"],
  ["Thor: The Dark World", "2013-11-08", "P2"],
  ["Captain America: The Winter Soldier", "2014-04-04", "P2"],
  ["Guardians of the Galaxy", "2014-08-01", "P2"],
  ["Avengers: Age of Ultron", "2015-05-01", "P2"],
  ["Ant-Man", "2015-07-17", "P2"],
  ["Captain America: Civil War", "2016-05-06", "P3"],
  ["Doctor Strange", "2016-11-04", "P3"],
  ["Guardians of the Galaxy Vol. 2", "2017-05-05", "P3"],
  ["Spider-Man: Homecoming", "2017-07-07", "P3"],
  ["Thor: Ragnarok", "2017-11-03", "P3"],
  ["Black Panther", "2018-02-16", "P3"],
  ["Avengers: Infinity War", "2018-04-27", "P3"],
  ["Ant-Man and the Wasp", "2018-07-06", "P3"],
  ["Captain Marvel", "2019-03-08", "P3"],
  ["Avengers: Endgame", "2019-04-26", "P3"],
  ["Spider-Man: Far From Home", "2019-07-02", "P3"],
  ["Black Widow", "2021-07-09", "P4"],
  ["Shang-Chi and the Legend of the Ten Rings", "2021-09-03", "P4"],
  ["Eternals", "2021-11-05", "P4"],
  ["Spider-Man: No Way Home", "2021-12-17", "P4"],
  ["Doctor Strange in the Multiverse of Madness", "2022-05-06", "P4"],
  ["Thor: Love and Thunder", "2022-07-08", "P4"],
  ["Black Panther: Wakanda Forever", "2022-11-11", "P4"],
  ["Ant-Man and the Wasp: Quantumania", "2023-02-17", "P5"],
  ["Guardians of the Galaxy Vol. 3", "2023-05-05", "P5"],
  ["The Marvels", "2023-11-10", "P5"],
  ["Deadpool & Wolverine", "2024-07-26", "P5"],
  ["Captain America: Brave New World", "2025-02-14", "P5"],
  ["Thunderbolts*", "2025-05-02", "P5"],
  ["The Fantastic Four: First Steps", "2025-07-25", "P6"],
  ["Spider-Man: Brand New Day", "2026-07-31", "P6"],
  ["Avengers: Doomsday", "2026-12-18", "P6"],
  ["Avengers: Secret Wars", "2027-12-17", "P6"],
  ["Blade", "1998-08-21", "EXT"],
  ["Blade II", "2002-03-22", "EXT"],
  ["Spider-Man", "2002-05-03", "EXT"],
  ["Spider-Man 2", "2004-06-30", "EXT"],
  ["Blade: Trinity", "2004-12-08", "EXT"],
  ["Spider-Man 3", "2007-05-04", "EXT"],
  ["The Amazing Spider-Man", "2012-07-03", "EXT"],
  ["The Amazing Spider-Man 2", "2014-05-02", "EXT"],
  ["Venom", "2018-10-05", "EXT"],
  ["Spider-Man: Into the Spider-Verse", "2018-12-14", "EXT"],
  ["Venom: Let There Be Carnage", "2021-10-01", "EXT"],
  ["Morbius", "2022-04-01", "EXT"],
  ["Spider-Man: Across the Spider-Verse", "2023-06-02", "EXT"],
  ["Venom: The Last Dance", "2024-10-25", "EXT"],
  ["Kraven the Hunter", "2024-12-13", "EXT"],
].map(([title, date, phase]) => ({
  id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + date.slice(0, 4),
  title,
  date,
  year: date.slice(0, 4),
  phase,
  custom: false,
}));

const DOC_PATH = ["marvelRankings", "default"]; // single doc holding the whole state

export default function App() {
  const [movies, setMovies] = useState({});
  const [order, setOrder] = useState([]);
  const [includeExtended, setIncludeExtended] = useState(true);
  const [mode, setMode] = useState("rank");
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [saveState, setSaveState] = useState({ status: "idle", message: "" });

  const orderRef = useRef(order);
  orderRef.current = order;
  const rowRefs = useRef({});

  // ---------- Load ----------
  useEffect(() => {
    (async () => {
      const base = {};
      DEFAULTS.forEach((m) => (base[m.id] = m));
      let finalOrder = DEFAULTS.map((m) => m.id);
      let finalIncludeExtended = true;

      if (!firebaseConfigured) {
        setSaveState({
          status: "unsupported",
          message: "Firebase isn't configured yet — add the VITE_FIREBASE_* variables.",
        });
      } else {
        try {
          const snap = await getDoc(doc(db, ...DOC_PATH));
          if (snap.exists()) {
            const saved = snap.data();
            (saved.custom || []).forEach((m) => (base[m.id] = { ...m, custom: true }));
            if (Array.isArray(saved.order) && saved.order.length) {
              const knownIds = new Set(Object.keys(base));
              const savedValid = saved.order.filter((id) => knownIds.has(id));
              const missing = Object.keys(base).filter((id) => !savedValid.includes(id));
              finalOrder = [...savedValid, ...missing];
            }
            if (typeof saved.includeExtended === "boolean") {
              finalIncludeExtended = saved.includeExtended;
            }
          }
          setSaveState({ status: "saved", message: "Synced" });
        } catch (e) {
          setSaveState({ status: "error", message: "Couldn't load from Firebase: " + (e.message || String(e)) });
        }
      }

      setMovies(base);
      setOrder(finalOrder);
      setIncludeExtended(finalIncludeExtended);
      setLoaded(true);
    })();
  }, []);

  // ---------- Save (debounced) ----------
  const saveTimer = useRef(null);
  const persist = useCallback((nextOrder, nextMovies, nextIncludeExtended) => {
    if (!firebaseConfigured) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const custom = Object.values(nextMovies).filter((m) => m.custom);
        const payload = {
          order: nextOrder,
          custom,
          includeExtended: nextIncludeExtended,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, ...DOC_PATH), payload);
        setSaveState({
          status: "saved",
          message: "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        });
      } catch (e) {
        setSaveState({ status: "error", message: "Save failed: " + (e.message || String(e)) });
      }
    }, 500);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    persist(order, movies, includeExtended);
  }, [order, movies, includeExtended, loaded, persist]);

  // ---------- Derived lists ----------
  const visibleOrder = order.filter((id) => {
    const m = movies[id];
    if (!m) return false;
    return includeExtended || m.phase !== "EXT";
  });

  const rankOf = {};
  visibleOrder.forEach((id, i) => (rankOf[id] = i + 1));

  const displayIds =
    mode === "rank"
      ? visibleOrder
      : [...visibleOrder].sort((a, b) => (movies[a].date < movies[b].date ? -1 : 1));

  // ---------- Drag logic (pointer-based, touch friendly) ----------
  const handlePointerDown = (e, id) => {
    if (mode !== "rank") return;
    e.preventDefault();
    setDraggingId(id);
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  useEffect(() => {
    if (!draggingId) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyTouchAction = document.body.style.touchAction;
    const prevBodyUserSelect = document.body.style.userSelect;
    const prevBodyWebkitUserSelect = document.body.style.webkitUserSelect;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";

    const handleMove = (e) => {
      e.preventDefault();
      const y = e.clientY ?? (e.touches && e.touches[0].clientY);
      if (y == null) return;
      let closestId = null;
      let closestDist = Infinity;
      visibleOrder.forEach((id) => {
        const el = rowRefs.current[id];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - y);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = id;
        }
      });
      if (closestId && closestId !== draggingId) {
        const current = orderRef.current;
        const draggingIdx = current.indexOf(draggingId);
        const closestIdxOrig = current.indexOf(closestId);
        const newOrder = current.filter((id) => id !== draggingId);
        let targetIdx = newOrder.indexOf(closestId);
        if (draggingIdx < closestIdxOrig) {
          targetIdx += 1;
        }
        newOrder.splice(targetIdx, 0, draggingId);
        setOrder(newOrder);
      }
    };

    const handleUp = () => setDraggingId(null);

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.touchAction = prevBodyTouchAction;
      document.body.style.userSelect = prevBodyUserSelect;
      document.body.style.webkitUserSelect = prevBodyWebkitUserSelect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId]);

  // ---------- Add / delete custom movies ----------
  const [form, setForm] = useState({ title: "", date: "", phase: "P6" });

  const addMovie = () => {
    if (!form.title.trim() || !form.date) return;
    const id = "custom-" + Date.now();
    const newMovie = {
      id,
      title: form.title.trim(),
      date: form.date,
      year: form.date.slice(0, 4),
      phase: form.phase,
      custom: true,
    };
    setMovies((prev) => ({ ...prev, [id]: newMovie }));
    setOrder((prev) => [...prev, id]);
    setForm({ title: "", date: "", phase: "P6" });
    setShowAdd(false);
  };

  const removeMovie = (id) => {
    setMovies((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((oid) => oid !== id));
  };

  // ---------- Backup: export / import (still handy for safety) ----------
  const fileInputRef = useRef(null);

  const exportBackup = () => {
    const custom = Object.values(movies).filter((m) => m.custom);
    const payload = { order, custom, includeExtended, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `marvel-rankings-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importBackup = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const saved = JSON.parse(evt.target.result);
        const base = {};
        DEFAULTS.forEach((m) => (base[m.id] = m));
        (saved.custom || []).forEach((m) => (base[m.id] = { ...m, custom: true }));
        const knownIds = new Set(Object.keys(base));
        const savedValid = (saved.order || []).filter((id) => knownIds.has(id));
        const missing = Object.keys(base).filter((id) => !savedValid.includes(id));
        setMovies(base);
        setOrder([...savedValid, ...missing]);
        if (typeof saved.includeExtended === "boolean") setIncludeExtended(saved.includeExtended);
      } catch (err) {
        alert("That file doesn't look like a valid backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#0B0D14", display: "flex", alignItems: "center", justifyContent: "center", color: "#8B92A8", fontFamily: "system-ui" }}>
        Loading rankings…
      </div>
    );
  }

  const shownCount = visibleOrder.length;
  const totalCount = order.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B0D14",
        color: "#F5F1E8",
        fontFamily: "'Helvetica Neue', Arial, system-ui, sans-serif",
        paddingBottom: 64,
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        .tabular { font-variant-numeric: tabular-nums; }
        .row-card { transition: box-shadow 120ms ease, opacity 120ms ease; }
        .switch-track { transition: background 150ms ease; }
        .switch-thumb { transition: transform 150ms ease; }
        .seg-btn { transition: background 120ms ease, color 120ms ease; }
        .icon-btn:hover { opacity: 1 !important; }
        ::selection { background: #D4A94F55; }
      `}</style>

      <div style={{ padding: "32px 20px 20px", maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "0.06em", margin: 0, textTransform: "uppercase" }}>
          Marvel Rankings
        </h1>
        <div style={{ height: 3, width: 56, background: "#D4A94F", marginTop: 10, marginBottom: 10, borderRadius: 2 }} />
        <p style={{ color: "#8B92A8", fontSize: 14, margin: 0 }}>
          {shownCount} of {totalCount} films · drag the handle to change your ranking
        </p>

        {(saveState.status === "error" || saveState.status === "unsupported") && (
          <div
            style={{
              marginTop: 12,
              background: "#3A2A1A",
              border: "1px solid #E0793D55",
              color: "#E0B98F",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12.5,
              lineHeight: 1.4,
            }}
          >
            ⚠ {saveState.message}
          </div>
        )}
        {saveState.status === "saved" && (
          <p style={{ color: "#4C8DFF", fontSize: 11.5, margin: "6px 0 0", fontWeight: 600 }}>● {saveState.message}</p>
        )}
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", background: "#151822", borderRadius: 10, padding: 4, gap: 4 }}>
          {[
            { key: "rank", label: "My Ranking" },
            { key: "release", label: "Release Order" },
          ].map((opt) => (
            <button
              key={opt.key}
              className="seg-btn"
              onClick={() => setMode(opt.key)}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 7,
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.02em",
                cursor: "pointer",
                background: mode === opt.key ? "#D4A94F" : "transparent",
                color: mode === opt.key ? "#0B0D14" : "#8B92A8",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <button
            onClick={() => setIncludeExtended((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span
              className="switch-track"
              style={{
                width: 40,
                height: 22,
                borderRadius: 999,
                background: includeExtended ? "#D4A94F" : "#2A2E3A",
                position: "relative",
                display: "inline-block",
                flexShrink: 0,
              }}
            >
              <span
                className="switch-thumb"
                style={{
                  position: "absolute",
                  top: 2,
                  left: 2,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#0B0D14",
                  transform: includeExtended ? "translateX(18px)" : "translateX(0)",
                }}
              />
            </span>
            <span style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#F5F1E8" }}>Extended Universe</div>
              <div style={{ fontSize: 11.5, color: "#8B92A8" }}>Sony Spider-Man films, Blade &amp; more</div>
            </span>
          </button>

          <button
            onClick={() => setShowAdd((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#151822",
              border: "1px solid #2A2E3A",
              color: "#F5F1E8",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus size={15} /> Add
          </button>
        </div>

        {showAdd && (
          <div style={{ background: "#151822", border: "1px solid #2A2E3A", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              placeholder="Movie title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={{ background: "#0B0D14", border: "1px solid #2A2E3A", borderRadius: 7, padding: "9px 10px", color: "#F5F1E8", fontSize: 13.5 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                style={{ flex: 1, background: "#0B0D14", border: "1px solid #2A2E3A", borderRadius: 7, padding: "9px 10px", color: "#F5F1E8", fontSize: 13.5 }}
              />
              <div style={{ position: "relative", flex: 1 }}>
                <select
                  value={form.phase}
                  onChange={(e) => setForm({ ...form, phase: e.target.value })}
                  style={{ width: "100%", appearance: "none", background: "#0B0D14", border: "1px solid #2A2E3A", borderRadius: 7, padding: "9px 28px 9px 10px", color: "#F5F1E8", fontSize: 13.5 }}
                >
                  {Object.entries(PHASES).map(([key, p]) => (
                    <option key={key} value={key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 9, top: 11, color: "#8B92A8", pointerEvents: "none" }} />
              </div>
            </div>
            <button
              onClick={addMovie}
              style={{ background: "#D4A94F", border: "none", borderRadius: 7, padding: "10px", color: "#0B0D14", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Add to list
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={exportBackup}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#151822", border: "1px solid #2A2E3A", color: "#8B92A8", borderRadius: 8, padding: "9px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Download size={13} /> Export backup
          </button>
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#151822", border: "1px solid #2A2E3A", color: "#8B92A8", borderRadius: 8, padding: "9px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Upload size={13} /> Import backup
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={importBackup} style={{ display: "none" }} />
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {displayIds.map((id) => {
          const m = movies[id];
          if (!m) return null;
          const phase = PHASES[m.phase];
          const rank = rankOf[id];
          const isDragging = draggingId === id;

          return (
            <div
              key={id}
              ref={(el) => (rowRefs.current[id] = el)}
              className="row-card"
              style={{
                position: "relative",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#151822",
                borderLeft: `4px solid ${phase.color}`,
                borderRadius: 10,
                padding: "12px 14px",
                boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.5)" : "none",
                opacity: isDragging ? 0.85 : 1,
                zIndex: isDragging ? 10 : 1,
              }}
            >
              <span
                aria-hidden
                className="tabular"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 52,
                  fontWeight: 800,
                  color: phase.color,
                  opacity: 0.08,
                  pointerEvents: "none",
                  lineHeight: 1,
                }}
              >
                {rank}
              </span>

              {mode === "rank" ? (
                <div
                  onPointerDown={(e) => handlePointerDown(e, id)}
                  style={{ touchAction: "none", cursor: isDragging ? "grabbing" : "grab", color: "#8B92A8", display: "flex", alignItems: "center", padding: 6, flexShrink: 0 }}
                >
                  <GripVertical size={18} />
                </div>
              ) : (
                <div style={{ width: 18, flexShrink: 0 }} />
              )}

              <div className="tabular" style={{ fontSize: 17, fontWeight: 800, color: phase.color, width: 30, flexShrink: 0, textAlign: "center" }}>
                {rank}
              </div>

              <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span className="tabular" style={{ fontSize: 11.5, color: "#8B92A8" }}>
                    {m.year}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: phase.color,
                      background: phase.color + "22",
                      borderRadius: 5,
                      padding: "2px 6px",
                    }}
                  >
                    {phase.label}
                  </span>
                </div>
              </div>

              {m.custom && (
                <button
                  className="icon-btn"
                  onClick={() => removeMovie(id)}
                  style={{ background: "none", border: "none", color: "#8B92A8", opacity: 0.6, cursor: "pointer", flexShrink: 0, padding: 6 }}
                  aria-label={`Remove ${m.title}`}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          );
        })}

        {displayIds.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#8B92A8" }}>
            <Film size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
            <div style={{ fontSize: 13 }}>No films to show. Try enabling Extended Universe.</div>
          </div>
        )}
      </div>
    </div>
  );
}
