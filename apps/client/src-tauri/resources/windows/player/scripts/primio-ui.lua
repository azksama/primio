local mp = require 'mp'
local assdraw = require 'mp.assdraw'
local utils = require 'mp.utils'
local config = {}
local file = io.open(os.getenv('PRIMIO_PLAYER_CONFIG') or '', 'r')
if file then config = utils.parse_json(file:read('*a')) or {}; file:close() end
local fr = (config.locale or ''):sub(1, 2) == 'fr'
local translations = {}
local language_file = io.open(mp.find_config_file('locales/' .. (config.locale or 'en') .. '.json') or '', 'r')
if language_file then translations = utils.parse_json(language_file:read('*a')) or {}; language_file:close() end
local function tr(en, french) return fr and french or translations[french] or en end
local overlay = mp.create_osd_overlay('ass-events')
overlay.z = 1000
local width, height, scale = 1280, 720, 1
local hits, panel, scroll, last_move, loaded, logo_visible = {}, nil, 0, mp.get_time(), false, false
local next_offer=false
local season, forced = nil, config.forceSubtitleStyle == true
local function escape(s) return tostring(s or ''):gsub('\\','\\e'):gsub('{','\\{'):gsub('}','\\}'):gsub('[\r\n]+',' ') end
local function shorten(s, n)
    local chars = {}; for c in tostring(s or ''):gmatch('[%z\1-\127\194-\244][\128-\191]*') do chars[#chars+1] = c end
    if #chars <= n then return table.concat(chars) end
    return table.concat(chars, '', 1, math.max(1,n-1)) .. '…'
end
local function time(seconds)
    seconds=math.floor(math.max(0,seconds or 0)); local h=math.floor(seconds/3600)
    return h>0 and string.format('%d:%02d:%02d',h,math.floor(seconds/60)%60,seconds%60) or string.format('%02d:%02d',math.floor(seconds/60),seconds%60)
end
local function rect(a,x,y,w,h,r,color,alpha,border)
    a:new_event(); a:append(string.format('{\\an7\\pos(0,0)\\bord%s\\shad0\\1c&H%s&\\3c&H888B80&\\alpha&H%s&}',border or 0,color or '30332D',alpha or '20'))
    a:draw_start(); a:round_rect_cw(x,y,x+w,y+h,r,r); a:draw_stop()
end
local function label(a,x,y,s,size,align,color,font)
    a:new_event(); a:append(string.format('{\\an%d\\pos(%.1f,%.1f)\\fn%s\\fs%d\\bord0\\shad0\\1c&H%s&}%s',align or 4,x,y,font or 'Inter',size or 18,color or 'F3F2E9',escape(s)))
end
local function glass(a,x,y,w,h,active)
    rect(a,x,y,w,h,math.min(22,h/2),active and '606456' or '33372F','35',1)
    rect(a,x+3,y+2,w-6,math.min(14,h/3),math.min(10,h/4),'B9BEB0','E6')
end
local function button(a,x,y,w,h,text,action,active)
    glass(a,x,y,w,h,active);label(a,x+w/2,y+h/2,shorten(text,math.floor(w/9)),18,5)
    hits[#hits+1]={x=x,y=y,w=w,h=h,action=action}
end
local function icon(a,x,y,kind)
    a:new_event();a:append(string.format('{\\an7\\pos(%f,%f)\\1c&HF3F2E9&\\bord0\\shad0}',x,y));a:draw_start()
    if kind=='play' then a:move_to(-8,-13);a:line_to(14,0);a:line_to(-8,13);a:line_to(-8,-13)
    elseif kind=='pause' then a:rect_cw(-11,-13,-4,13);a:rect_cw(4,-13,11,13)
    else a:move_to(-12,0);a:line_to(0,-12);a:line_to(3,-9);a:line_to(-4,-2);a:line_to(13,-2);a:line_to(13,2);a:line_to(-4,2);a:line_to(3,9);a:line_to(0,12);a:line_to(-12,0) end
    a:draw_stop()
end
local function open(name) panel=name;scroll=0;last_move=mp.get_time() end
local function hide_logo() if logo_visible then mp.commandv('overlay-remove',42);logo_visible=false end end
local function loading(a)
    rect(a,0,0,width,height,0,'090B0C','00')
    local pulse=(math.sin(mp.get_time()*2.1)+1)/2
    local frame=math.floor(pulse*11)
    local path=(config.logoPath or '')..'/'..frame..'.bgra'
    local info=utils.file_info(path)
    if info and info.size==320*128*4 then
        mp.commandv('overlay-add',42,math.floor(width*scale/2-160),math.floor(height*scale/2-64),path,0,'bgra',320,128,1280)
        logo_visible=true
    else
        hide_logo();label(a,width/2,height/2,shorten(config.title or 'Primio',60),36,5,string.format('%02X%02X%02X',160+80*pulse,160+80*pulse,160+80*pulse),'Cormorant Garamond Light')
    end
end
local function set_style(name,value)
    mp.set_property_native(name,value);forced=true;mp.set_property('sub-ass-override','force')
end
local function render_panel(a)
    rect(a,0,0,width,height,0,'000000','80')
    local w=panel=='episodes' and math.min(480,width-48) or math.min(860,width-48)
    local x=panel=='episodes' and width-w-24 or (width-w)/2
    local h=height-48
    if panel=='tracks' then
        local ac,sc=0,1
        for _,track in ipairs(mp.get_property_native('track-list',{}))do if track.type=='audio' then ac=ac+1 elseif track.type=='sub' then sc=sc+1 end end
        h=math.min(h,270+math.max(ac,sc)*52)
    elseif panel=='style' then h=math.min(h,610) end
    local y=(height-h)/2
    rect(a,x,y,w,h,24,'20231F','14',1)
    local title=panel=='episodes' and tr('Episodes','Épisodes') or panel=='style' and tr('Subtitle style','Style des sous-titres') or tr('Audio and subtitles','Audio et sous-titres')
    label(a,x+24,y+35,title,26)
    button(a,x+w-66,y+14,44,44,'×',function()panel=nil end)
    local top=y+84
    if panel=='tracks' then
        local col=(w-64)/2
        label(a,x+24,top,'Audio',20);label(a,x+40+col,top,tr('Subtitles','Sous-titres'),20)
        local tracks=mp.get_property_native('track-list',{})
        local audio,subs={},{{id='no',title=tr('Off','Désactivés'),selected=not mp.get_property_native('sub-visibility') or mp.get_property('sid')=='no'}}
        for _,track in ipairs(tracks) do if track.type=='audio' then audio[#audio+1]=track elseif track.type=='sub' then subs[#subs+1]=track end end
        local count=math.max(1,math.floor((h-260)/52)); scroll=math.max(0,math.min(scroll,math.max(#audio,#subs)-count))
        for c,list in ipairs({audio,subs}) do
            local cx=x+24+(c-1)*(col+16)
            for i=1,count do local track=list[i+scroll];if track then
                local name=track.title or track.lang or ((c==1 and 'Audio ' or tr('Subtitle ','Sous-titre '))..track.id)
                if track.lang and track.title then name=track.lang:upper()..' · '..track.title end
                button(a,cx,top+25+(i-1)*52,col,44,name,function()
                    mp.set_property(c==1 and 'aid' or 'sid',tostring(track.id))
                    if c==2 then mp.set_property_native('sub-visibility',track.id~='no') end
                end,track.selected)
            end end
        end
        local bottom=y+h-132
        button(a,x+24,bottom,col,44,tr('Embedded style','Style intégré'),function()forced=false;mp.set_property('sub-ass-override','no')end,not forced)
        button(a,x+40+col,bottom,col,44,tr('Primio style','Style Primio'),function()forced=true;mp.set_property('sub-ass-override','force')end,forced)
        button(a,x+24,bottom+58,w-48,44,tr('Style settings','Réglages du style'),function()open('style')end)
    elseif panel=='style' then
        local previewColor=mp.get_property('sub-color','#FFFFFF'):gsub('#',''):sub(1,6)
        label(a,x+w/2,top+32,tr('Your next story starts here.','Votre prochaine histoire commence ici.'),mp.get_property_number('sub-font-size',40),5,previewColor:sub(5,6)..previewColor:sub(3,4)..previewColor:sub(1,2),mp.get_property('sub-font','Inter'))
        local rows={
            {tr('Size','Taille'),{'28','34','40','48','56'},function(v)set_style('sub-font-size',tonumber(v))end},
            {tr('Font','Police'),{'Inter','Georgia','Consolas'},function(v)set_style('sub-font',v)end},
            {tr('Color','Couleur'),{tr('White','Blanc'),tr('Yellow','Jaune'),tr('Cream','Crème')},function(v)set_style('sub-color',v==tr('Yellow','Jaune') and '#FFE082' or v==tr('Cream','Crème') and '#E7E3C7' or '#FFFFFF')end},
            {tr('Outline','Contour'),{'0','1','2','3','4'},function(v)set_style('sub-border-size',tonumber(v))end},
            {tr('Background','Fond'),{tr('None','Aucun'),tr('Dark','Sombre')},function(v)set_style('sub-back-color',v==tr('Dark','Sombre') and '#99000000' or '#00000000')end}
        }
        for i,row in ipairs(rows) do local ry=top+85+(i-1)*78
            label(a,x+24,ry,row[1],16);local bw=(w-48-(#row[2]-1)*10)/#row[2]
            for j,value in ipairs(row[2]) do button(a,x+24+(j-1)*(bw+10),ry+18,bw,42,value,function()row[3](value)end) end
        end
    else
        local seasons,seen={},{}
        for _,ep in ipairs(config.episodes or {}) do if ep.season and not seen[ep.season] then seen[ep.season]=true;seasons[#seasons+1]=ep.season end end
        table.sort(seasons)
        if #seasons>1 then
            season=season or seasons[1]
            button(a,x+24,top,w-48,44,tr('Season ','Saison ')..season..'  ›',function()for i,s in ipairs(seasons)do if s==season then season=seasons[i%#seasons+1];scroll=0;break end end end)
            top=top+62
        end
        local list={};for _,ep in ipairs(config.episodes or {})do if #seasons<=1 or ep.season==season then list[#list+1]=ep end end
        local count=math.floor((y+h-top-24)/62);scroll=math.max(0,math.min(scroll,#list-count))
        for i=1,count do local ep=list[i+scroll];if ep then
            button(a,x+24,top+(i-1)*62,w-48,52,tostring(ep.episode or '')..' · '..(ep.title or ''),function()mp.commandv('script-message-to','primio','episode',ep.id)end,ep.id==config.currentVideoId)
        end end
    end
end
local pip=false
local function unfinished()
    local pos,duration=mp.get_property_number('time-pos',0),mp.get_property_number('duration',0)
    if not loaded or duration<=0 or pos/duration>=0.99 or mp.get_property_native('eof-reached') then return false end
    for _,s in ipairs(config.skipSegments or {}) do
        if s.kind=='outro' and s.start>=0 and s['end']>s.start and s['end']<=duration and pos>=s.start and
            (not s.episodeLength or s.episodeLength==0 or math.abs(duration-s.episodeLength)<math.max(10,duration*.03)) then return false end
    end
    return true
end
local function restore_player()
    pip=false;mp.set_property_native('ontop',false);mp.set_property_native('fullscreen',true);last_move=mp.get_time()
end
local function enter_pip()
    if pip or not unfinished() then return false end
    pip=true;panel=nil;hide_logo();mp.set_property_native('fullscreen',false)
    mp.set_property_native('window-minimized',false);mp.set_property_native('ontop',true)
    mp.set_property('geometry','480x270-24-24');last_move=mp.get_time();return true
end
local function leave_player() if pip or not enter_pip() then mp.commandv('quit') end end
mp.observe_property('focused','bool',function(_,focused)if focused==false then enter_pip()end end)
mp.observe_property('window-minimized','bool',function(_,minimized)if minimized then enter_pip()end end)
mp.add_forced_key_binding('MBTN_LEFT_DBL','primio-restore',restore_player)
local function render()
    local rw,rh=mp.get_osd_size();if rw<=0 or rh<=0 then return end
    scale=pip and 1 or rh/720;width=rw/scale;height=pip and rh or 720;hits={}
    local a=assdraw.ass_new()
    local buffering=not loaded or mp.get_property_native('paused-for-cache',false)
    mp.set_property_native('user-data/primio/ui',{loading=buffering,panel=panel or '',nextOffered=next_offer,fullscreen=mp.get_property_native('fullscreen'),pip=pip})
    if pip then
        hide_logo()
        if mp.get_time()-last_move<3 then
            button(a,24,24,90,52,'×',function()mp.commandv('quit')end)
            button(a,width-210,24,186,52,tr('Expand','Agrandir'),restore_player)
            button(a,width/2-36,height/2-36,72,72,'',function()mp.commandv('cycle','pause')end)
            icon(a,width/2,height/2,mp.get_property_native('pause') and 'play' or 'pause')
        end
    elseif buffering then loading(a)
    else
        hide_logo()
        if panel then render_panel(a)
        elseif mp.get_time()-last_move<3 or mp.get_property_native('pause') then
            rect(a,0,0,width,110,0,'000000','95');rect(a,0,height-145,width,145,0,'000000','90')
            button(a,24,24,48,48,'',leave_player);icon(a,48,48,'back')
            label(a,92,48,shorten(config.title or mp.get_property('media-title','Primio'),math.floor((width-285)/17)),30,4,nil,'Cormorant Garamond Light')
            if #(config.episodes or {})>0 then button(a,width-168,24,144,48,tr('Episodes','Épisodes'),function()open('episodes')end)end
            button(a,width/2-160,height/2-30,90,60,'− '..(config.seekBackward or 15),function()mp.commandv('seek',-(config.seekBackward or 15),'relative')end)
            button(a,width/2-36,height/2-36,72,72,'',function()mp.commandv('cycle','pause')end);icon(a,width/2,height/2,mp.get_property_native('pause') and 'play' or 'pause')
            button(a,width/2+70,height/2-30,90,60,'+ '..(config.seekForward or 30),function()mp.commandv('seek',config.seekForward or 30,'relative')end)
            local pos,duration=mp.get_property_number('time-pos',0),mp.get_property_number('duration',0)
            label(a,28,height-110,time(pos)..' / '..time(duration),17)
            label(a,width-28,height-110,'−'..time(duration-pos),17,6)
            local y,w=height-80,width-56;local fill=duration>0 and math.min(1,pos/duration)*w or 0
            rect(a,28,y,w,7,3,'9EA18F','A0');if fill>1 then rect(a,28,y-2,fill,11,5,'D4DDC2','C0',2);rect(a,28,y,fill,7,3,'DBDFC7','15')end
            rect(a,22+fill,y-3,13,13,6,'FFFFFF','00')
            hits[#hits+1]={x=22,y=y-12,w=w+12,h=30,action=function(mx)if duration>0 then mp.commandv('seek',math.max(0,math.min(1,(mx-28)/w))*duration,'absolute+exact')end end}
            button(a,width-200,height-54,172,40,tr('Audio · Subtitles','Audio · Sous-titres'),function()open('tracks')end)
        end
    end
    if next_offer and not buffering and not panel and not pip then button(a,width-248,height-180,220,48,tr('Next episode','Épisode suivant'),function()next_offer=false;mp.commandv('script-message-to','primio','next')end) end
    overlay.res_x=width;overlay.res_y=height;overlay.data=a.text;overlay:update()
end
mp.add_forced_key_binding('mouse_move','primio-move',function()last_move=mp.get_time()end)
mp.add_forced_key_binding('MBTN_LEFT','primio-click',function()
    local mx,my=mp.get_mouse_pos();mx=mx/scale;my=my/scale
    for _,hit in ipairs(hits)do if mx>=hit.x and mx<=hit.x+hit.w and my>=hit.y and my<=hit.y+hit.h then hit.action(mx,my);last_move=mp.get_time();render();return end end
    if not panel then last_move=mp.get_time()end
end)
mp.add_forced_key_binding('ESC','primio-close',function()if panel then panel=nil else leave_player()end end)
mp.add_forced_key_binding('WHEEL_UP','primio-wheel-up',function()if panel then scroll=math.max(0,scroll-1)else mp.commandv('add','volume',5)end end)
mp.add_forced_key_binding('WHEEL_DOWN','primio-wheel-down',function()if panel then scroll=scroll+1 else mp.commandv('add','volume',-5)end end)
mp.add_key_binding('a','primio-tracks',function()open('tracks')end)
mp.register_script_message('close',function()panel=nil end)
mp.register_script_message('open',function(name)open(name=='episodes' and 'episodes' or name=='style' and 'style' or 'tracks')end)
mp.register_script_message('next-offer',function()next_offer=true end)
mp.register_event('start-file',function()loaded=false end)
mp.register_event('playback-restart',function()loaded=true;last_move=mp.get_time()end)
mp.register_event('shutdown',hide_logo)
mp.add_periodic_timer(1/24,render)
