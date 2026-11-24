import { useState, type ReactNode } from 'react';
import { formatDate, periodContaining, today, type PeriodNaming } from '../../../shared/period';
import { useAuth, type User } from '../auth/AuthContext';
import { Alert, Field } from '../components/Form';
import { MoneyInput } from '../components/MoneyInput';
import { PasswordStrength } from '../components/PasswordStrength';
import { Sheet } from '../components/Sheet';
import { api } from '../lib/api';
import { CATEGORIES_PATH, PAYMENTS_PATH } from '../components/ManageCategoriesLink';
import { Link, navigate } from '../lib/router';
import { applyTheme, type Theme } from '../lib/theme';
import { useSubmit } from '../lib/useSubmit';

export function SettingsPage({ user }: { user: User }) {
  return (
    <>
      <h1>Configurações</h1>
      <div className="settings">
        <ProfileSection user={user} />
        <CategoriesSection />
        <PaymentsSection />
        <WarningSection user={user} />
        <PeriodSection user={user} />
        <InitialBalanceSection user={user} />
        <ThemeSection user={user} />
        <PasswordSection />
        <AccountSection />
      </div>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card settings__section">
      <h2>{title}</h2>
      {description && <p className="muted small">{description}</p>}
      {children}
    </section>
  );
}

/** RN-47a: as categorias ficam dentro dos ajustes. */
function CategoriesSection() {
  return (
    <Section title="Categorias" description="Crie, renomeie e organize as categorias de receitas e despesas, com a classe de cada despesa.">
      <Link href={CATEGORIES_PATH} className="button button--ghost settings__link">
        Gerenciar categorias
      </Link>
    </Section>
  );
}

/** RN-32a: nível de atenção do orçamento. O estouro é sempre ao passar de 100%. */
function WarningSection({ user }: { user: User }) {
  const saveUser = useSaveUser();
  const [percent, setPercent] = useState(String(user.warningPercent));
  const [saved, setSaved] = useState(false);
  const value = Number(percent);
  const valid = percent.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 100;
  const save = useSubmit(async () => {
    setSaved(false);
    await saveUser('/settings/preferences', { warningPercent: value });
    setSaved(true);
  });

  return (
    <Section
      title="Alertas do orçamento"
      description="Quando uma categoria ou classe com limite chegar a esta porcentagem do limite, o painel mostra o aviso de atenção. Passar de 100% é sempre estouro."
    >
      {saved && <Alert kind="success">Nível de atenção atualizado.</Alert>}
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <Field
          label="Avisar ao atingir (%)"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(e) => {
            setPercent(e.target.value);
            setSaved(false);
          }}
          error={save.fieldErrors.warningPercent ?? (valid ? undefined : 'Escolha um número inteiro de 0 a 100.')}
          hint={valid ? `Com limite de R$ 1.000,00, o aviso aparece a partir de R$ ${(value * 10).toLocaleString('pt-BR')},00.` : undefined}
        />
        <button className="button" type="submit" disabled={save.submitting || !valid || value === user.warningPercent}>
          {save.submitting ? 'Salvando…' : 'Salvar nível de atenção'}
        </button>
      </form>
    </Section>
  );
}

/** RN-47a, RN-51, RN-69: formas de pagamento e cartões ficam dentro dos ajustes. */
function PaymentsSection() {
  return (
    <Section title="Formas de pagamento e cartões" description="Crie formas de pagamento próprias e cadastre os cartões de crédito.">
      <Link href={PAYMENTS_PATH} className="button button--ghost settings__link">
        Gerenciar formas de pagamento e cartões
      </Link>
    </Section>
  );
}

/** Salva parte do usuário e atualiza o app inteiro com a resposta. */
function useSaveUser() {
  const { setUser } = useAuth();
  return async (path: string, body: object) => {
    const result = await api<{ user: User }>(path, { method: 'PATCH', body: JSON.stringify(body) });
    setUser(result.user);
  };
}

/** RN-42 */
function ProfileSection({ user }: { user: User }) {
  const saveUser = useSaveUser();
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);
  const save = useSubmit(async () => {
    setSaved(false);
    await saveUser('/settings/profile', { name });
    setSaved(true);
  });

  return (
    <Section title="Perfil">
      {saved && <Alert kind="success">Nome atualizado.</Alert>}
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <Field label="Nome" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} error={save.fieldErrors.name} />
        <div className="field">
          <span className="field__static-label">E-mail</span>
          <span className="field__static">{user.email}</span>
          <span className="field__hint">O e-mail não pode ser alterado.</span>
        </div>
        <button className="button" type="submit" disabled={save.submitting || name.trim() === user.name}>
          {save.submitting ? 'Salvando…' : 'Salvar nome'}
        </button>
      </form>
    </Section>
  );
}

const NAMING_OPTIONS: { value: PeriodNaming; label: string; description: string }[] = [
  { value: 'AUTO', label: 'Automático', description: 'Pelo mês com mais dias dentro do período.' },
  { value: 'START_MONTH', label: 'Mês de início', description: 'Sempre o mês em que o período começa.' },
  { value: 'END_MONTH', label: 'Mês de término', description: 'Sempre o mês em que o período termina.' },
];

/** RN-10, RN-12, RN-44 */
function PeriodSection({ user }: { user: User }) {
  const saveUser = useSaveUser();
  const [startDay, setStartDay] = useState(user.monthStartDay);
  const [naming, setNaming] = useState<PeriodNaming>(user.periodNaming);
  const [saved, setSaved] = useState(false);
  const save = useSubmit(async () => {
    setSaved(false);
    await saveUser('/settings/preferences', { monthStartDay: startDay, periodNaming: naming });
    setSaved(true);
  });

  const preview = periodContaining(today(), startDay, naming);
  const unchanged = startDay === user.monthStartDay && naming === user.periodNaming;

  return (
    <Section title="Mês financeiro" description="Defina quando o seu mês começa, por exemplo, no dia em que o salário cai.">
      {saved && <Alert kind="success">Mês financeiro atualizado.</Alert>}
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit}>
        <div className="field">
          <label htmlFor="start-day">Dia de início</label>
          <select id="start-day" value={startDay} onChange={(e) => setStartDay(Number(e.target.value))}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                Dia {day}
              </option>
            ))}
          </select>
          <span className="field__hint">De 1 a 28, porque os dias 29 a 31 não existem em todos os meses.</span>
        </div>

        <fieldset className="choices">
          <legend>Nome do período</legend>
          {NAMING_OPTIONS.map((option) => (
            <label key={option.value} className="choice">
              <input type="radio" name="naming" value={option.value} checked={naming === option.value} onChange={() => setNaming(option.value)} />
              <span>
                <strong>{option.label}</strong>
                <span className="muted small">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="preview" aria-live="polite">
          Período atual: <strong>{preview.label}</strong>
          <span className="muted small">
            {' '}
            ({formatDate(preview.start)} a {formatDate(preview.end)})
          </span>
        </p>

        <button className="button" type="submit" disabled={save.submitting || unchanged}>
          {save.submitting ? 'Salvando…' : 'Salvar mês financeiro'}
        </button>
      </form>
    </Section>
  );
}

/** RN-44a: ponto de partida do saldo acumulado (RN-28a). */
function InitialBalanceSection({ user }: { user: User }) {
  const saveUser = useSaveUser();
  const [cents, setCents] = useState(Math.abs(user.initialBalanceCents));
  const [negative, setNegative] = useState(user.initialBalanceCents < 0);
  const [saved, setSaved] = useState(false);
  const value = negative ? -cents : cents;
  const save = useSubmit(async () => {
    setSaved(false);
    await saveUser('/settings/preferences', { initialBalanceCents: value });
    setSaved(true);
  });

  return (
    <Section
      title="Saldo inicial"
      description="Quanto você tinha na conta quando começou a usar o pocket-plan. O saldo acumulado do painel parte desse valor."
    >
      {saved && <Alert kind="success">Saldo inicial atualizado.</Alert>}
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <MoneyInput label="Saldo inicial" cents={cents} onChange={setCents} error={save.fieldErrors.initialBalanceCents} />
        <label className="choice">
          <input type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} />
          <span>
            <strong>Saldo negativo</strong>
            <span className="muted small">Marque se a conta estava no vermelho (cheque especial).</span>
          </span>
        </label>
        <button className="button" type="submit" disabled={save.submitting || value === user.initialBalanceCents}>
          {save.submitting ? 'Salvando…' : 'Salvar saldo inicial'}
        </button>
      </form>
    </Section>
  );
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'LIGHT', label: 'Claro' },
  { value: 'DARK', label: 'Escuro' },
  { value: 'SYSTEM', label: 'Automático' },
];

/** RN-45: aplica na hora e salva na conta. */
function ThemeSection({ user }: { user: User }) {
  const saveUser = useSaveUser();
  const [error, setError] = useState<string | null>(null);
  // Marca a opção na hora do clique, junto com o tema aplicado, sem esperar a API.
  const [selected, setSelected] = useState<Theme>(user.theme);

  async function choose(theme: Theme) {
    if (theme === selected) return;
    const previous = selected;
    setError(null);
    setSelected(theme);
    applyTheme(theme);
    try {
      await saveUser('/settings/preferences', { theme });
    } catch (err) {
      setSelected(previous);
      applyTheme(previous);
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o tema.');
    }
  }

  return (
    <Section title="Aparência" description="No automático, o app acompanha o tema claro ou escuro do seu aparelho.">
      {error && <Alert kind="error">{error}</Alert>}
      <div className="segmented segmented--three" role="radiogroup" aria-label="Tema">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected === option.value}
            className="segmented__option"
            onClick={() => void choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

/** RN-43 */
function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useSubmit(async () => {
    setSaved(false);
    setMismatch(newPassword !== confirmation);
    if (newPassword !== confirmation) return;
    await api('/settings/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setSaved(true);
  });

  return (
    <Section title="Senha" description="Ao trocar a senha, os outros aparelhos conectados à sua conta são desconectados.">
      {saved && <Alert kind="success">Senha alterada.</Alert>}
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <Field label="Senha atual" type="password" autoComplete="current-password" value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)} error={save.fieldErrors.currentPassword} />
        <Field label="Nova senha" type="password" autoComplete="new-password" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} error={save.fieldErrors.newPassword}>
          <PasswordStrength password={newPassword} />
        </Field>
        <Field label="Confirme a nova senha" type="password" autoComplete="new-password" value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)} error={mismatch ? 'As senhas não conferem.' : undefined} />
        <button className="button" type="submit" disabled={save.submitting || !currentPassword || !newPassword}>
          {save.submitting ? 'Salvando…' : 'Alterar senha'}
        </button>
      </form>
    </Section>
  );
}

/** RN-46, RN-47 */
function AccountSection() {
  const { setUser } = useAuth();
  const [dialog, setDialog] = useState<'logout-all' | 'delete' | null>(null);
  const [password, setPassword] = useState('');

  const logoutAll = useSubmit(async () => {
    await api('/settings/logout-all', { method: 'POST' });
    setUser(null);
  });

  const remove = useSubmit(async () => {
    await api('/settings/delete-account', { method: 'POST', body: JSON.stringify({ password }) });
    navigate('/login?conta-excluida=1', { replace: true });
    setUser(null);
  });

  return (
    <Section title="Segurança e conta">
      <div className="form">
        <button className="button button--ghost" type="button" onClick={() => setDialog('logout-all')}>
          Sair de todos os aparelhos
        </button>
        <button className="button button--danger-ghost" type="button" onClick={() => setDialog('delete')}>
          Excluir minha conta
        </button>
      </div>

      {dialog === 'logout-all' && (
        <Sheet title="Sair de todos os aparelhos" onClose={() => setDialog(null)}>
          {logoutAll.error && <Alert kind="error">{logoutAll.error}</Alert>}
          <form className="form" onSubmit={logoutAll.onSubmit}>
            <p>Sua conta será desconectada em todos os aparelhos, inclusive neste. Para voltar, é só entrar de novo.</p>
            <button className="button" type="submit" disabled={logoutAll.submitting}>
              {logoutAll.submitting ? 'Saindo…' : 'Sair de todos'}
            </button>
            <button className="button button--ghost" type="button" onClick={() => setDialog(null)}>
              Cancelar
            </button>
          </form>
        </Sheet>
      )}

      {dialog === 'delete' && (
        <Sheet title="Excluir minha conta" onClose={() => setDialog(null)}>
          {remove.error && <Alert kind="error">{remove.error}</Alert>}
          <form className="form" onSubmit={remove.onSubmit} noValidate>
            <Alert kind="error">
              Esta ação é <strong>definitiva</strong>. Sua conta e todos os seus dados (categorias, lançamentos, orçamentos e
              investimentos) serão apagados e não poderão ser recuperados.
            </Alert>
            <Field label="Digite sua senha para confirmar" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} error={remove.fieldErrors.password} />
            <button className="button button--danger" type="submit" disabled={remove.submitting || !password}>
              {remove.submitting ? 'Excluindo…' : 'Excluir definitivamente'}
            </button>
            <button className="button button--ghost" type="button" onClick={() => setDialog(null)}>
              Cancelar
            </button>
          </form>
        </Sheet>
      )}
    </Section>
  );
}
