local mp = require 'mp'
local assdraw = require 'mp.assdraw'
local utils = require 'mp.utils'
local icons = dofile(mp.find_config_file('primio-icons.lua'))
local config = {}
local file = io.open(os.getenv('PRIMIO_PLAYER_CONFIG') or '', 'r')
if file then config = utils.parse_json(file:read('*a')) or {}; file:close() end
local theme=config.theme or {}
local neo=theme.material=='neumorphic'
local function theme_color(key,fallback)
    local value=theme[key]
    if type(value)~='string' or not value:match('^#%x%x%x%x%x%x$') then return fallback end
    return value:sub(6,7)..value:sub(4,5)..value:sub(2,3)
end
local surface=theme_color('surface','302B28')
local highlight=theme_color('shadowLight','453D38')
local shadow=theme_color('shadowDark','201C19')
local foreground=neo and theme_color('text','E8F0F3') or 'F3F2E9'
local accent=theme_color('accent','ACD3E6')
local fr = (config.locale or ''):sub(1, 2) == 'fr'
local translations = {}
local language_file = io.open(mp.find_config_file('locales/' .. (config.locale or 'en') .. '.json') or '', 'r')
if language_file then translations = utils.parse_json(language_file:read('*a')) or {}; language_file:close() end
local function tr(en, french) return fr and french or translations[french] or en end
local overlay = mp.create_osd_overlay('ass-events')
overlay.z = 1000
local width, height, scale = 1280, 720, 1
local hits, panel, scroll, last_move, loaded, logo_visible = {}, nil, 0, mp.get_time(), false, false
local preview_visible=false
local press,scrub=nil,nil
local preview_target,preview_x=0,0
local next_offer=false
local countdown_key,countdown_elapsed="",0
local skipped_segments={}
local cancelled_segments,cancelled_next={},false
local scroll_to_current=false
local episode_images={}
local image_request=''
for i,ep in ipairs(config.episodes or {})do ep.imageIndex=i-1 end
local seek_feedback,seek_feedback_at=0,0
local season, forced = nil, config.forceSubtitleStyle == true
local season_picker=false
local levels={}
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
local function rect(a,x,y,w,h,r,color,alpha,border,blur)
    a:new_event(); a:append(string.format('{\\an7\\pos(0,0)\\bord%s\\shad0\\blur%s\\1c&H%s&\\3c&H888B80&\\alpha&H%s&}',border or 0,blur or 0,color or '30332D',alpha or '20'))
    a:draw_start(); a:round_rect_cw(x,y,x+w,y+h,r,r); a:draw_stop()
end
local function label(a,x,y,s,size,align,color,font)
    a:new_event(); a:append(string.format('{\\an%d\\pos(%.1f,%.1f)\\fn%s\\fs%d\\bord0\\shad1.2\\blur0.4\\4a&H40&\\1c&H%s&}%s',align or 4,x,y,font or 'Inter',size or 18,color or foreground,escape(s)))
end
local function relief(a,x,y,w,h,r,active)
    if active then
        rect(a,x,y,w,h,r,shadow,'00',0,1)
        rect(a,x+2,y+2,w-2,h-2,r,highlight,'00',0,1)
        rect(a,x+3,y+3,w-6,h-6,math.max(1,r-2),surface,'00',0,2)
    else
        rect(a,x+4,y+5,w,h,r,shadow,'20',0,5)
        rect(a,x-3,y-3,w,h,r,highlight,'70',0,5)
        rect(a,x,y,w,h,r,surface,'00')
        rect(a,x+2,y+2,w-4,h-4,math.max(1,r-2),highlight,'DE',0,1)
    end
end
local function glass(a,x,y,w,h,active)
    if neo then relief(a,x,y,w,h,math.min(18,h/2),active);return end
    rect(a,x,y,w,h,math.min(22,h/2),active and '727269' or '2D2E2B','80',1)
    rect(a,x+2,y+2,w-4,h-4,math.min(20,h/2-2),'D7DBD1','F5',0.5)
end
local function button(a,x,y,w,h,text,action,active,trailing)
    glass(a,x,y,w,h,active);label(a,trailing and x+18 or x+w/2,y+h/2,shorten(text,math.floor((w-(trailing and 52 or 0))/9)),18,trailing and 4 or 5,active and accent or nil)
    if trailing then
        for _,path in ipairs(icons[trailing] or {})do a:new_event();a:append(string.format('{\\an7\\pos(%f,%f)\\1c&H%s&\\bord0\\shad0\\p1}%s{\\p0}',x+w-44,y+h/2-14,foreground,path))end
    end
    hits[#hits+1]={x=x,y=y,w=w,h=h,action=action}
end
local function icon(a,x,y,kind)
    local half=(kind=='play' or kind=='pause') and 20 or 14
    for _,path in ipairs(icons[kind] or icons.play) do
        a:new_event();a:append(string.format('{\\an7\\pos(%f,%f)\\1c&H%s&\\bord0\\shad0\\p1}%s{\\p0}',x-half,y-half,foreground,path))
    end
end
local function icon_button(a,x,y,size,kind,action)
    if neo then relief(a,x,y,size,size,size/2,false)
    else rect(a,x,y,size,size,size/2,'343832','80',1)
    rect(a,x+2,y+2,size-4,size-4,(size-4)/2,'D7DBD1','F5',0.5) end
    icon(a,x+size/2,y+size/2,kind)
    hits[#hits+1]={x=x,y=y,w=size,h=size,action=action}
end
-- Keep text readable over bright footage without dimming the whole image.
local function video_time(a,x,y,text,align)
    if neo then
        local w=#text*10+20
        local left=align==3 and x-w or x
        relief(a,left,y-30,w,30,9,true)
        label(a,left+10,y-15,text,17,4)
    else label(a,x,y,text,17,align) end
end
local function title(a,x,y,text,available,maxsize,centered)
    local chars={};for c in tostring(text):gmatch('[%z\1-\127\194-\244][\128-\191]*')do chars[#chars+1]=c end
    -- Conservative glyph width also accommodates Japanese and Chinese names.
    local units=0;for _,c in ipairs(chars)do units=units+(#c>1 and 1 or .55)end
    local size=math.max(centered and 12 or 16,math.min(maxsize,math.floor(available/math.max(1,units))))
    local lines=math.max(1,math.ceil(units*size/available))
    local count=math.ceil(#chars/lines)
    if neo then
        local w=math.min(available,units*size)+20
        relief(a,x-(centered and w/2 or 10),y-lines*size*1.12/2-8,w,lines*size*1.12+16,10,true)
    end
    for i=1,lines do label(a,x,y+(i-(lines+1)/2)*size*1.12,table.concat(chars,'',(i-1)*count+1,math.min(#chars,i*count)),size,centered and 5 or 4,nil,'Cormorant Garamond Light')end
end
local function render_level(a,kind,value)
    local x=kind=='brightness' and 28 or width-92
    local y=height/2-102
    local fraction=math.max(0,math.min(1,value.fraction))
    glass(a,x,y,64,204,false)
    icon(a,x+32,y+30,kind=='volume' and fraction==0 and 'mute' or kind)
    rect(a,x+28,y+57,8,103,4,foreground,'C8')
    if fraction>0 then rect(a,x+28,y+57+103*(1-fraction),8,103*fraction,4,accent,'00')end
    label(a,x+32,y+180,tostring(math.floor(fraction*100+.5))..'%',15,5)
end
local function end_scrub(commit)
    if scrub then
        if commit then mp.commandv('seek',scrub.target,'absolute+exact')end
        mp.set_property_native('pause',scrub.paused);scrub=nil
    end
    press=nil;last_move=mp.get_time()
end
local function hide_episode_images()
    for id in pairs(episode_images)do mp.commandv('overlay-remove',id)end
    episode_images={}
end
local function open(name) panel=name;season_picker=false;scroll=0;scroll_to_current=name=='episodes';if scroll_to_current then season=nil end;last_move=mp.get_time() end
local function jump(forward)
    local pos=mp.get_property_number('time-pos',0)
    local duration=mp.get_property_number('duration',0)
    local amount=forward and (config.seekForward or 30) or -(config.seekBackward or 15)
    local target=math.max(0,duration>0 and math.min(duration,pos+amount) or pos+amount)
    seek_feedback=target-pos;seek_feedback_at=mp.get_time();last_move=seek_feedback_at
    mp.commandv('seek',target,'absolute+exact')
end
mp.register_script_message('seek',function(direction)jump(direction=='forward')end)
local function hide_logo() if logo_visible then mp.commandv('overlay-remove',42);logo_visible=false end end
local function loading(a)
    rect(a,0,0,width,height,0,neo and theme_color('background','302B28') or '090B0C','00')
    local pulse=(math.sin(mp.get_time()*2.1)+1)/2
    local frame=math.floor(pulse*11)
    local path=(config.logoPath or '')..'/'..frame..'.bgra'
    local info=utils.file_info(path)
    if info and info.size==640*256*4 then
        mp.commandv('overlay-add',42,math.floor(width*scale/2-320),math.floor(height*scale/2-128),path,0,'bgra',640,256,2560)
        logo_visible=true
    else
        hide_logo();title(a,width*.2,height/2,config.title or 'Primio',width*.6,48)
    end
end
local function set_style(name,value)
    mp.set_property_native(name,value);forced=true;mp.set_property('sub-ass-override','force')
end
local function render_panel(a)
    rect(a,0,0,width,height,0,'000000','80')
    local w=panel=='episodes' and math.min(560,width-48) or math.min(860,width-48)
    local x=panel=='episodes' and width-w-24 or (width-w)/2
    local h=height-48
    if panel=='tracks' then
        local ac,sc=0,1
        for _,track in ipairs(mp.get_property_native('track-list',{}))do if track.type=='audio' then ac=ac+1 elseif track.type=='sub' then sc=sc+1 end end
        h=math.min(h,270+math.max(ac,sc)*52)
    elseif panel=='style' then h=math.min(h,610) end
    local y=(height-h)/2
    if neo then relief(a,x,y,w,h,24,false) else rect(a,x,y,w,h,24,'20231F','14',1) end
    local title=panel=='episodes' and tr('Episodes','Épisodes') or panel=='style' and tr('Subtitle style','Style des sous-titres') or panel=='speed' and tr('Playback speed','Vitesse de lecture') or tr('Audio and subtitles','Audio et sous-titres')
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
                    mp.commandv('script-message-to','primio','remember-track',c==1 and 'audio' or 'sub',tostring(track.id))
                    if c==2 then mp.set_property_native('sub-visibility',track.id~='no') end
                end,track.selected)
            end end
        end
        local bottom=y+h-132
        button(a,x+24,bottom,col,44,tr('Embedded style','Style intégré'),function()forced=false;mp.set_property('sub-ass-override','no')end,not forced)
        button(a,x+40+col,bottom,col,44,tr('Primio style','Style Primio'),function()forced=true;mp.set_property('sub-ass-override','force')end,forced)
        button(a,x+24,bottom+58,w-48,44,tr('Style settings','Réglages du style'),function()open('style')end)
    elseif panel=='speed' then
        for i,speed in ipairs({0.5,0.75,1,1.25,1.5,1.75,2}) do button(a,x+24+((i-1)%2)*((w-60)/2+12),top+math.floor((i-1)/2)*52,(w-60)/2,44,tostring(speed)..'×',function()mp.set_property_number('speed',speed);panel=nil end,mp.get_property_number('speed',1)==speed) end
    elseif panel=='style' then
        local previewColor=mp.get_property('sub-color','#FFFFFF'):gsub('#',''):sub(1,6)
        label(a,x+w/2,top+32,tr('Your next story starts here.','Votre prochaine histoire commence ici.'),mp.get_property_number('sub-font-size',40),5,previewColor:sub(5,6)..previewColor:sub(3,4)..previewColor:sub(1,2),mp.get_property('sub-font','Inter'))
        local fonts={'Inter','Georgia','Consolas'}
        if config.customFont and config.customFont.family then fonts[#fonts+1]=config.customFont.family end
        local rows={
            {tr('Size','Taille'),{'28','34','40','48','56'},function(v)set_style('sub-font-size',tonumber(v))end},
            {tr('Font','Police'),fonts,function(v)set_style('sub-font',v)end},
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
            if not season then
                for _,ep in ipairs(config.episodes or {}) do if ep.id==config.currentVideoId then season=ep.season;break end end
                season=season or seasons[1]
            end
            button(a,x+24,top,w-48,44,season==0 and tr('Specials','Hors-série') or tr('Season ','Saison ')..season,function()season_picker=not season_picker;scroll=0 end,false,'chevron')
            top=top+62
        end
        if season_picker then
            local count=math.max(1,math.floor((y+h-top-24)/52));scroll=math.max(0,math.min(scroll,#seasons-count))
            for i=1,count do local choice=seasons[i+scroll];if choice then
                button(a,x+24,top+(i-1)*52,w-48,44,choice==0 and tr('Specials','Hors-série') or tr('Season ','Saison ')..choice,function()season=choice;season_picker=false;scroll=0;scroll_to_current=true end,choice==season)
            end end
        else
        local list={};for _,ep in ipairs(config.episodes or {})do if #seasons<=1 or ep.season==season then list[#list+1]=ep end end
        local count=math.max(1,math.floor((y+h-top-24)/100))
        if scroll_to_current then for i,ep in ipairs(list)do if ep.id==config.currentVideoId then scroll=i-1-math.floor(count/2);break end end;scroll_to_current=false end
        scroll=math.max(0,math.min(scroll,math.max(0,#list-count)))
        local visible_images,requests={},{}
        local iw,ih=math.max(1,math.floor(104*scale)),math.max(1,math.floor(72*scale))
        for i=1,count do local ep=list[i+scroll];if ep then
            local row_y=top+(i-1)*100
            local current=ep.id==config.currentVideoId
            local row_w=w-48
            glass(a,x+24,row_y,row_w,88,current)
            local image_loaded=false
            if config.episodeImagePath and ep.thumbnail and ep.thumbnail~='' then
                local path=config.episodeImagePath..'/episode-'..ep.imageIndex..'-'..iw..'-'..ih..'.bgra'
                local info=utils.file_info(path)
                if info and info.size==iw*ih*4 then
                    local id=16+i;mp.commandv('overlay-add',id,math.floor((x+32)*scale),math.floor((row_y+8)*scale),path,0,'bgra',iw,ih,iw*4);visible_images[id]=true;image_loaded=true
                else requests[#requests+1]=ep.imageIndex end
            end
            if not image_loaded then rect(a,x+32,row_y+8,104,72,8,surface,'00');icon(a,x+84,row_y+44,'play')end
            local tx,available=x+148,row_w-208
            local function line(value,offset,size,color)
                a:new_event();a:append(string.format('{\\an4\\pos(%.1f,%.1f)\\clip(%.1f,%.1f,%.1f,%.1f)\\q2\\fnInter\\fs%d\\bord0\\shad0\\1c&H%s&}%s',tx,row_y+offset,tx,row_y+8,tx+available,row_y+80,size,color or foreground,escape(shorten(value,math.max(1,math.floor(available/(size*.6)))))))
            end
            line(tostring(ep.episode or '')..' · '..(ep.title or ''),19,15,current and accent or nil)
            if current then line(tr('Now playing','En cours de lecture'),38,11,accent)end
            local description=tostring(ep.description or ''):gsub('[\r\n]+',' ')
            local chars={};for c in description:gmatch('[%z\1-\127\194-\244][\128-\191]*')do chars[#chars+1]=c end
            local per_line=math.max(1,math.floor(available/(12*.6)))
            local start=current and 55 or 42
            for n=1,2 do if #chars>(n-1)*per_line then line(table.concat(chars,'',(n-1)*per_line+1,math.min(#chars,n*per_line))..(n==2 and #chars>2*per_line and '…' or ''),start+(n-1)*16,12)end end
            hits[#hits+1]={x=x+24,y=row_y,w=row_w-68,h=88,action=function()mp.commandv('script-message-to','primio','episode',ep.id)end}
            button(a,x+w-88,row_y+22,52,44,'',function()
                ep.watched=not ep.watched
                mp.commandv('script-message-to','primio','watched-state',ep.id)
                mp.set_property_native('user-data/primio/watched',{videoId=ep.id,watched=ep.watched,season=ep.season,episode=ep.episode})
            end,ep.watched)
            label(a,x+w-62,row_y+44,ep.watched and tr('Watched','Vu') or tr('Not seen','Non vu'),11,5,ep.watched and accent or nil)
        end end
        for id in pairs(episode_images)do if not visible_images[id]then mp.commandv('overlay-remove',id)end end
        episode_images=visible_images
        local request=utils.format_json({indices=requests,width=iw,height=ih})
        if #requests>0 and request~=image_request then image_request=request;mp.set_property_native('user-data/primio/episode-images',utils.parse_json(request))end
        end
    end
end
local pip=false
local pip_panscan=0
local function unfinished()
    local pos,duration=mp.get_property_number('time-pos',0),mp.get_property_number('duration',0)
    if not loaded or duration<=0 or pos/duration>=0.99 or mp.get_property_native('eof-reached') then return false end
    for _,s in ipairs(config.skipSegments or {}) do
        if s.kind=='outro' and not cancelled_segments[s.start] and s.start>=0 and s['end']>s.start and s['end']<=duration and pos>=s.start and
            (not s.episodeLength or s.episodeLength==0 or math.abs(duration-s.episodeLength)<math.max(10,duration*.03)) then return false end
    end
    return true
end
local function restore_player()
    pip=false;mp.set_property_number('panscan',pip_panscan);mp.set_property_native('ontop',false);mp.set_property_native('fullscreen',true);last_move=mp.get_time()
end
local function enter_pip()
    if pip or not unfinished() then return false end
    pip=true;panel=nil;hide_logo();mp.set_property_native('fullscreen',false)
    pip_panscan=mp.get_property_number('panscan',0);mp.set_property_number('panscan',0)
    mp.set_property_native('window-minimized',false);mp.set_property_native('ontop',true)
    local aspect=mp.get_property_number('video-out-params/aspect',mp.get_property_number('video-params/aspect',16/9))
    if aspect<=0 then aspect=16/9 end
    mp.set_property('geometry',string.format('480x%d-24-24',math.floor(480/aspect+.5)))
    local video_width=mp.get_property_number('video-out-params/dw',mp.get_property_number('video-params/dw',0))
    if video_width>0 then mp.set_property_number('window-scale',480/video_width)end
    last_move=mp.get_time();return true
end
local function leave_player() if pip or not enter_pip() then mp.commandv('quit') end end
mp.observe_property('focused','bool',function(_,focused)if focused==false then end_scrub(false);enter_pip()end end)
mp.observe_property('window-minimized','bool',function(_,minimized)if minimized then enter_pip()end end)
mp.add_forced_key_binding('MBTN_LEFT_DBL','primio-restore',restore_player)
local function render()
    local rw,rh=mp.get_osd_size();if rw<=0 or rh<=0 then return end
    scale=pip and 1 or rh/720;width=rw/scale;height=pip and rh or 720;hits={}
    local a=assdraw.ass_new()
    local buffering=not loaded or (not scrub and mp.get_property_native('paused-for-cache',false))
    if panel~='episodes' or season_picker or pip then hide_episode_images()end
    if preview_visible and (buffering or panel or pip or scrub or (mp.get_time()-last_move>=3 and not mp.get_property_native('pause'))) then mp.commandv('script-message-to','primio_preview','hide');preview_visible=false end
    mp.set_property_native('user-data/primio/ui',{loading=buffering,panel=panel or '',material=neo and 'neumorphic' or 'glass',nextOffered=next_offer,fullscreen=mp.get_property_native('fullscreen'),pip=pip,scrubbing=scrub~=nil,seekTarget=scrub and scrub.target or nil})
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
        elseif scrub or mp.get_time()-last_move<3 or mp.get_property_native('pause') then
            if not scrub then
                icon_button(a,24,24,48,'back',leave_player)
                icon_button(a,84,24,48,'close',function()mp.commandv('quit')end)
                title(a,width/2,48,config.title or mp.get_property('media-title','Primio'),math.max(96,width-384),26,true)
                if #(config.episodes or {})>0 then button(a,width-168,24,144,48,tr('Episodes','Épisodes'),function()open('episodes')end)end
                icon_button(a,width/2-148,height/2-30,60,'rewind',function()jump(false)end)
                icon_button(a,width/2-36,height/2-36,72,mp.get_property_native('pause') and 'play' or 'pause',function()mp.commandv('cycle','pause')end)
                icon_button(a,width/2+88,height/2-30,60,'forward',function()jump(true)end)
            end
            local pos,duration=mp.get_property_number('time-pos',0),mp.get_property_number('duration',0)
            if scrub then pos=scrub.target end
            video_time(a,28,height-108,time(pos)..' / '..time(duration),1)
            if not scrub then video_time(a,width-28,height-108,'−'..time(duration-pos),3)end
            local y,w=height-100,width-56;local fill=duration>0 and math.min(1,pos/duration)*w or 0
            if neo then
                relief(a,28,y-1,w,9,4,true)
                if fill>1 then rect(a,28,y,fill,7,3,accent,'00')end
                relief(a,19+fill,y-5.5,18,18,9,false)
                rect(a,22+fill,y-2.5,12,12,6,foreground,'00')
            else
                rect(a,28,y,w,7,3,'9EA18F','A0');if fill>1 then rect(a,28,y-2,fill,11,5,accent,'C0',2);rect(a,28,y,fill,7,3,accent,'15')end
                rect(a,15+fill,y-9.5,26,26,13,'EAE8D1','C0')
                rect(a,19+fill,y-5.5,18,18,9,'FFFFFF','00',1)
            end
            hits[#hits+1]={x=22,y=y-12,w=w+12,h=30,action=function(mx)if duration>0 then mp.commandv('seek',math.max(0,math.min(1,(mx-28)/w))*duration,'absolute+exact')end end}
            if preview_visible then
                rect(a,preview_x-4,y-2,8,11,4,'FFFFFF','50')
                local px=math.max(60,math.min(width-60,preview_x))
                glass(a,px-44,y-45,88,30,false);label(a,px,y-30,time(preview_target),17,5)
            end
            if not scrub then
                icon_button(a,28,height-64,48,'source',function()mp.commandv('script-message-to','primio','episode',config.currentVideoId)end)
                icon_button(a,width-136,height-64,48,'speed',function()open('speed')end)
                icon_button(a,width-76,height-64,48,'subtitles',function()open('tracks')end)
            end
        end
    end
    local feedback_age=mp.get_time()-seek_feedback_at
    if seek_feedback~=0 and feedback_age<1.2 and not panel and not pip and not scrub then
        local alpha=config.reduceMotion and '00' or feedback_age<.65 and (math.floor(feedback_age/.16)%2==0 and '00' or 'A0') or string.format('%02X',math.floor(math.min(255,(feedback_age-.65)/.55*255)))
        local x=width*(seek_feedback>0 and .75 or .25)
        a:new_event();a:append(string.format('{\\an5\\pos(%.1f,%.1f)\\fnInter\\fs32\\bord0\\shad1.2\\alpha&H%s&\\1c&H%s&}%s%d s',x,height/2,alpha,foreground,seek_feedback>0 and '+' or '−',math.floor(math.abs(seek_feedback)+.5)))
    end
    if loaded and not buffering and not panel and not pip and not scrub then
        for kind,value in pairs(levels)do if mp.get_time()-value.at<1.2 then render_level(a,kind,value)end end
    end
    local pos,duration=mp.get_property_number('time-pos',0),mp.get_property_number('duration',0)
    local segment,upcoming
    for _,s in ipairs(config.skipSegments or {}) do
        if s.start>=0 and s['end']>s.start and s['end']<=duration and not skipped_segments[s.start] and
            (not s.episodeLength or s.episodeLength==0 or math.abs(duration-s.episodeLength)<math.max(10,duration*.03)) then
            if pos>=s.start and pos<s['end'] then segment=segment or s
            elseif pos<s.start and s.start-pos<=3 and not cancelled_segments[s.start] and (not upcoming or s.start<upcoming.start) then upcoming=s end
        end
    end
    local has_next=config.nextVideoId and config.nextVideoId~=''
    local next_available=has_next and (duration-pos<=30 or (segment and segment.kind=='outro'))
    local fallback=not cancelled_next and has_next and duration>33 and duration-pos>30 and duration-pos<=33 and not segment
    countdown_key=upcoming and (upcoming.kind..':'..upcoming.start) or fallback and 'next' or ''
    countdown_elapsed=upcoming and 3-(upcoming.start-pos) or fallback and 33-(duration-pos) or 3
    local can_show=not buffering and not panel and not pip and not scrub
    local warning=can_show and countdown_key~='' and not segment
    local x,y=width-76,height-180
    if warning then
        glass(a,x,y,48,48,false)
        a:new_event();a:append('{\\an7\\pos(0,0)\\bord0\\shad0\\1c&HF3F2E9&}');a:draw_start()
        local sweep=math.max(1,math.ceil(90*(1-countdown_elapsed/3)))
        for i=1,sweep do
            local from=-math.pi/2+(i-1)/90*2*math.pi;local to=-math.pi/2+i/90*2*math.pi
            a:move_to(x+24+20*math.cos(from),y+24+20*math.sin(from));a:line_to(x+24+22*math.cos(from),y+24+22*math.sin(from))
            a:line_to(x+24+22*math.cos(to),y+24+22*math.sin(to));a:line_to(x+24+20*math.cos(to),y+24+20*math.sin(to))
        end
        a:draw_stop();label(a,x+24,y+24,tostring(math.max(1,math.ceil(3-countdown_elapsed))),18,5)
        local key=countdown_key
        hits[#hits+1]={x=x,y=y,w=48,h=48,action=function()
            if key=='next' then cancelled_next=true else local start=tonumber(key:match(':(.+)$'));if start then cancelled_segments[start]=true end end
            mp.commandv('script-message-to','primio','cancel-skip',key)
        end}
    elseif can_show and next_available then
        button(a,width-248,y,220,48,tr('Next episode','Épisode suivant'),function()next_offer=false;mp.commandv('script-message-to','primio','next')end)
    elseif can_show and segment then
        button(a,width-248,y,220,48,segment.label or (segment.kind=='outro' and tr('Skip credits','Passer le générique') or segment.kind=='recap' and tr('Skip recap','Passer le récap') or tr('Skip intro','Passer l’intro')),function()skipped_segments[segment.start]=true;mp.commandv('seek',segment['end'],'absolute+exact')end)
    end
    mp.set_property_native('user-data/primio/countdown',{key=countdown_key,elapsed=countdown_elapsed,visible=warning,segment=segment and segment.kind or '',position=pos})
    overlay.res_x=width;overlay.res_y=height;overlay.data=a.text;overlay:update()
end
mp.add_forced_key_binding('mouse_move','primio-move',function()
 last_move=mp.get_time()
 local mx,my=mp.get_mouse_pos();local vx,vy=mx/scale,my/scale
 if press and not press.hit and loaded and not panel and not pip then
  local dx,dy=vx-press.x,vy-press.y
  if not scrub and mp.get_time()-press.at>=.35 and math.abs(dx)>12 and math.abs(dx)>math.abs(dy)*1.5 then
   scrub={start=press.position,target=press.position,paused=mp.get_property_native('pause')};mp.set_property_native('pause',true)
  end
  if scrub then
   scrub.target=math.max(0,math.min(math.max(0,mp.get_property_number('duration',0)-.1),math.floor(scrub.start+dx/8+.5)))
   if preview_visible then mp.commandv('script-message-to','primio_preview','hide');preview_visible=false end
   render();return
  end
 end
 if not panel and loaded and vy>=height-116 and vy<=height-84 and vx>=28 and vx<=width-28 then
  local duration=mp.get_property_number('duration',0)
  if duration>0 then
   local target=math.max(0,math.min(1,(vx-28)/(width-56)))*duration
   mp.commandv('script-message-to','primio_preview','preview',target,math.max(0,math.min(width*scale-240,mx-120)),math.max(0,(height-156)*scale-135))
   preview_target=target;preview_x=vx;preview_visible=true
  end
 elseif preview_visible then mp.commandv('script-message-to','primio_preview','hide');preview_visible=false end
end)
mp.add_key_binding('z','primio-fit',function()local fill=mp.get_property_number('panscan',0)==0;mp.set_property_number('panscan',fill and 1 or 0);mp.osd_message(fill and tr('Fill screen','Remplir l’écran') or tr('Fit screen','Ajuster à l’écran'))end)
mp.add_forced_key_binding('MBTN_LEFT','primio-click',function(event)
    local mx,my=mp.get_mouse_pos();mx=mx/scale;my=my/scale
    local function hit_at()
        for _,hit in ipairs(hits)do if mx>=hit.x and mx<=hit.x+hit.w and my>=hit.y and my<=hit.y+hit.h then return hit end end
    end
    if event.event=='down' then
        press={x=mx,y=my,at=mp.get_time(),position=mp.get_property_number('time-pos',0),hit=hit_at()}
    elseif event.event=='up' then
        if scrub then end_scrub(true)
        elseif press then local hit=hit_at();if hit and press.hit and math.abs(mx-press.x)<12 and math.abs(my-press.y)<12 then hit.action(mx,my)end;press=nil end
        last_move=mp.get_time();render()
    elseif event.event=='press' then
        local hit=hit_at();if hit then hit.action(mx,my)end;last_move=mp.get_time();render()
    end
end,{complex=true})
mp.add_forced_key_binding('ESC','primio-close',function()if scrub then end_scrub(false)elseif panel then panel=nil else leave_player()end end)
mp.add_forced_key_binding('WHEEL_UP','primio-wheel-up',function()if panel then scroll=math.max(0,scroll-1)else mp.commandv('add','volume',5)end end)
mp.add_forced_key_binding('WHEEL_DOWN','primio-wheel-down',function()if panel then scroll=scroll+1 else mp.commandv('add','volume',-5)end end)
mp.add_key_binding('a','primio-tracks',function()open('tracks')end)
mp.register_script_message('close',function()panel=nil end)
mp.register_script_message('open',function(name)open(name=='episodes' and 'episodes' or name=='style' and 'style' or name=='speed' and 'speed' or 'tracks')end)
mp.register_script_message('next-offer',function()next_offer=true end)
mp.register_script_message('inferred-watched',function(raw)for _,change in ipairs(utils.parse_json(raw) or {})do for _,ep in ipairs(config.episodes or {})do if ep.id==change.videoId then ep.watched=true end end end end)
mp.register_event('start-file',function()loaded=false end)
mp.register_event('playback-restart',function()loaded=true;last_move=mp.get_time()end)
mp.register_event('shutdown',function()hide_logo();hide_episode_images()end)
local last_volume,last_brightness,last_mute
mp.observe_property('volume','number',function(_,value)
    if value and last_volume~=nil and value~=last_volume and loaded then levels.volume={fraction=mp.get_property_native('mute') and 0 or value/100,at=mp.get_time()}end
    last_volume=value
end)
mp.observe_property('brightness','number',function(_,value)
    if value and last_brightness~=nil and value~=last_brightness and loaded then levels.brightness={fraction=(value+100)/200,at=mp.get_time()}end
    last_brightness=value
end)
mp.observe_property('mute','bool',function(_,value)
    if last_mute~=nil and value~=last_mute and loaded then levels.volume={fraction=value and 0 or mp.get_property_number('volume',0)/100,at=mp.get_time()}end
    last_mute=value
end)
mp.add_periodic_timer(1/24,render)
