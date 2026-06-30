import { useState, useEffect, useMemo, useRef } from 'react';
import { useMusicMatch } from '../context/MusicMatchContext';
import { Pagination } from '../components/Pagination';

const PAGE_SIZES = [10, 25, 50];

// Convierte el título de la canción en el mismo slug usado para los .mp3
// Ej: "Freak'N You" -> "freak-n-you" | "Te Encontré" -> "te-encontre"
function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes/acentos
    .replace(/'/g, '-')                                 // apóstrofes -> guion
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')                        // quita signos raros
    .trim()
    .replace(/\s+/g, '-')                                // espacios -> guion
    .replace(/-+/g, '-');                                // colapsa guiones repetidos
}

// Si el song trae coverUrl explícito lo respeta; si no, lo deriva del título
function resolveImagePath(song: { title: string; coverUrl?: string }) {
  if (song.coverUrl) {
    if (song.coverUrl.startsWith('http') || song.coverUrl.startsWith('/images/')) return song.coverUrl;
    return `/images/${song.coverUrl}`;
  }
  return `/images/${slugify(song.title)}.png`;
}

function AudioPlayer({ src, songId, playingId, onPlay }: {
  src: string;
  songId: number;
  playingId: number | null;
  onPlay: (id: number | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const isPlaying = playingId === songId;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={e => setProgress((e.currentTarget.currentTime / (e.currentTarget.duration || 1)) * 100)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => onPlay(null)}
      />
      <button
        onClick={() => onPlay(isPlaying ? null : songId)}
        style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          background: 'var(--primary)', color: '#fff', fontSize: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', cursor: 'pointer',
        }}
        title={isPlaying ? 'Pause' : 'Play preview'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div
        style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', cursor: 'pointer', position: 'relative' }}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          if (audioRef.current) audioRef.current.currentTime = pct * audioRef.current.duration;
        }}
      >
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', borderRadius: '2px', transition: 'width 0.1s' }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', flexShrink: 0, fontFamily: 'monospace' }}>
        {duration ? fmt((progress / 100) * duration) : '0:00'}
      </span>
    </div>
  );
}

export function RateSongs() {
  const { songsList, ratedMap, submitRating, loadingSongs, addToast, searchSongs, searchResults, searchQuery, setSearchQuery } = useMusicMatch();
  const [pending, setPending] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [showUnratedOnly, setShowUnratedOnly] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [hoveredStar, setHoveredStar] = useState<{ id: number; star: number } | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => { searchSongs(searchQuery); }, 400);
    setDebounceTimer(t);
    setPage(0);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const displayList = useMemo(() => {
    let list = searchQuery.trim() ? searchResults : songsList;
    if (showUnratedOnly) list = list.filter(s => !ratedMap[s.id] && !pending[s.id]);
    return list;
  }, [songsList, searchResults, searchQuery, ratedMap, pending, showUnratedOnly]);

  const totalElements = displayList.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));
  const paged = displayList.slice(page * pageSize, (page + 1) * pageSize);

  const effectiveRating = (id: number) => pending[id] ?? ratedMap[id] ?? 0;
  const ratedCount = songsList.filter(s => effectiveRating(s.id) > 0).length;
  const progress = songsList.length > 0 ? (ratedCount / songsList.length) * 100 : 0;

  // Guardado MANUAL: solo se asigna el rating al estado "pending", no se envía hasta presionar "Save"
  const setStarRating = (songId: number, score: number) => {
    setPending(p => ({ ...p, [songId]: score }));
  };

  const handleSave = async () => {
    if (Object.keys(pending).length === 0) return;
    setSaving(true);
    let saved = 0;
    try {
      await Promise.all(
        Object.entries(pending).map(([id, score]) =>
          submitRating(Number(id), score).then(() => { saved++; })
        )
      );
      setPending({});
      addToast(`Saved ${saved} rating${saved !== 1 ? 's' : ''}!`, 'success');
    } catch (e: any) {
      addToast(e?.message || 'Failed to save some ratings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadingSongs) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <h1>⭐ Rate Songs</h1>
          <p>Rate songs to get personalized recommendations · Click ▶ to preview</p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Progress</span>
            <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>{ratedCount} / {songsList.length} rated</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: '200px' }}
            placeholder="🔍 Search songs or artists…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--muted-foreground)', cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={showUnratedOnly} onChange={e => { setShowUnratedOnly(e.target.checked); setPage(0); }} />
            Unrated only
          </label>
        </div>

        {/* Pending badge */}
        {Object.keys(pending).length > 0 && (
          <div className="alert alert-info" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{Object.keys(pending).length} unsaved rating{Object.keys(pending).length !== 1 ? 's' : ''}</span>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save All'}
            </button>
          </div>
        )}

        {/* Song grid */}
        {paged.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎵</div>
            <h3>No songs found</h3>
            <p>{searchQuery ? 'Try a different search term' : showUnratedOnly ? 'All songs are rated!' : 'No songs available'}</p>
          </div>
        ) : (
          <div className="songs-grid">
            {paged.map(song => {
              const current = effectiveRating(song.id);
              const isPending = pending[song.id] !== undefined;
              const hovered = hoveredStar?.id === song.id ? hoveredStar.star : null;
              const displayStars = hovered ?? current;
              const imgSrc = resolveImagePath(song);

              return (
                <div key={song.id} className="song-card" style={{ border: isPending ? '1px solid var(--primary)' : undefined }}>
                  {imgSrc
                    ? <img
                        className="song-cover"
                        src={imgSrc}
                        alt={song.title}
                        onError={e => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    : null
                  }
                  <div className="song-cover-placeholder" style={{ display: imgSrc ? 'none' : 'flex' }}>🎵</div>
                  <div className="song-info">
                    <h4 title={song.title}>{song.title}</h4>
                    <p className="artist" title={song.artist}>{song.artist}</p>
                    {song.albumName && <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '4px' }}>💿 {song.albumName}</p>}

                    {/* Reproductor de audio */}
                    {song.previewUrl ? (
                      <AudioPlayer
                        src={song.previewUrl}
                        songId={song.id}
                        playingId={playingId}
                        onPlay={setPlayingId}
                      />
                    ) : (
                      <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '6px', fontStyle: 'italic' }}>No preview available</p>
                    )}

                    {/* Estrellas (guardado manual: solo marca "pending") */}
                    <div className="stars" style={{ marginTop: '10px' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          className={`star ${displayStars >= star ? 'active' : ''}`}
                          style={{
                            color: displayStars >= star ? '#fbbf24' : 'var(--border)',
                            fontSize: '20px',
                            transition: 'color 0.1s, transform 0.1s',
                            transform: hoveredStar?.id === song.id && hoveredStar.star >= star ? 'scale(1.2)' : 'scale(1)',
                          }}
                          onMouseEnter={() => setHoveredStar({ id: song.id, star })}
                          onMouseLeave={() => setHoveredStar(null)}
                          onClick={() => setStarRating(song.id, star)}
                          title={`${star} star${star !== 1 ? 's' : ''}`}
                        >★</button>
                      ))}
                      {current > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginLeft: '6px', alignSelf: 'center' }}>
                          {current}/5
                        </span>
                      )}
                    </div>

                    {/* Audio features */}
                    {(song.energy != null || song.danceability != null || song.valence != null) && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                        {song.energy != null && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '4px', color: 'var(--primary-light)' }}>
                            ⚡ {Math.round(song.energy * 100)}%
                          </span>
                        )}
                        {song.danceability != null && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '4px', color: 'var(--accent)' }}>
                            💃 {Math.round(song.danceability * 100)}%
                          </span>
                        )}
                        {song.valence != null && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '4px', color: '#fbbf24' }}>
                            😊 {Math.round(song.valence * 100)}%
                          </span>
                        )}
                      </div>
                    )}

                    {isPending && (
                      <span style={{ fontSize: '11px', color: 'var(--primary)', marginTop: '4px', display: 'block' }}>● Unsaved</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            page={page} totalPages={totalPages} totalElements={totalElements}
            pageSize={pageSize} onPage={setPage} onSizeChange={s => { setPageSize(s); setPage(0); }}
            pageSizes={PAGE_SIZES}
          />
        )}

        {/* Botón de guardado manual (fijo abajo) */}
        {Object.keys(pending).length > 0 && (
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '24px', padding: '14px', justifyContent: 'center', fontSize: '16px' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : `💾 Save ${Object.keys(pending).length} Rating${Object.keys(pending).length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}
