local mp=require 'mp'
local utils=require 'mp.utils'
local config={}
local f=io.open(os.getenv('PRIMIO_PLAYER_CONFIG') or '', 'r')
if f then config=utils.parse_json(f:read('*a')) or {}; f:close() end
local output=(config.previewPath or '')
local current,job,requested=nil,nil,nil
local x,y=0,0
local timeout
local function hide() mp.commandv('overlay-remove',43);requested=nil;mp.set_property_native('user-data/primio/preview',{visible=false}) end
local function show(key) mp.commandv('overlay-add',43,x,y,output,0,'bgra',240,135,960);mp.set_property_native('user-data/primio/preview',{visible=true,seconds=key,x=x,y=y}) end
local function request(seconds,px,py)
 if output=='' or not config.previewExecutable then return end
 x=tonumber(px) or 0;y=tonumber(py) or 0
 local key=math.floor((tonumber(seconds) or 0)/5)*5
 requested=key
 if current==key then show(key);return end
 mp.commandv('overlay-remove',43)
 if job then return end
 local path=mp.get_property('path')
 if not path then return end
 local args={config.previewExecutable,'--no-config','--load-scripts=no','--audio=no','--sub=no','--hwdec=no','--really-quiet','--network-timeout=8','--start='..key,'--frames=1','--vf=lavfi=[scale=240:135:force_original_aspect_ratio=decrease,pad=240:135:-1:-1,format=bgra]','--of=rawvideo','--ovc=rawvideo','--o='..output}
 for _,header in ipairs(config.previewHeaders or {})do table.insert(args,'--http-header-fields-append='..header)end
 table.insert(args,'--');table.insert(args,path)
 job=mp.command_native_async({name='subprocess',args=args,playback_only=true,capture_stdout=false,capture_stderr=false},function(success,result)
  job=nil;if timeout then timeout:kill();timeout=nil end
  if success and result.status==0 then
   local info=utils.file_info(output)
   if info and info.size==240*135*4 then current=key;if requested==key then show(key)end end
   if requested and requested~=key then request(requested,x,y) end
  end
 end)
 timeout=mp.add_timeout(10,function()if job then mp.abort_async_command(job);job=nil end end)
end
mp.register_script_message('preview',request)
mp.register_script_message('hide',hide)
mp.register_event('end-file',function()hide();if job then mp.abort_async_command(job);job=nil end;current=nil end)
mp.register_event('shutdown',function()hide();os.remove(output)end)
