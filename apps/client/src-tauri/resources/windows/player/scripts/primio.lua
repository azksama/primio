local mp = require 'mp'
local utils = require 'mp.utils'
local config = {}
local file = io.open(os.getenv('PRIMIO_PLAYER_CONFIG') or '', 'r')
if file then config = utils.parse_json(file:read('*a')) or {}; file:close() end
local fr = (config.locale or config.language or ''):sub(1, 2) == 'fr'
local translations = {}
local language_file = io.open(mp.find_config_file('locales/' .. (config.locale or 'en') .. '.json') or '', 'r')
if language_file then translations = utils.parse_json(language_file:read('*a')) or {}; language_file:close() end
local function text(en, french) return fr and french or translations[french] or en end
local requested, offered = false, false
local handled = {}
local cache_guard
cache_guard = mp.add_periodic_timer(0.1, function()
    local used = mp.get_property_number('demuxer-cache-state/file-cache-bytes', 0)
    if used > math.max(0, (config.cacheLimitBytes or 0) - 128000000) then
        mp.set_property_native('cache-on-disk', false)
        cache_guard:kill()
    end
end)
local function episode(id, auto)
    if requested or not id or id == '' then return end
    requested = true
    mp.set_property_native('user-data/primio/request', {id=id,auto=auto == true})
    mp.add_timeout(0.8, function() mp.commandv('quit') end)
end
mp.register_script_message('episode', function(id) episode(id, false) end)
mp.register_script_message('next', function() episode(config.nextVideoId, true) end)
mp.add_key_binding('n', 'next', function() episode(config.nextVideoId, true) end)
mp.add_key_binding(nil, 'back', function() mp.commandv('seek', -(config.seekBackward or 15), 'relative') end)
mp.add_key_binding(nil, 'forward', function() mp.commandv('seek', config.seekForward or 30, 'relative') end)
mp.add_key_binding('e', 'episodes', function() mp.commandv('script-message-to','primio_ui','open','episodes') end)
local function style(force)
    mp.set_property('sub-ass-override', force and 'force' or 'no')
    mp.set_property_number('sub-font-size', config.subtitleSize or 40)
    local fonts = {['sans-serif']='Inter',serif='Georgia',monospace='Consolas'}
    mp.set_property('sub-font', fonts[config.subtitleFont] or 'Inter')
    mp.set_property('sub-color', config.subtitleColor or '#FFFFFF')
    mp.set_property_number('sub-border-size', config.subtitleOutline or 2)
    mp.set_property('sub-back-color', config.subtitleBackground and '#99000000' or '#00000000')
end
local forced = config.forceSubtitleStyle == true
style(forced)
mp.register_event('file-loaded', function()
    style(forced)
    if config.audioLanguage == 'original' then
        for _, track in ipairs(mp.get_property_native('track-list', {})) do
            local title = (track.title or ''):lower()
            if track.type == 'audio' and (title:find('original',1,true) or title:match('%f[%a]vo%f[%A]')) then
                mp.set_property_number('aid', track.id)
                break
            end
        end
    end
end)
mp.add_key_binding(nil, 'style', function()
    forced = not forced;style(forced)
    mp.osd_message(forced and text('Primio subtitle style','Style Primio des sous-titres') or text('Embedded subtitle style','Style intégré des sous-titres'))
end)
local function offer_next()
    if offered or not config.nextVideoId or config.nextVideoId == '' then return end
    offered=true
    mp.commandv('script-message-to','primio_ui','next-offer')
end
mp.observe_property('time-pos', 'number', function(_, pos)
    if not pos or requested then return end
    local duration=mp.get_property_number('duration',0)
    for i, segment in ipairs(config.skipSegments or {}) do
        if not handled[i] and pos >= segment.start and pos < segment['end'] then
            handled[i]=true
            if segment.kind=='outro' then
                if config.autoNextEpisode then episode(config.nextVideoId,true) else offer_next() end
            elseif config.autoSkipIntro then mp.commandv('seek',segment['end'],'absolute') end
        end
    end
    if duration>0 and duration-pos<=30 then offer_next() end
    if config.autoNextEpisode and duration>0 and duration-pos<=0.5 then episode(config.nextVideoId,true) end
end)
