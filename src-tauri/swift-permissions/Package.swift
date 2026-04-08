// swift-tools-version:5.9

import PackageDescription

let package = Package(
  name: "permissions-swift",
  platforms: [.macOS("14.2")],
  products: [
    .library(
      name: "permissions-swift",
      type: .static,
      targets: ["PermissionsSwift"])
  ],
  targets: [
    .target(
      name: "PermissionsSwift",
      path: "src")
  ]
)
