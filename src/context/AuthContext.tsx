import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, Profile, UserRole } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    profileData: {
      nom: string;
      prenom: string;
      role: UserRole;
      telephone: string;
      region: string;
    }
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    setProfile(null);
    setProfileError(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        setProfileError(error.message);
      } else if (data) {
        setProfile(data as Profile);
      } else {
        setProfileError('Aucun profil n\'est associé à ce compte.');
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Erreur réseau lors du chargement du profil.');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          fetchProfile(session.user.id).finally(() => setLoading(false));
        } else {
          setProfile(null);
          setProfileError(null);
          setLoading(false);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return {
      error: error?.message ?? null,
    };
  };

  const signUp = async (
    email: string,
    password: string,
    profileData: {
      nom: string;
      prenom: string;
      role: UserRole;
      telephone: string;
      region: string;
    }
  ) => {
    const safeRole: Exclude<UserRole, 'admin'> = profileData.role === 'admin'
      ? 'acheteur'
      : profileData.role;

    const configuredUrl = import.meta.env.VITE_APP_URL?.replace(/\/$/, '');
    const isLocalUrl = configuredUrl?.includes('localhost') || configuredUrl?.includes('127.0.0.1');
    const appUrl = configuredUrl && (isLocalUrl === false || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? configuredUrl
      : window.location.origin;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/login`,
        data: {
          nom: profileData.nom,
          prenom: profileData.prenom,
          role: safeRole,
          telephone: profileData.telephone,
          region: profileData.region,
        },
      },
    });

    if (error) {
      return { error: error.message };
    }

    if (!data.user) {
      return { error: 'Impossible de créer votre compte pour le moment.' };
    }

    if (!data.session) {
      return {
        error: 'Inscription créée. Vérifiez votre e-mail pour confirmer votre compte, puis connectez-vous.',
      };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();

    setProfile(null);
    setProfileError(null);
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (user) {
      setLoading(true);
      try {
        await fetchProfile(user.id);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        profileError,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}