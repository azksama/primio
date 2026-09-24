fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "android" {
        let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
        let abi = match arch.as_str() {
            "aarch64" => "arm64-v8a",
            "x86_64" => "x86_64",
            "arm" => "armeabi-v7a",
            "x86" => "x86",
            _ => panic!("Unsupported ABI"),
        };
        let root = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("native")
            .join(abi);
        println!("cargo:rustc-link-search=native={}", root.display());
        println!("cargo:rustc-link-lib=dylib=mpv");
        println!("cargo:rustc-link-lib=dylib=avcodec");
    }
    tauri_build::build()
}
