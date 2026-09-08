import { useEffect, useState } from 'react';
import { User, Mail, Phone, MapPin, Save, Sprout, Store, ShoppingBag, Shield } from 'lucide-react';
import { supabase, Region } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getRoleLabel } from '../lib/utils';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [regions, setRegions] = useState<Region[]>([]);
  const [form, setForm] = useState({
    nom: '',
    prenom: '',
    telephone: '',
    region: '',
    adresse: '',
    bio: '',
    latitude: '',
    longitude: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from('regions').select('*').order('name').then(({ data }) => {
      if (data) setRegions(data as Region[]);
    });
  }, []);

  useEffect(() => {
    if (profile) {
      setForm({
        nom: profile.nom,
        prenom: profile.prenom,
        telephone: profile.telephone,
        region: profile.region,
        adresse: profile.adresse,
        bio: profile.bio,
        latitude: profile.latitude?.toString() ?? '',
        longitude: profile.longitude?.toString() ?? '',
      });
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({
      nom: form.nom,
      prenom: form.prenom,
      telephone: form.telephone,
      region: form.region,
      adresse: form.adresse,
      bio: form.bio,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm({
        ...form,
        latitude: pos.coords.latitude.toString(),
        longitude: pos.coords.longitude.toString(),
      });
    });
  };

  if (!profile) {
    return (
      <div className="card max-w-2xl">
        <h1 className="text-xl font-bold text-slate-900">Profil indisponible</h1>
        <p className="text-slate-500 mt-2">
          Votre session est active, mais vos informations de profil ne sont pas encore disponibles.
          Actualisez la page ou reconnectez-vous.
        </p>
        <p className="text-sm text-slate-500 mt-4">Compte : {user?.email ?? 'inconnu'}</p>
      </div>
    );
  }

  const roleIcon = profile.role === 'agriculteur' ? Sprout :
                   profile.role === 'fournisseur' ? Store :
                   profile.role === 'acheteur' ? ShoppingBag : Shield;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mon profil</h1>
        <p className="text-slate-500 mt-1">Gérez vos informations personnelles</p>
      </div>

      {/* Profile header */}
      <div className="card flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.nom} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-primary-600" />
          )}
        </div>
        <div>
          <p className="text-xl font-bold text-slate-900">{profile.prenom} {profile.nom}</p>
          <p className="text-sm text-slate-500">{profile.email}</p>
          <div className="flex items-center gap-2 mt-1">
            {(() => {
              const Icon = roleIcon;
              return <Icon className="w-4 h-4 text-primary-600" />;
            })()}
            <span className="text-sm font-semibold text-primary-600">{getRoleLabel(profile.role)}</span>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Prénom</label>
            <input required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Nom</label>
            <input required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Téléphone</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="input pl-10" placeholder="+221 ..." />
          </div>
        </div>

        <div>
          <label className="label">Région</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input pl-10">
              <option value="" disabled>
                Sélectionnez votre région
              </option>
              {regions
                .filter((r) => r.name?.trim() !== '')
                .map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Adresse</label>
          <input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="input" placeholder="Votre adresse" />
        </div>

        <div>
          <label className="label">Bio</label>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="input" rows={3} placeholder="Parlez de votre activité..." />
        </div>

        {/* Geolocation */}
        <div className="p-4 rounded-lg bg-accent-50 border border-accent-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-slate-900">Localisation GPS</p>
              <p className="text-xs text-slate-500">Pour apparaître sur la carte des producteurs</p>
            </div>
            <button type="button" onClick={detectLocation} className="btn-secondary text-sm">
              <MapPin className="w-4 h-4" /> Détecter
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Latitude</label>
              <input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} className="input" placeholder="Ex: 14.4974" />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} className="input" placeholder="Ex: -14.4524" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {saved && <span className="text-sm text-primary-600 font-medium">Profil mis à jour !</span>}
        </div>
      </form>
    </div>
  );
}
