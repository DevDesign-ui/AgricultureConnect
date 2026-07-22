import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapPin, Search, Sprout, Store, User } from 'lucide-react';
import { supabase, Profile, Region } from '../lib/supabase';
import { getRoleLabel } from '../lib/utils';
import L from 'leaflet';

// Fix default icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

export default function MapView() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [filterRegion, setFilterRegion] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [{ data: profs }, { data: regs }] = await Promise.all([
        supabase.from('profiles').select('*').not('latitude', 'is', null),
        supabase.from('regions').select('*').order('name'),
      ]);
      setProfiles((profs ?? []) as Profile[]);
      setRegions((regs ?? []) as Region[]);
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredProfiles = profiles.filter((p) => {
    if (filterRegion && p.region !== filterRegion) return false;
    if (filterRole && p.role !== filterRole) return false;
    return true;
  });

  // Default center: Senegal
  const center: [number, number] = [14.4974, -14.4524];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Géolocalisation des producteurs</h1>
        <p className="text-slate-500 mt-1">Localisez les agriculteurs et fournisseurs sur la carte</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Région</label>
          <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} className="input">
            <option value="">Toutes les régions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type d'acteur</label>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="input">
            <option value="">Tous</option>
            <option value="agriculteur">Agriculteurs</option>
            <option value="fournisseur">Fournisseurs</option>
          </select>
        </div>
      </div>

      <p className="text-sm text-slate-500">{filteredProfiles.length} producteur(s) trouvé(s)</p>

      {/* Map */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="h-[500px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <MapContainer center={center} zoom={7} style={{ height: '500px', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            {filteredProfiles.map((p) => (
              p.latitude && p.longitude ? (
                <Marker key={p.id} position={[p.latitude, p.longitude]}>
                  <Popup>
                    <div className="p-2">
                      <p className="font-bold">{p.prenom} {p.nom}</p>
                      <p className="text-sm">{getRoleLabel(p.role)}</p>
                      {p.region && <p className="text-xs text-slate-500">{p.region}</p>}
                      {p.telephone && <p className="text-xs">{p.telephone}</p>}
                      {p.bio && <p className="text-xs mt-1">{p.bio}</p>}
                    </div>
                  </Popup>
                </Marker>
              ) : null
            ))}
          </MapContainer>
        )}
      </div>

      {/* List of producers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProfiles.map((p) => (
          <div key={p.id} className="card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                {p.role === 'agriculteur' ? <Sprout className="w-5 h-5 text-primary-600" /> :
                 p.role === 'fournisseur' ? <Store className="w-5 h-5 text-primary-600" /> :
                 <User className="w-5 h-5 text-primary-600" />}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{p.prenom} {p.nom}</p>
                <p className="text-xs text-primary-600">{getRoleLabel(p.role)}</p>
              </div>
            </div>
            {p.region && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-2">
                <MapPin className="w-3 h-3" /> {p.region}
              </p>
            )}
            {p.telephone && <p className="text-xs text-slate-500 mt-1">{p.telephone}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
