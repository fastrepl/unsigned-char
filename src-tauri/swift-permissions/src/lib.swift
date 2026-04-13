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

private func mapCaptureMicrophoneStatus(_ status: AVAuthorizationStatus) -> Int {
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

@available(macOS 14.0, *)
private func mapAudioApplicationPermission(_ permission: AVAudioApplication.recordPermission) -> Int {
  switch permission {
  case .granted:
    grantedValue
  case .undetermined:
    neverRequestedValue
  case .denied:
    deniedValue
  @unknown default:
    errorValue
  }
}

private func captureMicrophonePermissionStatus() -> Int {
  mapCaptureMicrophoneStatus(AVCaptureDevice.authorizationStatus(for: .audio))
}

private func combinedMicrophonePermissionStatus(appStatus: Int, captureStatus: Int) -> Int {
  if appStatus == grantedValue || captureStatus == grantedValue {
    return grantedValue
  }

  if appStatus == errorValue {
    return captureStatus
  }

  if captureStatus == errorValue {
    return appStatus
  }

  if appStatus == deniedValue || captureStatus == deniedValue {
    return deniedValue
  }

  return neverRequestedValue
}

private func currentMicrophonePermissionStatus() -> Int {
  let captureStatus = captureMicrophonePermissionStatus()

  if #available(macOS 14.0, *) {
    let appStatus = mapAudioApplicationPermission(AVAudioApplication.shared.recordPermission)
    return combinedMicrophonePermissionStatus(appStatus: appStatus, captureStatus: captureStatus)
  }

  return captureStatus
}

private func requestCaptureMicrophonePermission() -> Bool {
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

@available(macOS 14.0, *)
private func requestAppMicrophonePermission() -> Bool {
  switch AVAudioApplication.shared.recordPermission {
  case .granted:
    return true
  case .denied:
    return false
  case .undetermined:
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false

    AVAudioApplication.requestRecordPermission { allowed in
      granted = allowed
      semaphore.signal()
    }

    _ = semaphore.wait(timeout: .now() + .seconds(60))
    return granted
  @unknown default:
    return false
  }
}

@_cdecl("_microphone_permission_status")
public func _microphone_permission_status() -> Int {
  currentMicrophonePermissionStatus()
}

@_cdecl("_request_microphone_permission")
public func _request_microphone_permission() -> Bool {
  if currentMicrophonePermissionStatus() == grantedValue {
    return true
  }

  if #available(macOS 14.0, *) {
    let appStatus = mapAudioApplicationPermission(AVAudioApplication.shared.recordPermission)
    if appStatus == neverRequestedValue && requestAppMicrophonePermission() {
      return true
    }

    if currentMicrophonePermissionStatus() == grantedValue {
      return true
    }
  }

  if requestCaptureMicrophonePermission() {
    return true
  }

  return currentMicrophonePermissionStatus() == grantedValue
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
