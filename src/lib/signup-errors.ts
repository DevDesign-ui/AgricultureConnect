const duplicateEmailMessage = 'Cette adresse e-mail est déjà inscrite. Veuillez vous connecter ou utiliser une autre adresse.';
const hiddenDuplicateMessage = 'Si cette adresse e-mail est nouvelle, un e-mail de confirmation vous sera envoyé. Si vous avez déjà un compte, connectez-vous.';

type SignupAuthError = {
  code?: string;
  message?: string;
} | null;

type SignupAuthUser = {
  identities?: unknown[];
} | null;

export function getSignUpErrorMessage(error: SignupAuthError, user: SignupAuthUser): string | null {
  if (error) {
    if (error.code === 'email_exists' || error.code === 'user_already_exists') {
      return duplicateEmailMessage;
    }

    return error.message ?? 'Impossible de créer votre compte pour le moment.';
  }

  if (!user) return 'Impossible de créer votre compte pour le moment.';
  if (user.identities?.length === 0) return hiddenDuplicateMessage;

  return null;
}