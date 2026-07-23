 import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, Profile, UserRole } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
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
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
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
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          fetchProfile(session.user.id).finally(() => setLoading(false));
        } else {
          setProfile(null);
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
    // Création du compte utilisateur Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          nom: profileData.nom,
          prenom: profileData.prenom,
          role: profileData.role,
          telephone: profileData.telephone,
          region: profileData.region,
        },
      },
    });

    if (error) {
      return { error: error.message };
    }

    const authUser = data.user;

    if (!authUser) {
      return {
        error: 'Impossible de créer votre compte pour le moment.',
      };
    }

    // Création du profil dans la table profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: authUser.id,
        email: email,
        nom: profileData.nom,
        prenom: profileData.prenom,
        role: profileData.role,
        telephone: profileData.telephone,
        region: profileData.region,
      });

    if (profileError) {
      return {
        error: profileError.message,
      };
    }

    // Cas où la confirmation email est activée
    if (!data.session) {
      return {
        error:
          'Inscription créée. Vérifiez votre e-mail pour confirmer votre compte, puis connectez-vous.',
      };
    }

    return {
      error: null,
    };
  };

  const signOut = async () => {
    await supabase.auth.signOut();

    setProfile(null);
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
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
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}