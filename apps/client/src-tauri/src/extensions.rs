use primio_plugin_sdk::PrimioExtension;
use std::sync::{Arc, OnceLock};
/// Register trusted, statically linked community extensions here.
pub fn registry() -> &'static [Arc<dyn PrimioExtension>] {
    static EXTENSIONS: OnceLock<Vec<Arc<dyn PrimioExtension>>> = OnceLock::new();
    EXTENSIONS.get_or_init(Vec::new)
}
