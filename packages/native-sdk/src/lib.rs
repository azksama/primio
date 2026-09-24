//! Trusted native extensions linked when building Primio.
//! Installed community JSON plugins use the separate capability-scoped TypeScript SDK.
use serde::{Serialize,Deserialize};
use serde_json::Value;
#[derive(Clone,Debug,Serialize,Deserialize)]
pub struct PlaybackRequest {
 pub url:String,
 pub title:String,
 pub headers:std::collections::HashMap<String,String>,
}
pub trait PrimioExtension:Send+Sync {
 fn id(&self)->&'static str;
 /// Transform an addon response before it reaches the client.
 fn resource(&self,_url:&str,response:Value)->Result<Value,String>{Ok(response)}
 /// Transform playback parameters. Primio revalidates the result.
 fn before_play(&self,request:PlaybackRequest)->Result<PlaybackRequest,String>{Ok(request)}
}

