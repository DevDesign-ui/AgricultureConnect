import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sprout, Mail, Lock, User, Phone, MapPin, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, Region } from '../lib/supabase';

const defaultRegions: Region[] = [
  { id: 'region-dakar', name: 'Dakar', code: 'DK', created_at: '' },
  { id: 'region-thies', name: 'Thiès', code: 'TH', created_at: '' },
  { id: 'region-diourbel', name: 'Diourbel', code: 'DB', created_at: '' },
  { id: 'region-kaolack', name: 'Kaolack', code: 'KL', created_at: '' },
  { id: 'region-fatick', name: 'Fatick', code: 'FK', created_at: '' },
  { id: 'region-kolda', name: 'Kolda', code: 'KD', created_at: '' },
  { id: 'region-ziguinchor', name: 'Ziguinchor', code: 'ZG', created_at: '' },
  { id: 'region-sedhiou', name: 'Sédhiou', code: 'SD', created_at: '' },
  { id: 'region-stlouis', name: 'Saint-Louis', code: 'SL', created_at: '' },
  { id: 'region-matam', name: 'Matam', code: 'MT', created_at: '' },
  { id: 'region-kedougou', name: 'Kédougou', code: 'KD', created_at: '' },
  { id: 'region-tambacounda', name: 'Tambacounda', code: 'TC', created_at: '' },
  { id: 'region-kaffrine', name: 'Kaffrine', code: 'KF', created_at: '' },
  { id: 'region-koungheul', name: 'Koungheul', code: 'KG', created_at: '' },
];

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: '',
    password: '',
    telephone: '',
    role: 'acheteur' as const,
    region: '',
  });
  const [regions, setRegions] = useState<Region[]>(defaultRegions);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('regions').select('*').order('name').then(({ data }) => {
      if (data && data.length > 0) {
        setRegions(data as Region[]);
      } else {
        setRegions(defaultRegions);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const normalizedEmail = form.email.trim().toLowerCase();
    const { error } = await signUp(normalizedEmail, form.password, {
      nom: form.nom,
      prenom: form.prenom,
      role: form.role,
      telephone: form.telephone,
      region: form.region,
    });
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
            <Sprout className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">AgricultureConnect</h1>
          <p className="text-slate-500 mt-2">Créez votre compte pour rejoindre la plateforme</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Inscription</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-error-50 border border-error-200 text-error-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Prénom</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    required
                    value={form.prenom}
                    onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                    className="input pl-10"
                    placeholder="Prénom"
                  />
                </div>
              </div>
              <div>
                <label className="label">Nom</label>
                <input
                  required
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  className="input"
                  placeholder="Nom"
                />
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input pl-10"
                  placeholder="vous@exemple.com"
                />
              </div>
            </div>

            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Téléphone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    required
                    value={form.telephone}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                    className="input pl-10"
                    placeholder="+221 ..."
                  />
                </div>
              </div>
              <div>
                <label className="label">Région</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <select
                    required
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    className="input pl-10"
                  >
                    <option value="" disabled>
                      Sélectionnez votre région
                    </option>
                    {regions
                      .filter((r) => r.name?.trim() !== '')
                      .map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="label">Je suis un(e)</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'acheteur', label: 'Acheteur' },
                  { value: 'agriculteur', label: 'Agriculteur' },
                  { value: 'fournisseur', label: 'Fournisseur' },
                  { value: 'admin', label: 'Administrateur' },
                ].map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-center justify-center px-4 py-3 rounded-lg border-2 cursor-pointer transition-all ${
                      form.role === r.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={form.role === r.value}
                      onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
                      className="sr-only"
                    />
                    <span className="font-semibold text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Création...' : 'Créer mon compte'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-primary-600 font-semibold hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
