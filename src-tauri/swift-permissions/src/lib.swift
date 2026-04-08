import AVFoundation
import Foundation

private let grantedValue = 0
private let deniedValue = 1
private let neverRequestedValue = 2
private let errorValue = -1

private let tccPath = "/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC"

private let tccHandle: UnsafeMutableRawPointer? = {
  dlopen(tccPath, RTLD_NOW)
}()

private typealias TCCPreflightFunc = @convention(c) (CFString, CFDictionary?) -> Int
private typealias TCCRequestCompletion = @convention(block) (Bool) -> Void
private typealias TCCRequestFunc = @convention(c) (CFString, CFDictionary?, TCCRequestCompletion) -> Void

private func mapMicrophoneStatus(_ status: AVAuthorizationStatus) -> Int {
  switch status {
  case .authorized:
    grantedValue
  case .notDetermined:
    neverRequestedValue
  case .denied, .restricted:
    deniedValue
  @unknown default:
    errorValue
  }
}

@_cdecl("_microphone_permission_status")
public func _microphone_permission_status() -> Int {
  mapMicrophoneStatus(AVCaptureDevice.authorizationStatus(for: .audio))
}

@_cdecl("_request_microphone_permission")
public func _request_microphone_permission() -> Bool {
  let status = AVCaptureDevice.authorizationStatus(for: .audio)

  switch status {
  case .authorized:
    return true
  case .denied, .restricted:
    return false
  case .notDetermined:
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false

    AVCaptureDevice.requestAccess(for: .audio) { allowed in
      granted = allowed
      semaphore.signal()
    }

    _ = semaphore.wait(timeout: .now() + .seconds(60))
    return granted
  @unknown default:
    return false
  }
}

@_cdecl("_audio_capture_permission_status")
public func _audio_capture_permission_status() -> Int {
  guard let tccHandle,
    let functionSymbol = dlsym(tccHandle, "TCCAccessPreflight"),
    let preflight = unsafeBitCast(functionSymbol, to: TCCPreflightFunc.self) as TCCPreflightFunc?
  else {
    return errorValue
  }

  return preflight("kTCCServiceAudioCapture" as CFString, nil)
}

@_cdecl("_request_audio_capture_permission")
public func _request_audio_capture_permission() -> Bool {
  guard let tccHandle,
    let functionSymbol = dlsym(tccHandle, "TCCAccessRequest"),
    let request = unsafeBitCast(functionSymbol, to: TCCRequestFunc.self) as TCCRequestFunc?
  else {
    return false
  }

  let semaphore = DispatchSemaphore(value: 0)
  var granted = false

  request("kTCCServiceAudioCapture" as CFString, nil) { allowed in
    granted = allowed
    semaphore.signal()
  }

  _ = semaphore.wait(timeout: .now() + .seconds(60))
  return granted
}
