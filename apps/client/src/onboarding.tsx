import { t } from './i18n'
import { appLanguages, languageName } from './i18n'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowLeft, ArrowRight, Check, Play, Puzzle, UserRound } from 'lucide-react'
import { Choice, Toggle, AvatarPicker } from './components'
import { languages, avatarUrl } from './preferences'
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
  const steps = [t('Bienvenue'), t('Profil'), t('Compte'), t('Lecture'), t('Addons'), t('Prêt')]
  const [step, setStep] = useState(0)
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
        {step === 0 && (
          <>
            <img className="welcome-logo" src="/brand/primio.png" alt="Primio" />
            <Choice
              label={t('Langue de l’application')}
              value={state.settings.uiLanguage}
              options={appLanguages}
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
        {step === 1 && (
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
        {step === 2 && (
          <>
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
              options={languages}
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
        {step === 5 && (
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
          disabled={saving || (step === 1 && !profile.name.trim())}
          onClick={async () => {
            if (step === 5) {
              setSaving(true)
              try {
                await onFinish()
              } finally {
                setSaving(false)
              }
            } else {
              if (step === 1) updateProfile({ name: profile.name.trim() })
              setStep(step + 1)
            }
          }}
        >
          {step === 0
            ? t('Commencer')
            : step === 5
              ? t('Explorer Primio')
              : step === 2 && !connected
                ? t('Continuer sans compte')
                : t('Continuer')}
          <ArrowRight />
        </button>
      </footer>
    </main>
  )
}
