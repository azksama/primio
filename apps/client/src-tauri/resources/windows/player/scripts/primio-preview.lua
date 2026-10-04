local mp = require 'mp'
local utils = require 'mp.utils'
local config = {}
local f = io.open(os.getenv('PRIMIO_PLAYER_CONFIG') or '', 'r')
if f then config = utils.parse_json(f:read('*a')) or {}; f:close() end
local base_output = config.previewPath or ''
local output = base_output
local job, requested, timeout, debounce
local x, y, generation = 0, 0, 0
local cache, order, images, failures = {}, {}, {}, {}
local cursor, bytes, count, ready_at = 0, 0, 0, 0
local active = false
local empty_batches = 0
local disk_budget = 512 * 1024 * 1024
local batch_size = 30
local function image_path(key) return output .. '.frame-' .. string.format('%08d', key) .. '.jpg' end
local function status()
  mp.set_property_native('user-data/primio/preview-cache', {
    interval=1, frames=count, total=math.ceil(mp.get_property_number('duration',0)), bytes=bytes,
    running=job~=nil, suspended=mp.get_property_native('paused-for-cache',false), limited=bytes>=disk_budget,
  })
end
local function hide()
  requested = nil
  if debounce then debounce:kill(); debounce=nil end
  mp.commandv('overlay-remove',43)
  mp.set_property_native('user-data/primio/preview',{visible=false})
end
local function show(key)
  if not cache[key] or requested~=key then return end
  mp.commandv('overlay-add',43,x,y,cache[key],0,'bgra',240,135,960)
  mp.set_property_native('user-data/primio/preview',{visible=true,seconds=key,x=x,y=y})
end
local function base_args()
  return {config.previewExecutable,'--no-config','--load-scripts=no','--audio=no','--sub=no',
    '--hwdec=no','--vd-lavc-threads=1','--ovcopts=threads=1','--priority=idle',
    '--demuxer-max-bytes=8MiB','--demuxer-max-back-bytes=0','--cache=no',
    '--hr-seek=yes','--really-quiet','--network-timeout=8'}
end
local function source_args(args, path, remote)
  if remote then for _,header in ipairs(config.previewHeaders or {}) do
    table.insert(args,'--http-header-fields-append='..header)
  end end
  table.insert(args,'--'); table.insert(args,path)
  return args
end
local function collect(first,last)
  for key=first,last do
    local info=utils.file_info(image_path(key))
    local valid=false
    if info and info.size>2 then
      local file=io.open(image_path(key),'rb')
      if file then file:seek('end',-2); valid=file:read(2)==string.char(255,217); file:close() end
    end
    if not images[key] and valid then
      images[key]=true; bytes=bytes+info.size; count=count+1
    elseif info and not valid then os.remove(image_path(key))
    end
  end
end
local function launch(args,kind,key,last,callback)
  local token=generation
  local prefix=output
  local current={kind=kind,key=key,last=last}
  job=current
  current.id=mp.command_native_async({name='subprocess',args=args,playback_only=true,capture_stdout=false,capture_stderr=false},function(success,result)
    if token~=generation then
      if kind=='background' then for k=key,last do os.remove(prefix..'.frame-'..string.format('%08d',k)..'.jpg') end
      else os.remove(prefix..'.'..key..'.bgra') end
      return
    end
    job=nil
    if timeout then timeout:kill(); timeout=nil end
    callback(success and result.status==0,current.cancelled)
    status()
  end)
  timeout=mp.add_timeout(kind=='background' and 45 or 12,function()
    if job==current then mp.abort_async_command(current.id) end
  end)
  status()
end
local function cancel_background()
  if job and job.kind=='background' and not job.cancelled then
    job.cancelled=true; mp.abort_async_command(job.id)
  end
end
local function pump()
  if not active or output=='' or not config.previewExecutable then return end
  if mp.get_property_native('paused-for-cache',false) then cancel_background(); status(); return end
  if job then
    if requested~=nil and not cache[requested] then cancel_background() end
    return
  end
  local path=mp.get_property('path')
  if not path then return end
  if requested~=nil and not cache[requested] and (failures[requested] or 0)<mp.get_time() then
    local key=requested
    local destination=output..'.'..key..'.bgra'
    local args=base_args()
    table.insert(args,'--start='..(images[key] and 0 or key))
    table.insert(args,'--frames=1')
    -- Scale YUV to an even height before padding in BGRA. Odd YUV padding can fail.
    table.insert(args,'--vf=lavfi=[scale=240:134:force_original_aspect_ratio=decrease:force_divisible_by=2,format=bgra,pad=240:135:-1:-1,setsar=1]')
    table.insert(args,'--of=rawvideo'); table.insert(args,'--ovc=rawvideo'); table.insert(args,'--o='..destination)
    mp.set_property_native('user-data/primio/preview',{visible=false,loading=true,seconds=key})
    launch(source_args(args,images[key] and image_path(key) or path,not images[key]),'foreground',key,key,function(success)
      local info=utils.file_info(destination)
      if success and info and info.size==129600 then
        cache[key]=destination; order[#order+1]=key
        while #order>24 do local old=table.remove(order,1); os.remove(cache[old]); cache[old]=nil end
        show(key)
      else
        os.remove(destination); failures[key]=mp.get_time()+10
        if requested==key then mp.set_property_native('user-data/primio/preview',{visible=false,unavailable=true,seconds=key}) end
      end
    end)
    return
  end
  if mp.get_time()<ready_at or bytes>=disk_budget then return end
  local buffered=mp.get_property_number('demuxer-cache-duration',0)
  local stream=mp.get_property('stream-open-filename',path)
  local remote=path:match('^https?://') or stream:match('^https?://')
  local remaining=mp.get_property_number('duration',0)-mp.get_property_number('time-pos',0)
  if remote and buffered>0 and buffered<math.min(12,math.max(0,remaining-.5)) and not mp.get_property_native('pause') then return end
  local total=math.ceil(mp.get_property_number('duration',0))
  if total<=0 or total==math.huge then return end
  while cursor<total and images[cursor] do cursor=cursor+1 end
  if cursor>=total then status(); return end
  local first,last=cursor,math.min(total-1,cursor+batch_size-1)
  local args=base_args()
  table.insert(args,'--start='..first); table.insert(args,'--length='..(last-first+1))
  table.insert(args,'--vf=lavfi=[fps=1:round=up:eof_action=pass,scale=240:136:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=240:136:-1:-1,setsar=1,format=yuvj420p]')
  table.insert(args,'--of=image2'); table.insert(args,'--ofopts=start_number='..first)
  table.insert(args,'--ovc=mjpeg'); table.insert(args,'--ovcopts-add=strict=-2,qmin=5,qmax=8')
  table.insert(args,'--o='..output..'.frame-%08d.jpg')
  launch(source_args(args,path,true),'background',first,last,function(success,cancelled)
    local before=count
    collect(first,last)
    -- Container/audio duration may outlast the video track: retain its last real frame.
    if success and last==total-1 then
      for key=math.max(first,last-1),last do
        if not images[key] and images[key-1] then
          local previous=io.open(image_path(key-1),'rb')
          if previous then
            local data=previous:read('*a'); previous:close()
            local file=io.open(image_path(key),'wb')
            if file then file:write(data); file:close() end
          end
        end
      end
      collect(first,last)
    end
    ready_at=mp.get_time()+(success and .5 or cancelled and 1 or 10)
    if not success and not cancelled then cursor=last+1 end
    if count==before and not cancelled then
      empty_batches=empty_batches+1; ready_at=mp.get_time()+10
      if empty_batches>=3 then cursor=last+1; empty_batches=0 end
    else empty_batches=0 end
  end)
end
mp.register_script_message('preview',function(seconds,px,py)
  local duration=mp.get_property_number('duration',0)
  if duration<=0 then return end
  x=math.floor(tonumber(px) or 0); y=math.floor(tonumber(py) or 0)
  local key=math.floor(math.max(0,math.min(tonumber(seconds) or 0,math.max(0,duration-.001))))
  local previous=requested; requested=key
  if cache[key] then show(key); return end
  if previous==key then return end
  mp.commandv('overlay-remove',43)
  if debounce then debounce:kill() end
  debounce=mp.add_timeout(.06,function() debounce=nil; pump() end)
end)
mp.register_script_message('hide',hide)
local function clear()
  active=false; generation=generation+1; hide()
  if job then mp.abort_async_command(job.id); job=nil end
  if timeout then timeout:kill(); timeout=nil end
  for _,path in pairs(cache) do os.remove(path) end
  for key in pairs(images) do os.remove(image_path(key)) end
  cache={}; order={}; images={}; failures={}; cursor=0; bytes=0; count=0
  empty_batches=0; output=base_output=='' and '' or base_output..'.g'..generation
  status()
end
mp.register_event('file-loaded',function() active=true; ready_at=mp.get_time()+2 end)
mp.observe_property('paused-for-cache','bool',function(_,buffering) if buffering then cancel_background() end end)
mp.add_periodic_timer(.2,pump)
mp.register_event('end-file',clear)
mp.register_event('shutdown',clear)
