import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMusicMatch } from '../context/MusicMatchContext';

// Convierte el título de la canción en el mismo slug usado para los .mp3 / .png
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
function resolveImagePath(song: { title: string; coverUrl?: string | null }) {
  if (song.coverUrl) {
    if (song.coverUrl.startsWith('http') || song.coverUrl.startsWith('/images/')) return song.coverUrl;
    return `/images/${song.coverUrl}`;
  }
  return `/images/${slugify(song.title)}.png`;
}

export function Recommendations() {
  const { 
    recommendation, 
    loadingRecs, 
    fetchRecommendations, 
    latentProfile, 
    latentUsers,
    compatibilities,
    loadingCompatibilities,
    fetchCompatibilities
  } = useMusicMatch();
  const navigate = useNavigate();

  useEffect(() => { 
    fetchRecommendations();
    fetchCompatibilities();
  }, []);

  // Crear mapa de compatibilidades para acceso rápido
  const compatibilityMap = useMemo(() => {
    const map = new Map<number, number>();
    compatibilities.forEach(item => {
      map.set(item.userId, item.compatibilityScore);
    });
    return map;
  }, [compatibilities]);

  // Encontrar el usuario con mejor compatibilidad (excluyendo al usuario actual)
  const bestMatch = useMemo(() => {
    if (!latentProfile || latentUsers.length === 0) return null;
    return latentUsers
      .filter(u => u.userId !== latentProfile.userId)
      .sort((a, b) => {
        const scoreA = compatibilityMap.get(a.userId) || 0;
        const scoreB = compatibilityMap.get(b.userId) || 0;
        return scoreB - scoreA;
      })[0] || null;
  }, [latentUsers, latentProfile, compatibilityMap]);

  // Usar el recommendation.basedOnUserName si existe, sino usar el bestMatch
  const closestUserName = recommendation?.basedOnUserName || bestMatch?.userName || '';
  
  // Calcular compatibilidad del mejor match
  const bestCompatibilityScore = bestMatch 
    ? (compatibilityMap.get(bestMatch.userId) || 0)
    : (latentProfile?.compatibilityScore || 0);

  if (loadingRecs || loadingCompatibilities) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  const songs = recommendation?.songs ?? [];

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <h1>⚡ Recommendations</h1>
          <p>Songs tailored to your taste via SVD collaborative filtering</p>
        </div>

        {songs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎵</div>
            <h3>No recommendations yet</h3>
            <p>Rate more songs so the algorithm can find your taste.</p>
            <button className="btn btn-primary" onClick={() => navigate('/rate')}>Rate Songs</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px' }}>
            {/* Songs */}
            <div>
              {recommendation && (
                <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '20px' }}>
                  Based on <strong style={{ color: '#9f5ef8' }}>{recommendation.basedOnUserName}</strong>'s taste —{' '}
                  <span className="badge badge-info">
                    {Math.round(bestCompatibilityScore)}% compatible
                  </span>
                </p>
              )}
              <div className="songs-grid">
                {songs.map(song => {
                  const imgSrc = resolveImagePath(song);
                  return (
                    <div key={song.id} className="song-card">
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
                        <p className="artist">{song.artist}</p>
                        {song.albumName && <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '8px' }}>💿 {song.albumName}</p>}
                        {song.previewUrl && (
                          <audio controls style={{ width: '100%', height: '28px', marginTop: '8px' }}>
                            <source src={song.previewUrl} />
                          </audio>
                        )}
                        {/* Audio features */}
                        {(song.danceability != null || song.energy != null || song.valence != null) && (
                          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {song.danceability != null && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>
                                  <span>Danceability</span><span>{Math.round(song.danceability * 100)}%</span>
                                </div>
                                <div className="progress-bar" style={{ height: '4px' }}>
                                  <div className="progress-fill" style={{ width: `${song.danceability * 100}%` }} />
                                </div>
                              </div>
                            )}
                            {song.energy != null && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '2px' }}>
                                  <span>Energy</span><span>{Math.round(song.energy * 100)}%</span>
                                </div>
                                <div className="progress-bar" style={{ height: '4px' }}>
                                  <div className="progress-fill" style={{ width: `${song.energy * 100}%`, background: 'linear-gradient(90deg, var(--secondary) 0%, var(--accent) 100%)' }} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sidebar: compatible user */}
            <div>
              {(bestMatch || latentProfile) && (
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(8,145,178,0.1) 100%)', border: '1px solid rgba(124,58,237,0.3)' }}>
                  <h3 style={{ marginBottom: '20px' }}>🧬 Your Music Twin</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
                    <div className="avatar avatar-lg">
                      {(closestUserName || 'U')[0].toUpperCase()}
                    </div>
                    <p style={{ fontWeight: '700', fontSize: '18px' }}>{closestUserName || 'No match yet'}</p>
                    <p className="gradient-text" style={{ fontSize: '40px', fontWeight: '800' }}>
                      {Math.round(bestCompatibilityScore)}%
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>compatibility score</p>
                    {bestMatch && (
                      <div style={{ width: '100%', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '12px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Latent Coordinates</p>
                        <code style={{ fontSize: '12px', color: 'var(--accent)' }}>
                          [{bestMatch.x.toFixed(3)}, {bestMatch.y.toFixed(3)}]
                        </code>
                      </div>
                    )}
                    {bestMatch && (
                      <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => navigate(`/chat`)}>
                        💬 Start Chat
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Other close users */}
              {latentUsers.length > 1 && latentProfile && (
                <div style={{ marginTop: '20px' }}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Other close users</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {latentUsers
                      .filter(u => u.userId !== latentProfile.userId)
                      .sort((a, b) => {
                        const scoreA = compatibilityMap.get(a.userId) || 0;
                        const scoreB = compatibilityMap.get(b.userId) || 0;
                        return scoreB - scoreA;
                      })
                      .slice(0, 5)
                      .map(u => {
                        const score = compatibilityMap.get(u.userId) || 0;
                        return (
                          <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                            <div className="avatar avatar-sm">{u.userName[0].toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: '600', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.userName}</p>
                              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                                [{u.x.toFixed(2)}, {u.y.toFixed(2)}]
                              </p>
                            </div>
                            <span className="badge badge-primary">{Math.round(score)}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}