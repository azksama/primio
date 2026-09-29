import { z } from 'zod'

export const permissionSchema = z.enum([
  'theme',
  'pages',
  'addons',
  'sources',
  'layout',
  'spoilers',
  'watchOrder',
  'accessibility',
])
export type Permission = z.infer<typeof permissionSchema>
const https = z
  .string()
  .url()
  .refine(
    (v) => new URL(v).protocol === 'https:' && !new URL(v).username && !new URL(v).password,
    'HTTPS requis',
  )
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const watchEntrySchema = z
  .object({
    id: z.string().min(1).max(256),
    type: z.enum(['movie', 'series', 'anime']),
    name: z.string().min(1).max(200),
    videoId: z.string().max(256).optional(),
    optional: z.boolean().optional(),
  })
  .strict()
export const watchOrderSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    order: z.enum(['release', 'chronological', 'custom']),
    entries: z.array(watchEntrySchema).min(1).max(200),
  })
  .strict()
export const pluginSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    enabled: z.boolean().optional(),
    category: z.enum(['theme', 'sources', 'library', 'accessibility']).optional(),
    id: z
      .string()
      .regex(/^[a-z0-9]+([.-][a-z0-9]+)+$/)
      .max(100),
    name: z.string().min(1).max(80),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    description: z.string().max(500),
    author: z.string().max(100),
    permissions: z.array(permissionSchema).max(8),
    theme: z
      .object({
        background: hex.optional(),
        surface: hex.optional(),
        accent: hex.optional(),
        text: hex.optional(),
        muted: hex.optional(),
        border: hex.optional(),
        radius: z.number().int().min(8).max(28).optional(),
        glassOpacity: z.number().min(0.4).max(1).optional(),
        font: z.enum(['Inter', 'serif', 'monospace']).optional(),
        material: z.enum(['glass', 'neumorphic']).optional(),
        colorScheme: z.enum(['dark', 'light']).optional(),
        shadowLight: hex.optional(),
        shadowDark: hex.optional(),
      })
      .strict()
      .optional(),
    layout: z
      .object({
        columns: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
        labels: z.boolean().optional(),
        density: z.enum(['compact', 'comfortable']).optional(),
      })
      .strict()
      .optional(),
    accessibility: z
      .object({
        reduceMotion: z.boolean().optional(),
        fontScale: z.number().min(1).max(1.3).optional(),
      })
      .strict()
      .optional(),
    spoilers: z.object({ hideUnwatched: z.boolean() }).strict().optional(),
    watchOrder: z.array(watchOrderSchema).min(1).max(20).optional(),
    addons: z
      .array(z.object({ name: z.string().max(80), manifest: https }).strict())
      .max(20)
      .optional(),
    pages: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            title: z.string().max(80),
            blocks: z
              .array(
                z.discriminatedUnion('kind', [
                  z.object({ kind: z.literal('text'), text: z.string().max(3000) }).strict(),
                  z
                    .object({ kind: z.literal('link'), label: z.string().max(80), url: https })
                    .strict(),
                  z
                    .object({
                      kind: z.literal('catalog'),
                      title: z.string().max(80),
                      manifest: https,
                      type: z.string().max(50),
                      catalogId: z.string().max(100),
                    })
                    .strict(),
                ]),
              )
              .max(30),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    sources: z
      .object({
        prefer: z.array(z.string().min(1).max(80)).max(20).optional(),
        hide: z.array(z.string().min(1).max(80)).max(20).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const capability of [
      'theme',
      'pages',
      'addons',
      'sources',
      'layout',
      'accessibility',
      'spoilers',
      'watchOrder',
    ] as const)
      if (p[capability] && !p.permissions.includes(capability))
        ctx.addIssue({
          code: 'custom',
          message: 'Permission manquante: ' + capability,
          path: [capability],
        })
  })
export type PrimioPlugin = z.infer<typeof pluginSchema>
export type PrimioTheme = NonNullable<PrimioPlugin['theme']>
export type WatchOrder = z.infer<typeof watchOrderSchema>
export const definePlugin = (plugin: PrimioPlugin): PrimioPlugin => pluginSchema.parse(plugin)
export function activatePlugin(input: unknown, grants: Permission[]): PrimioPlugin {
  const p = pluginSchema.parse(input)
  if (p.permissions.some((permission) => !grants.includes(permission)))
    throw Error('Permissions non accordées')
  return p
}
export function rankSources<T extends { name?: string; title?: string }>(
  streams: T[],
  plugins: PrimioPlugin[],
): T[] {
  let output = [...streams]
  for (const plugin of plugins.filter(
    (p) => p.enabled !== false && p.permissions.includes('sources') && p.sources,
  )) {
    const text = (s: T) => ((s.name ?? '') + ' ' + (s.title ?? '')).toLowerCase()
    const hide = plugin.sources!.hide ?? [],
      prefer = plugin.sources!.prefer ?? []
    output = output.filter((s) => !hide.some((term) => text(s).includes(term.toLowerCase())))
    const rank = (s: T) => prefer.findIndex((term) => text(s).includes(term.toLowerCase()))
    output.sort((a, b) => (rank(a) < 0 ? 999 : rank(a)) - (rank(b) < 0 ? 999 : rank(b)))
  }
  return output
}
