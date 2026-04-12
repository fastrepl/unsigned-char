fn main() {
    #[cfg(target_os = "macos")]
    {
        swift_rs::SwiftLinker::new("15.0")
            .with_package("permissions-swift", "./swift-permissions/")
            .link();

        println!("cargo:rustc-link-lib=c++");
    }

    println!("cargo:rerun-if-changed=resources/models");
    println!("cargo:rerun-if-changed=swift-permissions/src");
    println!("cargo:rerun-if-changed=swift-permissions/Package.swift");

    tauri_build::build()
}
