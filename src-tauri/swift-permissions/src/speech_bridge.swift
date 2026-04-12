import AudioCommon
import AVFoundation
import Foundation
import OmnilingualASR
import ParakeetASR
import ParakeetStreamingASR
import Qwen3ASR
import SwiftRs

private enum SpeechBridgeError: LocalizedError {
  case message(String)

  var errorDescription: String? {
    switch self {
    case .message(let message):
      return message
    }
  }
}

private enum ProcessingMode: String {
  case realtime
  case batch
}

private enum SpeechModelKind: String {
  case parakeetStreaming
  case parakeetBatch
  case omnilingual
  case qwen3Small
  case qwen3Large

  var label: String {
    switch self {
    case .parakeetStreaming:
      return "Parakeet Streaming"
    case .parakeetBatch:
      return "Parakeet Batch"
    case .omnilingual:
      return "Omnilingual"
    case .qwen3Small:
      return "Qwen3 0.6B"
    case .qwen3Large:
      return "Qwen3 1.7B"
    }
  }

  var repo: String {
    switch self {
    case .parakeetStreaming:
      return "aufklarer/Parakeet-EOU-120M-CoreML-INT8"
    case .parakeetBatch:
      return "aufklarer/Parakeet-TDT-v3-CoreML-INT8"
    case .omnilingual:
      return "aufklarer/Omnilingual-ASR-CTC-300M-CoreML-INT8-10s"
    case .qwen3Small:
      return "aufklarer/Qwen3-ASR-0.6B-MLX-4bit"
    case .qwen3Large:
      return "aufklarer/Qwen3-ASR-1.7B-MLX-8bit"
    }
  }

  var isStreamingCapable: Bool {
    self == .parakeetStreaming
  }

  var requiredRelativePaths: [String] {
    switch self {
    case .parakeetStreaming, .parakeetBatch:
      return [
        "config.json",
        "vocab.json",
        "encoder.mlmodelc",
        "decoder.mlmodelc",
        "joint.mlmodelc",
      ]
    case .omnilingual:
      return [
        "config.json",
        "tokenizer.model",
        "omnilingual-ctc-300m-int8.mlpackage",
      ]
    case .qwen3Small, .qwen3Large:
      return [
        "vocab.json",
        "merges.txt",
        "tokenizer_config.json",
      ]
    }
  }

  func cacheDirectoryURL() throws -> URL {
    try HuggingFaceDownloader.getCacheDirectory(for: repo)
  }

  func cacheDirectoryPath() -> String {
    (try? cacheDirectoryURL().path) ?? ""
  }

  func filesReady() -> Bool {
    guard let directory = try? cacheDirectoryURL() else {
      return false
    }

    let fileManager = FileManager.default
    for relativePath in requiredRelativePaths {
      if !fileManager.fileExists(atPath: directory.appendingPathComponent(relativePath).path) {
        return false
      }
    }

    if self == .qwen3Small || self == .qwen3Large {
      guard let contents = try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
      else {
        return false
      }

      return contents.contains { $0.pathExtension == "safetensors" }
    }

    return true
  }

  func load(progressHandler: ((Double, String) -> Void)?) async throws -> LoadedSpeechModel {
    switch self {
    case .parakeetStreaming:
      return .streaming(
        try await ParakeetStreamingASRModel.fromPretrained(
          modelId: repo,
          progressHandler: progressHandler
        )
      )
    case .parakeetBatch:
      return .parakeetBatch(
        try await ParakeetASRModel.fromPretrained(
          modelId: repo,
          progressHandler: progressHandler
        )
      )
    case .omnilingual:
      return .omnilingual(
        try await OmnilingualASRModel.fromPretrained(
          modelId: repo,
          progressHandler: progressHandler
        )
      )
    case .qwen3Small, .qwen3Large:
      return .qwen3(
        try await Qwen3ASRModel.fromPretrained(
          modelId: repo,
          progressHandler: progressHandler
        )
      )
    }
  }
}

private enum LoadedSpeechModel {
  case streaming(ParakeetStreamingASRModel)
  case parakeetBatch(ParakeetASRModel)
  case omnilingual(OmnilingualASRModel)
  case qwen3(Qwen3ASRModel)

  func asStreamingModel() throws -> ParakeetStreamingASRModel {
    guard case .streaming(let model) = self else {
      throw SpeechBridgeError.message("The selected model does not support realtime transcription.")
    }

    return model
  }

  func transcribe(audio: [Float], sampleRate: Int, language: String?) throws -> String {
    let normalizedLanguage = language?.trimmingCharacters(in: .whitespacesAndNewlines)
    let languageHint = (normalizedLanguage?.isEmpty == false) ? normalizedLanguage : nil

    switch self {
    case .streaming(let model):
      return try model.transcribeAudio(audio, sampleRate: sampleRate)
    case .parakeetBatch(let model):
      return try model.transcribeAudio(audio, sampleRate: sampleRate, language: languageHint)
    case .omnilingual(let model):
      return try model.transcribeAudio(audio, sampleRate: sampleRate)
    case .qwen3(let model):
      return model.transcribe(audio: audio, sampleRate: sampleRate, language: languageHint)
    }
  }
}

private struct ModelDownloadPayload: Codable {
  var status: String
  var currentFile: String?
  var localPath: String
  var error: String?
}

private struct TranscriptionPayload: Codable {
  var running: Bool
  var text: String
  var error: String?
  var audioPath: String
  var mode: String?

  static let empty = TranscriptionPayload(
    running: false,
    text: "",
    error: nil,
    audioPath: "",
    mode: nil
  )
}

private func encodeJSON<T: Encodable>(_ value: T) -> String {
  guard let data = try? JSONEncoder().encode(value),
        let string = String(data: data, encoding: .utf8)
  else {
    return "{}"
  }

  return string
}

private func waitForValue<T>(_ operation: @escaping () async -> T) -> T {
  let semaphore = DispatchSemaphore(value: 0)
  var result: T!

  Task {
    result = await operation()
    semaphore.signal()
  }

  semaphore.wait()
  return result
}

private final class WAVCaptureWriter {
  private let url: URL
  private let sampleRate: Int
  private let queue = DispatchQueue(
    label: "com.johnjeong.unsigned.speech-swift.capture",
    qos: .utility
  )

  private var fileHandle: FileHandle?
  private var sampleCount = 0
  private var closed = false
  private var lastErrorMessage: String?

  init(url: URL, sampleRate: Int = 16000) throws {
    self.url = url
    self.sampleRate = sampleRate

    let fileManager = FileManager.default
    try fileManager.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true,
      attributes: nil
    )

    if fileManager.fileExists(atPath: url.path) {
      do {
        sampleCount = try Self.existingSampleCount(at: url)
      } catch {
        try? fileManager.removeItem(at: url)
        sampleCount = 0
      }
    }

    if !fileManager.fileExists(atPath: url.path) {
      fileManager.createFile(atPath: url.path, contents: Self.headerData(sampleRate: sampleRate, sampleCount: 0))
    }

    let handle = try FileHandle(forWritingTo: url)
    try handle.seekToEnd()
    fileHandle = handle
  }

  func append(_ samples: [Float]) {
    guard !samples.isEmpty else {
      return
    }

    let pcmData = Self.pcmData(from: samples)
    queue.async { [self] in
      guard !closed, let fileHandle else {
        return
      }

      if lastErrorMessage != nil {
        return
      }

      do {
        try fileHandle.seekToEnd()
        try fileHandle.write(contentsOf: pcmData)
        sampleCount += samples.count
      } catch {
        lastErrorMessage = "Failed to write meeting audio: \(error.localizedDescription)"
      }
    }
  }

  func finish() throws -> String {
    try queue.sync { [self] in
      if closed {
        return
      }

      if let lastErrorMessage {
        throw SpeechBridgeError.message(lastErrorMessage)
      }

      closed = true

      guard let fileHandle else {
        throw SpeechBridgeError.message("Meeting audio writer is unavailable.")
      }

      do {
        try fileHandle.seek(toOffset: 0)
        try fileHandle.write(contentsOf: Self.headerData(sampleRate: sampleRate, sampleCount: sampleCount))
        try fileHandle.close()
        self.fileHandle = nil
      } catch {
        self.fileHandle = nil
        throw SpeechBridgeError.message("Failed to finalize meeting audio: \(error.localizedDescription)")
      }
    }

    return url.path
  }

  func cancel(removeFile: Bool) {
    queue.sync { [self] in
      if !closed {
        closed = true
        try? fileHandle?.close()
        fileHandle = nil
      }
    }

    if removeFile {
      try? FileManager.default.removeItem(at: url)
    }
  }

  private static func existingSampleCount(at url: URL) throws -> Int {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }

    let header = try handle.read(upToCount: 44) ?? Data()
    guard header.count >= 44,
          String(data: header[0..<4], encoding: .ascii) == "RIFF",
          String(data: header[8..<12], encoding: .ascii) == "WAVE",
          String(data: header[36..<40], encoding: .ascii) == "data"
    else {
      throw SpeechBridgeError.message("Invalid WAV file at \(url.path)")
    }

    let dataSize = Int(header[40..<44].withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) })
    return dataSize / 2
  }

  private static func headerData(sampleRate: Int, sampleCount: Int) -> Data {
    let numChannels: UInt16 = 1
    let bitsPerSample: UInt16 = 16
    let bytesPerSample = Int(bitsPerSample) / 8
    let dataSize = sampleCount * bytesPerSample
    let fileSize = 36 + dataSize

    var data = Data(capacity: fileSize + 8)
    data.append(contentsOf: "RIFF".utf8)
    appendUInt32(&data, UInt32(fileSize))
    data.append(contentsOf: "WAVE".utf8)
    data.append(contentsOf: "fmt ".utf8)
    appendUInt32(&data, 16)
    appendUInt16(&data, 1)
    appendUInt16(&data, numChannels)
    appendUInt32(&data, UInt32(sampleRate))
    appendUInt32(&data, UInt32(sampleRate * Int(numChannels) * bytesPerSample))
    appendUInt16(&data, numChannels * UInt16(bytesPerSample))
    appendUInt16(&data, bitsPerSample)
    data.append(contentsOf: "data".utf8)
    appendUInt32(&data, UInt32(dataSize))
    return data
  }

  private static func pcmData(from samples: [Float]) -> Data {
    var data = Data(capacity: samples.count * 2)
    for sample in samples {
      let clamped = max(-1.0, min(1.0, sample))
      var int16Value = Int16(clamped * 32767.0).littleEndian
      data.append(Data(bytes: &int16Value, count: 2))
    }
    return data
  }

  private static func appendUInt32(_ data: inout Data, _ value: UInt32) {
    var v = value.littleEndian
    data.append(Data(bytes: &v, count: 4))
  }

  private static func appendUInt16(_ data: inout Data, _ value: UInt16) {
    var v = value.littleEndian
    data.append(Data(bytes: &v, count: 2))
  }
}

private final class LiveTranscriptionSession {
  private let audioIO = AudioIO()
  private let captureWriter: WAVCaptureWriter
  private let recordingPath: String
  private let mode: ProcessingMode
  private let streamingSession: StreamingSession?
  private let stateLock = NSLock()
  private let bufferLock = NSLock()
  private let processingQueue = DispatchQueue(
    label: "com.johnjeong.unsigned.speech-swift.processing",
    qos: .userInitiated
  )

  private var processingTimer: DispatchSourceTimer?
  private var bufferedSamples: [Float] = []
  private var finalSegments: [String] = []
  private var partialText = ""
  private var running = false
  private var errorMessage: String?

  init(
    mode: ProcessingMode,
    recordingURL: URL,
    streamingModel: ParakeetStreamingASRModel? = nil
  ) throws {
    self.mode = mode
    recordingPath = recordingURL.path
    captureWriter = try WAVCaptureWriter(url: recordingURL)
    if let streamingModel {
      streamingSession = try streamingModel.createSession()
    } else {
      streamingSession = nil
    }
  }

  func start() throws {
    try audioIO.startMicrophone(targetSampleRate: 16000) { [weak self] samples in
      self?.append(samples)
    }

    if streamingSession != nil {
      let timer = DispatchSource.makeTimerSource(queue: processingQueue)
      timer.schedule(deadline: .now(), repeating: .milliseconds(250))
      timer.setEventHandler { [weak self] in
        self?.processBufferedSamples()
      }
      timer.resume()
      processingTimer = timer
    }

    stateLock.lock()
    running = true
    errorMessage = nil
    stateLock.unlock()
  }

  func snapshot() -> TranscriptionPayload {
    stateLock.lock()
    defer { stateLock.unlock() }

    return TranscriptionPayload(
      running: running,
      text: transcriptText(),
      error: errorMessage,
      audioPath: recordingPath,
      mode: mode.rawValue
    )
  }

  func stop() throws -> TranscriptionPayload {
    stateLock.lock()
    let wasRunning = running
    running = false
    stateLock.unlock()

    audioIO.stopMicrophone()
    let timer = processingTimer
    processingTimer = nil
    timer?.cancel()

    if wasRunning && streamingSession != nil {
      processingQueue.sync {
        processBufferedSamples()
        finalizeStreamingSession()
      }
    }

    let audioPath = try captureWriter.finish()
    let snapshot = snapshot()
    return TranscriptionPayload(
      running: false,
      text: snapshot.text,
      error: snapshot.error,
      audioPath: audioPath,
      mode: mode.rawValue
    )
  }

  func cancel(removeRecording: Bool) {
    stateLock.lock()
    running = false
    stateLock.unlock()
    audioIO.stopMicrophone()
    let timer = processingTimer
    processingTimer = nil
    timer?.cancel()
    captureWriter.cancel(removeFile: removeRecording)
  }

  private func append(_ samples: [Float]) {
    guard !samples.isEmpty else {
      return
    }

    captureWriter.append(samples)

    guard streamingSession != nil else {
      return
    }

    bufferLock.lock()
    bufferedSamples.append(contentsOf: samples)
    bufferLock.unlock()
  }

  private func takeBufferedSamples() -> [Float] {
    bufferLock.lock()
    defer { bufferLock.unlock() }

    let samples = bufferedSamples
    bufferedSamples.removeAll(keepingCapacity: true)
    return samples
  }

  private func processBufferedSamples() {
    guard let streamingSession else {
      return
    }

    let samples = takeBufferedSamples()
    guard !samples.isEmpty else {
      return
    }

    do {
      apply(try streamingSession.pushAudio(samples))
    } catch {
      fail("speech-swift failed while processing microphone audio: \(error.localizedDescription)")
    }
  }

  private func finalizeStreamingSession() {
    guard let streamingSession else {
      return
    }

    do {
      apply(try streamingSession.finalize())

      stateLock.lock()
      partialText = ""
      stateLock.unlock()
    } catch {
      fail("speech-swift failed while finalizing audio: \(error.localizedDescription)")
    }
  }

  private func apply(_ partials: [ParakeetStreamingASRModel.PartialTranscript]) {
    guard !partials.isEmpty else {
      return
    }

    stateLock.lock()
    defer { stateLock.unlock() }

    for partial in partials {
      let text = partial.text.trimmingCharacters(in: .whitespacesAndNewlines)

      if partial.isFinal {
        if !text.isEmpty {
          finalSegments.append(text)
        }
        partialText = ""
        continue
      }

      partialText = text
    }
  }

  private func fail(_ message: String) {
    stateLock.lock()
    errorMessage = message
    running = false
    stateLock.unlock()

    audioIO.stopMicrophone()

    let timer = processingTimer
    processingTimer = nil
    timer?.cancel()
  }

  private func transcriptText() -> String {
    let finalText = finalSegments.joined(separator: "\n")

    if finalText.isEmpty {
      return partialText
    }

    if partialText.isEmpty {
      return finalText
    }

    return "\(finalText)\n\(partialText)"
  }
}

private actor SpeechBridge {
  static let shared = SpeechBridge()

  private var loadedModels: [SpeechModelKind: LoadedSpeechModel] = [:]
  private var modelTasks: [SpeechModelKind: Task<LoadedSpeechModel, Error>] = [:]
  private var downloadStates: [SpeechModelKind: ModelDownloadPayload] = [:]

  private var activeSession: LiveTranscriptionSession?
  private var activeMode: ProcessingMode?
  private var activeModelKind: SpeechModelKind?
  private var activeLanguage: String?

  func cacheDirectory(modelId: String) -> String {
    guard let kind = SpeechModelKind(rawValue: modelId) else {
      return ""
    }

    refreshReadyState(for: kind)
    return kind.cacheDirectoryPath()
  }

  func modelDownloadStateJSON(modelId: String) -> String {
    guard let kind = SpeechModelKind(rawValue: modelId) else {
      return encodeJSON(
        ModelDownloadPayload(
          status: "error",
          currentFile: nil,
          localPath: "",
          error: "Unsupported speech model."
        )
      )
    }

    refreshReadyState(for: kind)
    return encodeJSON(downloadState(for: kind))
  }

  func startModelDownload(modelId: String) {
    guard let kind = SpeechModelKind(rawValue: modelId) else {
      return
    }

    refreshReadyState(for: kind)
    if kind.filesReady(), modelTasks[kind] == nil {
      var state = downloadState(for: kind)
      state.status = "ready"
      state.currentFile = nil
      state.error = nil
      downloadStates[kind] = state
      return
    }

    if modelTasks[kind] != nil {
      var state = downloadState(for: kind)
      state.status = "downloading"
      downloadStates[kind] = state
      return
    }

    var state = downloadState(for: kind)
    state.status = "downloading"
    state.currentFile = "Preparing \(kind.label)..."
    state.error = nil
    downloadStates[kind] = state

    let task = Task.detached(priority: .utility) {
      try await kind.load { fraction, status in
        Task {
          await SpeechBridge.shared.updateDownloadProgress(
            kind: kind,
            fraction: fraction,
            status: status
          )
        }
      }
    }

    modelTasks[kind] = task

    Task.detached {
      do {
        let model = try await task.value
        await SpeechBridge.shared.finishModelLoad(kind: kind, model: model)
      } catch {
        await SpeechBridge.shared.finishModelLoad(kind: kind, error: error)
      }
    }
  }

  func resetModel(modelId: String) {
    guard let kind = SpeechModelKind(rawValue: modelId) else {
      return
    }

    if activeModelKind == kind {
      activeSession?.cancel(removeRecording: false)
      activeSession = nil
      activeMode = nil
      activeModelKind = nil
      activeLanguage = nil
    }

    loadedModels[kind] = nil
    modelTasks[kind] = nil
    refreshReadyState(for: kind)

    var state = downloadState(for: kind)
    if state.status != "ready" {
      state.status = "idle"
    }
    state.currentFile = nil
    state.error = nil
    downloadStates[kind] = state
  }

  func startTranscriptionJSON(
    mode: String,
    modelId: String,
    recordingPath: String,
    language: String
  ) async -> String {
    activeSession?.cancel(removeRecording: false)
    activeSession = nil
    activeMode = nil
    activeModelKind = nil
    activeLanguage = nil

    do {
      guard let processingMode = ProcessingMode(rawValue: mode) else {
        throw SpeechBridgeError.message("Unsupported transcription mode: \(mode)")
      }
      guard let kind = SpeechModelKind(rawValue: modelId) else {
        throw SpeechBridgeError.message("Unsupported speech model: \(modelId)")
      }

      let recordingURL = URL(fileURLWithPath: recordingPath)
      let session: LiveTranscriptionSession
      switch processingMode {
      case .realtime:
        guard kind.isStreamingCapable else {
          throw SpeechBridgeError.message("\(kind.label) does not support realtime transcription.")
        }
        let model = try await ensureModelLoaded(kind).asStreamingModel()
        session = try LiveTranscriptionSession(
          mode: processingMode,
          recordingURL: recordingURL,
          streamingModel: model
        )
      case .batch:
        session = try LiveTranscriptionSession(
          mode: processingMode,
          recordingURL: recordingURL
        )
      }

      try session.start()
      activeSession = session
      activeMode = processingMode
      activeModelKind = kind
      let trimmedLanguage = language.trimmingCharacters(in: .whitespacesAndNewlines)
      activeLanguage = trimmedLanguage.isEmpty ? nil : trimmedLanguage
      return encodeJSON(session.snapshot())
    } catch {
      return encodeJSON(
        TranscriptionPayload(
          running: false,
          text: "",
          error: error.localizedDescription,
          audioPath: recordingPath,
          mode: mode
        )
      )
    }
  }

  func transcriptionStateJSON() async -> String {
    guard let activeSession else {
      return encodeJSON(TranscriptionPayload.empty)
    }

    let snapshot = activeSession.snapshot()
    guard !snapshot.running else {
      return encodeJSON(snapshot)
    }

    do {
      let finalSnapshot = try activeSession.stop()
      clearActiveSession()
      return encodeJSON(finalSnapshot)
    } catch {
      clearActiveSession()
      return encodeJSON(
        TranscriptionPayload(
          running: false,
          text: snapshot.text,
          error: error.localizedDescription,
          audioPath: snapshot.audioPath,
          mode: snapshot.mode
        )
      )
    }
  }

  func stopTranscriptionJSON() async -> String {
    guard let activeSession else {
      return encodeJSON(TranscriptionPayload.empty)
    }

    let mode = activeMode
    let kind = activeModelKind
    let language = activeLanguage

    do {
      let snapshot = try activeSession.stop()
      clearActiveSession()

      guard mode == .batch, let kind else {
        return encodeJSON(snapshot)
      }

      let text = try await transcribeRecordedAudio(
        atPath: snapshot.audioPath,
        with: kind,
        language: language
      )
      return encodeJSON(
        TranscriptionPayload(
          running: false,
          text: text,
          error: snapshot.error,
          audioPath: snapshot.audioPath,
          mode: mode?.rawValue
        )
      )
    } catch {
      let fallback = activeSession.snapshot()
      clearActiveSession()
      return encodeJSON(
        TranscriptionPayload(
          running: false,
          text: fallback.text,
          error: error.localizedDescription,
          audioPath: fallback.audioPath,
          mode: fallback.mode
        )
      )
    }
  }

  private func clearActiveSession() {
    activeSession = nil
    activeMode = nil
    activeModelKind = nil
    activeLanguage = nil
  }

  private func transcribeRecordedAudio(
    atPath path: String,
    with kind: SpeechModelKind,
    language: String?
  ) async throws -> String {
    let url = URL(fileURLWithPath: path)
    let audio = try AudioFileLoader.load(url: url, targetSampleRate: 16000)
    let model = try await ensureModelLoaded(kind)
    return try model.transcribe(audio: audio, sampleRate: 16000, language: language)
  }

  private func ensureModelLoaded(_ kind: SpeechModelKind) async throws -> LoadedSpeechModel {
    refreshReadyState(for: kind)

    if let model = loadedModels[kind] {
      return model
    }

    if let task = modelTasks[kind] {
      let loaded = try await task.value
      loadedModels[kind] = loaded
      return loaded
    }

    let loaded = try await kind.load(progressHandler: nil)
    loadedModels[kind] = loaded
    refreshReadyState(for: kind)
    return loaded
  }

  private func updateDownloadProgress(kind: SpeechModelKind, fraction: Double, status: String) {
    var state = downloadState(for: kind)
    state.status = "downloading"
    state.localPath = kind.cacheDirectoryPath()
    state.error = nil

    let percent = Int(max(0.0, min(1.0, fraction)) * 100.0)
    let statusText = status.trimmingCharacters(in: .whitespacesAndNewlines)
    if statusText.isEmpty {
      state.currentFile = "Preparing \(kind.label)... (\(percent)%)"
    } else {
      state.currentFile = "\(statusText) (\(percent)%)"
    }
    downloadStates[kind] = state
  }

  private func finishModelLoad(kind: SpeechModelKind, model: LoadedSpeechModel) {
    loadedModels[kind] = model
    modelTasks[kind] = nil

    var state = downloadState(for: kind)
    state.localPath = kind.cacheDirectoryPath()
    state.status = "ready"
    state.currentFile = nil
    state.error = nil
    downloadStates[kind] = state
  }

  private func finishModelLoad(kind: SpeechModelKind, error: Error) {
    modelTasks[kind] = nil

    var state = downloadState(for: kind)
    state.localPath = kind.cacheDirectoryPath()
    state.status = "error"
    state.currentFile = nil
    state.error = error.localizedDescription
    downloadStates[kind] = state
  }

  private func refreshReadyState(for kind: SpeechModelKind) {
    var state = downloadState(for: kind)
    state.localPath = kind.cacheDirectoryPath()

    guard modelTasks[kind] == nil else {
      downloadStates[kind] = state
      return
    }

    if kind.filesReady() {
      state.status = "ready"
      state.error = nil
      state.currentFile = nil
    } else if state.status == "ready" {
      state.status = "idle"
      state.currentFile = nil
      state.error = nil
      loadedModels[kind] = nil
    } else if state.localPath.isEmpty {
      state.status = "idle"
    }

    downloadStates[kind] = state
  }

  private func downloadState(for kind: SpeechModelKind) -> ModelDownloadPayload {
    if let state = downloadStates[kind] {
      return state
    }

    return ModelDownloadPayload(
      status: "idle",
      currentFile: nil,
      localPath: kind.cacheDirectoryPath(),
      error: nil
    )
  }
}

@_cdecl("_speech_model_cache_dir")
public func _speech_model_cache_dir(modelId: SRString) -> SRString {
  SRString(waitForValue {
    await SpeechBridge.shared.cacheDirectory(modelId: modelId.toString())
  })
}

@_cdecl("_speech_model_download_state")
public func _speech_model_download_state(modelId: SRString) -> SRString {
  SRString(waitForValue {
    await SpeechBridge.shared.modelDownloadStateJSON(modelId: modelId.toString())
  })
}

@_cdecl("_speech_model_start_download")
public func _speech_model_start_download(modelId: SRString) -> Bool {
  waitForValue {
    await SpeechBridge.shared.startModelDownload(modelId: modelId.toString())
    return true
  }
}

@_cdecl("_speech_model_reset")
public func _speech_model_reset(modelId: SRString) -> Bool {
  waitForValue {
    await SpeechBridge.shared.resetModel(modelId: modelId.toString())
    return true
  }
}

@_cdecl("_speech_live_transcription_start")
public func _speech_live_transcription_start(
  mode: SRString,
  modelId: SRString,
  recordingPath: SRString,
  language: SRString
) -> SRString {
  SRString(waitForValue {
    await SpeechBridge.shared.startTranscriptionJSON(
      mode: mode.toString(),
      modelId: modelId.toString(),
      recordingPath: recordingPath.toString(),
      language: language.toString()
    )
  })
}

@_cdecl("_speech_live_transcription_state")
public func _speech_live_transcription_state() -> SRString {
  SRString(waitForValue { await SpeechBridge.shared.transcriptionStateJSON() })
}

@_cdecl("_speech_live_transcription_stop")
public func _speech_live_transcription_stop() -> SRString {
  SRString(waitForValue { await SpeechBridge.shared.stopTranscriptionJSON() })
}
