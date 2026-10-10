import { FunctionsHttpError } from '@supabase/supabase-js';

const DEFAULT_PAYMENT_ERROR = 'Impossible de contacter le service de paiement. Réessayez plus tard.';

export async function getPaymentFunctionErrorMessage(error: Error): Promise<string> {
  if (!(error instanceof FunctionsHttpError) || !(error.context instanceof Response)) {
    return error.message || DEFAULT_PAYMENT_ERROR;
  }

  const response = error.context as Response;
  try {
    const body: unknown = await response.clone().json();
    if (typeof body === 'object' && body !== null) {
      const message = (body as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim().slice(0, 300);
      }
    }
  } catch {
    // Non-JSON gateway responses are reported using their HTTP status below.
  }

  return `Le service de paiement a répondu avec l’erreur HTTP ${response.status}. Vérifiez la configuration de la fonction Edge et ses journaux.`;
}
