import { t } from './i18n'
import { appLanguages, languageName } from './i18n'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowLeft, ArrowRight, Check, Play, Puzzle, UserRound } from 'lucide-react'
import { Choice, Toggle, AvatarPicker } from './components'
import { languages, avatarUrl } from './preferences'
import { ImportPanel } from './import-panel'
import type { UserState } from './types'
export function Onboarding({
  state,
  setState,
  connected,
  onAccount,
  onAddon,
  onFinish,
}: {
  state: UserState
  setState: Dispatch<SetStateAction<UserState>>
  connected: boolean
  onAccount: () => void
  onAddon: () => void
  onFinish: () => Promise<void>
}) {
  const steps = [
    t('Compte'),
    t('Bienvenue'),
    t('Profil'),
    t('Lecture'),
    t('Importer'),
    t('Addons'),
    t('Prêt'),
  ]
  const [step, setStep] = useState(0)
  const [imported, setImported] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const profile = state.profiles.find((p) => p.id === state.activeProfileId)!
  const updateProfile = (data: { name?: string; color?: string; avatar?: string }) =>
    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) => (p.id === s.activeProfileId ? { ...p, ...data } : p)),
    }))
  const updateSettings = (data: Partial<UserState['settings']>) =>
    setState((s) => ({ ...s, settings: { ...s.settings, ...data } }))
  return (
    <main className="onboarding">
      <header className="onboarding-top">
        {step > 0 ? (
          <button
            className="icon"
            aria-label={t('Étape précédente')}
            disabled={importBusy}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft />
          </button>
        ) : (
          <span className="wordmark">PRIMIO</span>
        )}
        <span>
          {step + 1} / {steps.length}
        </span>
      </header>
      <div className="onboarding-body" key={step}>
        {step === 1 && (
          <>
            <img className="welcome-logo" src="/brand/primio.png" alt="Primio" />
            <Choice
              label={t('Langue de l’application')}
              value={state.settings.uiLanguage}
              options={appLanguages}
              flags
              onChange={(v) => updateSettings({ uiLanguage: v })}
            />
            <span className="eyebrow">{t('VOTRE CINÉMA, À VOTRE RYTHME')}</span>
            <h1 className="serif">{t('Bienvenue chez vous.')}</h1>
            <p>{t('Films, séries et animes, réunis dans un espace qui vous ressemble.')}</p>
            <div className="welcome-features">
              <span>
                <Play />
                {t('Une lecture fluide')}
              </span>
              <span>
                <Puzzle />
                {t('Vos addons favoris')}
              </span>
              <span>
                <UserRound />
                {t('Un espace par profil')}
              </span>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <span className="onboarding-symbol avatar" style={{ background: profile.color }}>
              <img src={avatarUrl(profile.avatar)} alt="" />
            </span>
            <span className="eyebrow">{t('VOTRE ESPACE')}</span>
            <h1>{t('Comment vous appeler ?')}</h1>
            <p>{t('Votre profil garde votre liste, vos préférences et votre progression.')}</p>
            <label className="field">
              {t('Nom du profil')}
              <input
                autoComplete="nickname"
                value={profile.name}
                maxLength={32}
                onChange={(e) => updateProfile({ name: e.target.value })}
              />
            </label>
            <AvatarPicker
              value={profile.avatar ?? '01'}
              profiles={state.profiles}
              editing={profile.id}
              onChange={(avatar) => updateProfile({ avatar })}
            />
          </>
        )}
        {step === 0 && (
          <>
            <Choice
              label={t('Langue de l’application')}
              value={state.settings.uiLanguage}
              options={appLanguages}
              flags
              onChange={(v) => updateSettings({ uiLanguage: v })}
            />
            <span className="onboarding-symbol">
              <UserRound />
            </span>
            <span className="eyebrow">{t('PARTOUT AVEC VOUS')}</span>
            <h1>{t('Retrouvez votre cinéma.')}</h1>
            <p>
              {t(
                'Un compte synchronise vos profils, votre liste et votre progression entre vos appareils.',
              )}
            </p>
            <div className="onboarding-card glass">
              <h2>{connected ? t('Vous êtes connecté') : t('Votre compte Primio')}</h2>
              <p>
                {connected
                  ? t('Votre bibliothèque est prête à vous suivre.')
                  : t('Vous pouvez aussi utiliser Primio sans compte.')}
              </p>
              {!connected && (
                <button className="primary" onClick={onAccount}>
                  {t('Créer un compte ou se connecter')}
                  <ArrowRight />
                </button>
              )}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <span className="onboarding-symbol">
              <Play />
            </span>
            <span className="eyebrow">{t('LE PLAISIR DE REGARDER')}</span>
            <h1>{t('À votre écoute.')}</h1>
            <p>{t('Choisissez vos langues. Vous pourrez ajuster le lecteur dans Paramètres.')}</p>
            <Choice
              label={t('Audio')}
              value={state.settings.audioLanguage}
              options={[['original', t('Langue d’origine')], ...languages]}
              flags
              onChange={(v) => updateSettings({ audioLanguage: v })}
            />
            <Choice
              label={t('Sous-titres')}
              value={state.settings.subtitleLanguage}
              options={languages}
              onChange={(v) => updateSettings({ subtitleLanguage: v })}
            />
            <Toggle
              label={t('Afficher les sous-titres')}
              checked={state.settings.subtitles}
              onChange={(v) => updateSettings({ subtitles: v })}
            />
            <Toggle
              label={t('Épisode suivant automatiquement')}
              checked={state.settings.autoNextEpisode}
              onChange={(v) => updateSettings({ autoNextEpisode: v })}
            />
          </>
        )}
        {step === 4 && (
          <section className="onboarding-import">
            <h1>{t('Importer une bibliothèque')}</h1>
            {imported ? (
              <div className="onboarding-card glass" role="status">
                <Check />
                <h2>{t('Import terminé')}</h2>
                <p>
                  {t('{n} titres', { n: state.library.length })} ·{' '}
                  {t('{n} addons installés', { n: state.addons.length })}
                </p>
              </div>
            ) : (
              <ImportPanel
                state={state}
                setState={setState}
                onDone={() => setImported(true)}
                onBusyChange={setImportBusy}
              />
            )}
          </section>
        )}
        {step === 5 && (
          <>
            <span className="onboarding-symbol">
              <Puzzle />
            </span>
            <span className="eyebrow">{t("VOTRE BIBLIOTHÈQUE S'AGRANDIT")}</span>
            <h1>
              {t('Vos sources,')}
              <br />
              {t('vos envies.')}
            </h1>
            <p>
              {t(
                'Les addons apportent des catalogues et des sources vidéo. Ajoutez ceux que vous utilisez déjà.',
              )}
            </p>
            <div className="onboarding-card glass">
              <h2>
                {t(state.addons.length === 1 ? '{n} addon installé' : '{n} addons installés', {
                  n: state.addons.length,
                })}
              </h2>
              <p>
                {t(
                  'Cinemeta vous permet de découvrir les titres. Ajoutez vos sources pour les regarder.',
                )}
              </p>
              <button className="secondary" onClick={onAddon}>
                <Puzzle />
                {t('Ajouter un addon')}
              </button>
            </div>
          </>
        )}
        {step === 6 && (
          <>
            <img className="welcome-logo small" src="/brand/primio.png" alt="" />
            <span className="eyebrow">{t('TOUT EST PRÊT')}</span>
            <h1 className="serif">{t('Installez-vous.')}</h1>
            <p>
              {t(
                'Explorez les catalogues, gardez vos envies dans Ma liste et retrouvez vos réglages dans Paramètres.',
              )}
            </p>
            <div className="onboarding-card glass">
              <strong>{profile.name}</strong>
              <p>
                {languageName(
                  state.settings.audioLanguage,
                  languages.find(([v]) => v === state.settings.audioLanguage)?.[1] ?? '',
                )}{' '}
                · {state.settings.subtitles ? t('Sous-titres activés') : t('Sans sous-titres')}
              </p>
            </div>
          </>
        )}
      </div>
      <footer className="onboarding-footer">
        <div
          className="step-dots"
          aria-label={t('Étape {n} : {name}', { n: step + 1, name: steps[step] })}
        >
          {steps.map((s, i) => (
            <span key={s} className={i === step ? 'active' : ''} />
          ))}
        </div>
        <button
          className="primary"
          disabled={saving || importBusy || (step === 2 && !profile.name.trim())}
          onClick={async () => {
            if (step === steps.length - 1) {
              setSaving(true)
              try {
                await onFinish()
              } finally {
                setSaving(false)
              }
            } else {
              if (step === 2) updateProfile({ name: profile.name.trim() })
              setStep(step + 1)
            }
          }}
        >
          {step === 1
            ? t('Commencer')
            : step === steps.length - 1
              ? t('Explorer Primio')
              : step === 0 && !connected
                ? t('Continuer sans compte')
                : step === 4 && !imported
                  ? t('Passer cette étape')
                  : t('Continuer')}
          <ArrowRight />
        </button>
      </footer>
    </main>
  )
}
