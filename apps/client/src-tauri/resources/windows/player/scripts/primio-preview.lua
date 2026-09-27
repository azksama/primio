local mp=require 'mp'
local utils=require 'mp.utils'
local config={}
local f=io.open(os.getenv('PRIMIO_PLAYER_CONFIG') or '', 'r')
if f then config=utils.parse_json(f:read('*a')) or {}; f:close() end
local output=config.previewPath or ''
local job,requested,timeout,debounce
local x,y=0,0
local cache,order={},{}
local generation=0
local function hide()
 requested=nil
 if debounce then debounce:kill();debounce=nil end
 mp.commandv('overlay-remove',43)
 mp.set_property_native('user-data/primio/preview',{visible=false})
end
local function show(key)
 if not cache[key] or requested~=key then return end
 mp.commandv('overlay-add',43,x,y,cache[key],0,'bgra',240,135,960)
 mp.set_property_native('user-data/primio/preview',{visible=true,seconds=key,x=x,y=y})
end
local generate
local function schedule()
 if debounce then debounce:kill() end
 debounce=mp.add_timeout(.12,function()debounce=nil;generate()end)
end
generate=function()
 if job or requested==nil then return end
 local key=requested
 if cache[key] then show(key);return end
 local path=mp.get_property('path');if not path then return end
 local destination=output..'.'..key..'.bgra'
 local token=generation
 local args={config.previewExecutable,'--no-config','--load-scripts=no','--audio=no','--sub=no','--hwdec=no','--really-quiet','--network-timeout=12','--start='..key,'--frames=1','--vf=lavfi=[scale=240:135:force_original_aspect_ratio=decrease,pad=240:135:-1:-1,format=bgra]','--of=rawvideo','--ovc=rawvideo','--o='..destination}
 for _,header in ipairs(config.previewHeaders or {})do table.insert(args,'--http-header-fields-append='..header)end
 table.insert(args,'--');table.insert(args,path)
 mp.set_property_native('user-data/primio/preview',{visible=false,loading=true,seconds=key})
 job=mp.command_native_async({name='subprocess',args=args,playback_only=true,capture_stdout=false,capture_stderr=true},function(success,result)
  if token~=generation then os.remove(destination);return end
  job=nil;if timeout then timeout:kill();timeout=nil end
  local info=utils.file_info(destination)
  if success and result.status==0 and info and info.size==129600 then
   cache[key]=destination;order[#order+1]=key
   while #order>24 do local old=table.remove(order,1);os.remove(cache[old]);cache[old]=nil end
   show(key)
  else
   os.remove(destination)
   if requested==key then mp.set_property_native('user-data/primio/preview',{visible=false,unavailable=true,seconds=key})end
  end
  if requested~=nil and requested~=key then schedule() end
 end)
 timeout=mp.add_timeout(20,function()if job then mp.abort_async_command(job)end end)
end
mp.register_script_message('preview',function(seconds,px,py)
 if output=='' or not config.previewExecutable then return end
 x=math.floor(tonumber(px) or 0);y=math.floor(tonumber(py) or 0)
 local duration=mp.get_property_number('duration',0)
 local key=math.floor(math.max(0,math.min(tonumber(seconds) or 0,math.max(0,duration-.2)))/5)*5
 local previous=requested;requested=key
 if cache[key] then show(key);return end
 if previous==key then return end
 mp.commandv('overlay-remove',43);schedule()
end)
mp.register_script_message('hide',hide)
local function clear()
 generation=generation+1;hide()
 if job then mp.abort_async_command(job);job=nil end
 if timeout then timeout:kill();timeout=nil end
 for _,path in pairs(cache)do os.remove(path)end
 cache={};order={}
end
mp.register_event('end-file',clear)
mp.register_event('shutdown',clear)
