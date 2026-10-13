import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

export function getSupabaseFunctionErrorMessage(error: Error, functionName: string): string {
  if (error instanceof FunctionsFetchError) {
    return `Impossible de joindre la fonction « ${functionName} » : échec réseau ou CORS. Vérifiez la connexion et que la fonction est déployée sur le projet Supabase configuré.`;
  }

  if (
    (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError)
    && error.context instanceof Response
  ) {
    const status = error.context.status;
    if (status === 404) {
      return `La fonction Edge « ${functionName} » est introuvable sur le projet Supabase configuré (HTTP 404). Vérifiez son déploiement et son nom.`;
    }
    if (status === 401) {
      return `La fonction « ${functionName} » a refusé la requête (HTTP 401). Vérifiez la session utilisateur et l’authentification JWT.`;
    }
    if (status === 403) {
      return `La fonction « ${functionName} » a refusé l’accès (HTTP 403). Vérifiez les autorisations du compte.`;
    }
    if (status >= 500) {
      return `La fonction « ${functionName} » a rencontré une erreur serveur (HTTP ${status}). Consultez ses journaux Supabase.`;
    }
    return `La fonction « ${functionName} » a refusé la requête (HTTP ${status}).`;
  }

  return `Erreur inattendue lors de l’appel à la fonction « ${functionName} ». Réessayez plus tard.`;
}
