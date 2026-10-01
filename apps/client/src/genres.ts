import { locale } from './i18n'

// Provider/filter values stay intact. Only their presentation is localized.
const languages = ['en', 'fr', 'de', 'es', 'pt', 'ja', 'zh-Hans', 'zh-Hant']
const labels = [
  ['Action', 'Action', 'Action', 'Acción', 'Ação', 'アクション', '动作', '動作'],
  ['Adventure', 'Aventure', 'Abenteuer', 'Aventura', 'Aventura', 'アドベンチャー', '冒险', '冒險'],
  ['Animation', 'Animation', 'Animation', 'Animación', 'Animação', 'アニメーション', '动画', '動畫'],
  ['Comedy', 'Comédie', 'Komödie', 'Comedia', 'Comédia', 'コメディ', '喜剧', '喜劇'],
  ['Drama', 'Drame', 'Drama', 'Drama', 'Drama', 'ドラマ', '剧情', '劇情'],
  ['Fantasy', 'Fantastique', 'Fantasy', 'Fantasía', 'Fantasia', 'ファンタジー', '奇幻', '奇幻'],
  ['Science Fiction', 'Science-fiction', 'Science-Fiction', 'Ciencia ficción', 'Ficção científica', 'SF', '科幻', '科幻'],
  ['Romance', 'Romance', 'Romantik', 'Romance', 'Romance', '恋愛', '爱情', '愛情'],
  ['Thriller', 'Thriller', 'Thriller', 'Suspenso', 'Suspense', 'スリラー', '惊悚', '驚悚'],
  ['Horror', 'Horreur', 'Horror', 'Terror', 'Terror', 'ホラー', '恐怖', '恐怖'],
  ['Mystery', 'Mystère', 'Mystery', 'Misterio', 'Mistério', 'ミステリー', '悬疑', '懸疑'],
  ['Crime', 'Crime', 'Krimi', 'Crimen', 'Crime', '犯罪', '犯罪', '犯罪'],
  ['Documentary', 'Documentaire', 'Dokumentarfilm', 'Documental', 'Documentário', 'ドキュメンタリー', '纪录片', '紀錄片'],
  ['Family', 'Familial', 'Familie', 'Familia', 'Família', 'ファミリー', '家庭', '家庭'],
  ['History', 'Histoire', 'Historie', 'Historia', 'História', '歴史', '历史', '歷史'],
  ['Music', 'Musique', 'Musik', 'Música', 'Música', '音楽', '音乐', '音樂'],
  ['War', 'Guerre', 'Krieg', 'Guerra', 'Guerra', '戦争', '战争', '戰爭'],
  ['Western', 'Western', 'Western', 'Wéstern', 'Faroeste', '西部劇', '西部', '西部'],
  ['Sports', 'Sport', 'Sport', 'Deportes', 'Esportes', 'スポーツ', '运动', '運動'],
  ['Slice of Life', 'Tranche de vie', 'Alltag', 'Vida cotidiana', 'Cotidiano', '日常', '日常', '日常'],
  ['Supernatural', 'Surnaturel', 'Übernatürlich', 'Sobrenatural', 'Sobrenatural', '超自然', '超自然', '超自然'],
  ['Psychological', 'Psychologique', 'Psychologisch', 'Psicológico', 'Psicológico', '心理', '心理', '心理'],
  ['Mecha', 'Mecha', 'Mecha', 'Mecha', 'Mecha', 'メカ', '机甲', '機甲'],
  ['School', 'École', 'Schule', 'Escolar', 'Escolar', '学園', '校园', '校園'],
  ['Martial Arts', 'Arts martiaux', 'Kampfkunst', 'Artes marciales', 'Artes marciais', '格闘', '武术', '武術'],
  ['Historical', 'Historique', 'Historisch', 'Histórico', 'Histórico', '時代劇', '历史题材', '歷史題材'],
  ['Military', 'Militaire', 'Militär', 'Militar', 'Militar', 'ミリタリー', '军事', '軍事'],
  ['Ecchi', 'Ecchi', 'Ecchi', 'Ecchi', 'Ecchi', 'エッチ', '轻情色', '輕情色'],
  ['Shounen', 'Shōnen', 'Shōnen', 'Shōnen', 'Shōnen', '少年', '少年', '少年'],
  ['Shoujo', 'Shōjo', 'Shōjo', 'Shōjo', 'Shōjo', '少女', '少女', '少女'],
  ['Seinen', 'Seinen', 'Seinen', 'Seinen', 'Seinen', '青年', '青年', '青年'],
  ['Josei', 'Josei', 'Josei', 'Josei', 'Josei', '女性', '女性', '女性'],
  ['Isekai', 'Isekai', 'Isekai', 'Isekai', 'Isekai', '異世界', '异世界', '異世界'],
  ['Harem', 'Harem', 'Harem', 'Harén', 'Harém', 'ハーレム', '后宫', '後宮'],
  ['Kids', 'Enfants', 'Kinder', 'Infantil', 'Infantil', '子供向け', '儿童', '兒童'],
  ['Reality', 'Téléréalité', 'Reality-TV', 'Telerrealidad', 'Reality show', 'リアリティ', '真人秀', '真人秀'],
  ['News', 'Actualités', 'Nachrichten', 'Noticias', 'Notícias', 'ニュース', '新闻', '新聞'],
  ['Talk', 'Débat', 'Talkshow', 'Programa de entrevistas', 'Programa de entrevistas', 'トーク', '访谈', '訪談'],
  ['TV Movie', 'Téléfilm', 'Fernsehfilm', 'Película de TV', 'Filme para TV', 'テレビ映画', '电视电影', '電視電影'],
  ['Action & Adventure', 'Action et aventure', 'Action und Abenteuer', 'Acción y aventura', 'Ação e aventura', 'アクション＆アドベンチャー', '动作与冒险', '動作與冒險'],
  ['Sci-Fi & Fantasy', 'Science-fiction et fantastique', 'Science-Fiction und Fantasy', 'Ciencia ficción y fantasía', 'Ficção científica e fantasia', 'SF＆ファンタジー', '科幻与奇幻', '科幻與奇幻'],
  ['War & Politics', 'Guerre et politique', 'Krieg und Politik', 'Guerra y política', 'Guerra e política', '戦争＆政治', '战争与政治', '戰爭與政治'],
]
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const aliases: Record<string, string> = {
  scifi: 'Science Fiction', sciencefiction: 'Science Fiction', sf: 'Science Fiction',
  shonen: 'Shounen', shoujo: 'Shoujo', shojo: 'Shoujo', sport: 'Sports',
  animated: 'Animation', anime: 'Animation', '애니메이션': 'Animation',
  suspense: 'Thriller', familial: 'Family', supernatural: 'Supernatural',
}
const canonical = new Map(labels.flatMap(row => row.map(value => [normalize(value), row[0]] as const)))
const normalizedAliases = new Map(Object.entries(aliases).map(([key, value]) => [normalize(key), value]))
export function canonicalGenre(value: string) {
  return normalizedAliases.get(normalize(value)) ?? canonical.get(normalize(value)) ?? value
}
export function genreLabel(value: string) {
  const row = labels.find(row => row[0] === canonicalGenre(value))
  return row?.[Math.max(0, languages.indexOf(locale()))] ?? value
}
