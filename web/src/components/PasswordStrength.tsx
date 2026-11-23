/**
 * Indicador de força da senha, mostrado enquanto o usuário digita.
 * Os requisitos são os de RN-07; a força é só uma orientação e não bloqueia o cadastro.
 */

const REQUIREMENTS = [
  { label: '8 caracteres ou mais', test: (p: string) => p.length >= 8 },
  { label: 'Uma letra', test: (p: string) => /\p{L}/u.test(p) },
  { label: 'Um número', test: (p: string) => /\d/.test(p) },
];

const LEVELS = [
  { label: 'Fraca', className: 'weak' },
  { label: 'Média', className: 'fair' },
  { label: 'Boa', className: 'good' },
  { label: 'Forte', className: 'strong' },
] as const;

/** Sequências fáceis de adivinhar que deixam a senha "Fraca" mesmo cumprindo RN-07. */
const COMMON = /^(?:senha|password|qwerty|123456|abc123|pocket)/i;

export function passwordLevel(password: string): number {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/\p{Lu}/u.test(password) && /\p{Ll}/u.test(password)) score++;
  if (/[^\p{L}\d]/u.test(password)) score++;
  if (COMMON.test(password) || /^(.)\1+$/.test(password)) score = 0;
  return Math.min(score, LEVELS.length - 1);
}

export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const results = REQUIREMENTS.map((requirement) => ({ ...requirement, ok: requirement.test(password) }));
  const meetsRules = results.every((result) => result.ok);
  const level = LEVELS[passwordLevel(password)]!;
  const filled = password === '' ? 0 : meetsRules ? passwordLevel(password) + 1 : 1;

  return (
    <div className="strength" id={id}>
      <div className="strength__bar" aria-hidden="true">
        {LEVELS.map((step, index) => (
          <span
            key={step.label}
            className={`strength__step ${index < filled ? `strength__step--${meetsRules ? level.className : 'invalid'}` : ''}`}
          />
        ))}
      </div>
      {password !== '' && (
        <span className={`strength__label strength__label--${meetsRules ? level.className : 'invalid'}`} aria-live="polite">
          {meetsRules ? `Senha ${level.label.toLowerCase()}` : 'Ainda não atende aos requisitos'}
        </span>
      )}
      <ul className="strength__rules">
        {results.map((result) => (
          <li key={result.label} className={result.ok ? 'ok' : undefined}>
            <span aria-hidden="true">{result.ok ? '✓' : '•'}</span> {result.label}
            <span className="visually-hidden">{result.ok ? ' (atendido)' : ' (pendente)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
