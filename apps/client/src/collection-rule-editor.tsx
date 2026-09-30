import { useId } from 'react'
import { Choice } from './components'
import { Plus, Trash2, ArrowUp, ArrowDown } from './icons'
import { t } from './i18n'
import { numericFields, ruleLimits } from './collection-rules'
import type {
  CollectionCondition,
  CollectionField,
  CollectionGroup,
  CollectionRules,
  CollectionSort,
  Meta,
} from './types'

export const fieldLabels: Record<CollectionField, string> = {
  type: 'Type',
  status: 'État',
  genre: 'Genre',
  year: 'Année',
  rating: 'Note',
  runtime: 'Durée (minutes)',
  country: 'Pays',
  language: 'Langue d’origine',
  name: 'Titre',
  cast: 'Acteur',
  director: 'Réalisateur',
}
export const sortLabels = {
  manual: 'Ajout',
  name: 'Nom',
  status: 'État',
  rating: 'Note',
  year: 'Année',
  runtime: 'Durée',
}
export const newCondition = (): CollectionCondition => ({
  id: crypto.randomUUID(),
  field: 'type',
  operator: 'is',
  value: 'anime',
})
const newGroup = (): CollectionGroup => ({
  id: crypto.randomUUID(),
  match: 'all',
  conditions: [newCondition()],
})
export const newRules = (): CollectionRules => ({ version: 1, match: 'all', groups: [newGroup()] })
export function rulePreset(name: string): CollectionRules {
  const rules = newRules(),
    group = rules.groups[0]
  if (name === 'films') {
    group.conditions[0].value = 'movie'
    group.conditions.push({ id: crypto.randomUUID(), field: 'rating', operator: 'gte', value: '7' })
  } else {
    group.conditions[0].value = name === 'series' ? 'series' : 'anime'
    group.conditions.push({
      id: crypto.randomUUID(),
      field: 'status',
      operator: 'is',
      value: name === 'series' ? 'watching' : 'planned',
    })
  }
  return rules
}
export function CollectionRulesEditor({
  rules,
  onChange,
  metas,
}: {
  rules: CollectionRules
  onChange: (rules: CollectionRules) => void
  metas: Meta[]
}) {
  const listId = useId()
  const updateGroup = (group: CollectionGroup) =>
    onChange({ ...rules, groups: rules.groups.map((g) => (g.id === group.id ? group : g)) })
  const updateCondition = (group: CollectionGroup, condition: CollectionCondition) =>
    updateGroup({
      ...group,
      conditions: group.conditions.map((c) => (c.id === condition.id ? condition : c)),
    })
  return (
    <div className="rule-builder">
      <p className="muted">
        {t('Inclure automatiquement les titres de Ma liste qui répondent à vos conditions.')}
      </p>
      <div className="rule-presets" role="group" aria-label={t('Exemples de règles')}>
        {[
          ['anime', 'Animes à voir'],
          ['films', 'Films bien notés'],
          ['series', 'Séries en cours'],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => onChange(rulePreset(key))}>
            {t(label)}
          </button>
        ))}
      </div>
      {rules.groups.length > 1 && (
        <Choice
          separateLabel
          label={t('Combiner les groupes')}
          value={rules.match}
          options={[
            ['all', t('Tous les groupes (ET)')],
            ['any', t('Au moins un groupe (OU)')],
          ]}
          onChange={(match) => onChange({ ...rules, match: match as 'all' | 'any' })}
        />
      )}
      {rules.groups.map((group, groupIndex) => (
        <fieldset className="rule-group" key={group.id}>
          <legend>{t('Groupe {n}', { n: groupIndex + 1 })}</legend>
          <div className="rule-group-head">
            <Choice
              floating
              label={t('Inclure si')}
              value={group.match}
              options={[
                ['all', t('Toutes les conditions (ET)')],
                ['any', t('Au moins une condition (OU)')],
              ]}
              onChange={(match) => updateGroup({ ...group, match: match as 'all' | 'any' })}
            />
            {rules.groups.length > 1 && (
              <button
                className="icon"
                type="button"
                aria-label={t('Supprimer le groupe {n}', { n: groupIndex + 1 })}
                onClick={() =>
                  onChange({ ...rules, groups: rules.groups.filter((g) => g.id !== group.id) })
                }
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
          {group.conditions.map((c, index) => {
            const operators = numericFields.has(c.field)
              ? [
                  ['is', 'Est égal à'],
                  ['not', 'Est différent de'],
                  ['gte', 'Au moins'],
                  ['lte', 'Au plus'],
                  ['between', 'Entre'],
                ]
              : ['type', 'status', 'genre', 'country', 'language'].includes(c.field)
                ? [
                    ['is', 'Est'],
                    ['not', 'N’est pas'],
                  ]
                : [
                    ['contains', 'Contient'],
                    ['not_contains', 'Ne contient pas'],
                    ['is', 'Est'],
                    ['not', 'N’est pas'],
                  ]
            const enums: [string, string][] | null =
              c.field === 'type'
                ? [
                    ['movie', t('Film')],
                    ['series', t('Série')],
                    ['anime', t('Anime')],
                  ]
                : c.field === 'status'
                  ? [
                      ['planned', t('À voir')],
                      ['watching', t('En cours')],
                      ['completed', t('Terminé')],
                    ]
                  : null
            const suggestions = Array.from(
              new Set(
                metas.flatMap((m) =>
                  c.field === 'genre'
                    ? (m.genres ?? [])
                    : c.field === 'cast'
                      ? (m.cast ?? [])
                      : c.field === 'director'
                        ? (m.director ?? [])
                        : c.field === 'language'
                          ? [m.originalLanguage ?? m.original_language ?? '']
                          : c.field === 'country'
                            ? [
                                ...(m.origin_country ?? []),
                                ...(typeof m.country === 'string'
                                  ? [m.country]
                                  : (m.country ?? [])),
                              ]
                            : [],
                ),
              ),
            )
              .filter(Boolean)
              .sort()
              .slice(0, 100)
            const changeField = (field: CollectionField) =>
              updateCondition(group, {
                id: c.id,
                field,
                operator: ['name', 'cast', 'director'].includes(field)
                  ? 'contains'
                  : numericFields.has(field)
                    ? 'gte'
                    : 'is',
                value:
                  field === 'type'
                    ? 'anime'
                    : field === 'status'
                      ? 'planned'
                      : field === 'rating'
                        ? '7'
                        : '',
              })
            return (
              <div className="rule-condition" key={c.id}>
                <Choice
                  separateLabel
                  label={t('Critère {n}', { n: index + 1 })}
                  value={c.field}
                  options={Object.entries(fieldLabels).map(([key, label]) => [key, t(label)])}
                  onChange={(value) => changeField(value as CollectionField)}
                />
                <Choice
                  separateLabel
                  label={t('Condition {n}', { n: index + 1 })}
                  value={c.operator}
                  options={operators.map(([key, label]) => [key, t(label)])}
                  onChange={(operator) =>
                    updateCondition(group, {
                      ...c,
                      operator: operator as CollectionCondition['operator'],
                    })
                  }
                />
                {enums ? (
                  <Choice
                    separateLabel
                    label={t('Valeur {n}', { n: index + 1 })}
                    value={c.value}
                    options={enums}
                    onChange={(value) => updateCondition(group, { ...c, value })}
                  />
                ) : (
                  <label className="rule-value field">
                    <span>{t(fieldLabels[c.field])}</span>
                    <input
                      type={numericFields.has(c.field) ? 'number' : 'text'}
                      value={c.value}
                      required
                      maxLength={120}
                      min={numericFields.has(c.field) ? 0 : undefined}
                      max={
                        c.field === 'rating'
                          ? 10
                          : c.field === 'year'
                            ? 3000
                            : c.field === 'runtime'
                              ? 10000
                              : undefined
                      }
                      step={c.field === 'rating' ? '.1' : '1'}
                      placeholder={
                        c.field === 'country' ? 'JP' : c.field === 'language' ? 'ja' : undefined
                      }
                      list={suggestions.length ? `${listId}-${c.id}` : undefined}
                      onChange={(e) => updateCondition(group, { ...c, value: e.target.value })}
                    />
                    {suggestions.length > 0 && (
                      <datalist id={`${listId}-${c.id}`}>
                        {suggestions.map((value) => (
                          <option value={value} key={value} />
                        ))}
                      </datalist>
                    )}
                  </label>
                )}
                {c.operator === 'between' && (
                  <label className="rule-value field">
                    <span>{t('Et')}</span>
                    <input
                      type="number"
                      value={c.to ?? ''}
                      required
                      min={Number(c.value) || 0}
                      max={c.field === 'rating' ? 10 : c.field === 'year' ? 3000 : 10000}
                      step={c.field === 'rating' ? '.1' : '1'}
                      onChange={(e) => updateCondition(group, { ...c, to: e.target.value })}
                    />
                  </label>
                )}
                <button
                  className="icon rule-remove"
                  type="button"
                  disabled={group.conditions.length === 1}
                  aria-label={t('Supprimer le critère {n}', { n: index + 1 })}
                  onClick={() =>
                    updateGroup({
                      ...group,
                      conditions: group.conditions.filter((v) => v.id !== c.id),
                    })
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            className="rule-add"
            disabled={group.conditions.length >= ruleLimits.conditions}
            onClick={() =>
              updateGroup({ ...group, conditions: [...group.conditions, newCondition()] })
            }
          >
            <Plus size={16} />
            {t('Ajouter une condition')}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary rule-add"
        disabled={rules.groups.length >= ruleLimits.groups}
        onClick={() => onChange({ ...rules, groups: [...rules.groups, newGroup()] })}
      >
        <Plus size={18} />
        {t('Ajouter un groupe')}
      </button>
    </div>
  )
}
export function CollectionSorting({
  sorts,
  onChange,
}: {
  sorts: CollectionSort[]
  onChange: (sorts: CollectionSort[]) => void
}) {
  return (
    <div className="collection-sorting">
      <p className="muted">{t('Les critères suivants départagent les titres à égalité.')}</p>
      {sorts.map((sort, index) => (
        <div className="collection-sort-row" key={index}>
          <Choice
            separateLabel
            label={t(index ? 'Puis par' : 'Trier par')}
            value={sort.key}
            options={Object.entries(sortLabels)
              .filter(([key]) => key === sort.key || !sorts.some((s) => s.key === key))
              .map(([key, label]) => [key, t(label)])}
            onChange={(key) =>
              onChange(
                sorts.map((s, i) =>
                  i === index ? { ...s, key: key as CollectionSort['key'] } : s,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon glass"
            aria-label={t(sort.direction === 'asc' ? 'Ordre croissant' : 'Ordre décroissant')}
            onClick={() =>
              onChange(
                sorts.map((s, i) =>
                  i === index ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s,
                ),
              )
            }
          >
            {sort.direction === 'asc' ? <ArrowUp size={19} /> : <ArrowDown size={19} />}
          </button>
          {index > 0 && (
            <button
              type="button"
              className="icon"
              aria-label={t('Supprimer le tri {n}', { n: index + 1 })}
              onClick={() => onChange(sorts.filter((_, i) => i !== index))}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="rule-add"
        disabled={sorts.length >= ruleLimits.sorts}
        onClick={() =>
          onChange([
            ...sorts,
            {
              key: Object.keys(sortLabels).find(
                (k) => !sorts.some((s) => s.key === k),
              ) as CollectionSort['key'],
              direction: 'asc',
            },
          ])
        }
      >
        <Plus size={16} />
        {t('Ajouter un critère de tri')}
      </button>
    </div>
  )
}
