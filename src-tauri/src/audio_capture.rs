use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};

use tracing::error;

const TARGET_SAMPLE_RATE: u32 = 16_000;
const OUTPUT_CHUNK_SIZE: usize = 2_048;
const JOINER_MAX_LAG: usize = 4;
const JOINER_MAX_QUEUE_SIZE: usize = 30;
const SESSION_POLL_INTERVAL: Duration = Duration::from_millis(200);
const SYSTEM_AUDIO_DEVICE_NAME: &str = "unsigned char meeting system audio";

pub struct LiveCaptureSession {
    running: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    command_tx: mpsc::Sender<WorkerMessage>,
    join: Option<thread::JoinHandle<()>>,
}

impl LiveCaptureSession {
    pub fn start<F>(on_chunk: F) -> Result<Self, String>
    where
        F: FnMut(Vec<f32>, Vec<f32>, Vec<f32>) -> Result<(), String> + Send + 'static,
    {
        let running = Arc::new(AtomicBool::new(false));
        let error = Arc::new(Mutex::new(None));
        let (command_tx, command_rx) = mpsc::channel();
        let (startup_tx, startup_rx) = mpsc::channel();

        let join = thread::spawn({
            let running = Arc::clone(&running);
            let error = Arc::clone(&error);
            let command_tx = command_tx.clone();

            move || run_capture_loop(command_tx, command_rx, startup_tx, running, error, on_chunk)
        });

        match startup_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                running,
                error,
                command_tx,
                join: Some(join),
            }),
            Ok(Err(message)) => {
                let _ = join.join();
                Err(message)
            }
            Err(_) => {
                let _ = join.join();
                Err("Failed to start the meeting capture session.".to_string())
            }
        }
    }

    pub fn request_stop(&self) -> Result<(), String> {
        if self.command_tx.send(WorkerMessage::Stop).is_err() && self.is_running() {
            return Err("Failed to stop the meeting capture session.".to_string());
        }

        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn take_error(&self) -> Option<String> {
        self.error.lock().ok().and_then(|mut value| value.take())
    }

    pub fn finish(mut self) -> Result<(), String> {
        if let Some(join) = self.join.take() {
            join.join()
                .map_err(|_| "The meeting capture session crashed.".to_string())?;
        }

        Ok(())
    }
}

#[derive(Clone, Copy)]
enum AudioSource {
    Mic,
    Speaker,
}

struct AudioChunk {
    source: AudioSource,
    sample_rate: u32,
    samples: Vec<f32>,
}

enum WorkerMessage {
    Audio(AudioChunk),
    Stop,
}

fn run_capture_loop<F>(
    command_tx: mpsc::Sender<WorkerMessage>,
    command_rx: mpsc::Receiver<WorkerMessage>,
    startup_tx: mpsc::Sender<Result<(), String>>,
    running: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    mut on_chunk: F,
) where
    F: FnMut(Vec<f32>, Vec<f32>, Vec<f32>) -> Result<(), String>,
{
    #[cfg(target_os = "macos")]
    {
        let speaker_capture = match SpeakerCapture::start(command_tx.clone()) {
            Ok(capture) => capture,
            Err(message) => {
                let _ = startup_tx.send(Err(message));
                return;
            }
        };

        let mic_stream = match start_mic_capture(command_tx.clone()) {
            Ok(stream) => stream,
            Err(message) => {
                drop(speaker_capture);
                let _ = startup_tx.send(Err(message));
                return;
            }
        };

        running.store(true, Ordering::SeqCst);
        let _ = startup_tx.send(Ok(()));

        let mut joiner = ChunkJoiner::new();
        let mut mic_resampler = LinearResampler::new(TARGET_SAMPLE_RATE);
        let mut speaker_resampler = LinearResampler::new(TARGET_SAMPLE_RATE);
        let mut mic_chunks = ChunkAccumulator::new(OUTPUT_CHUNK_SIZE);
        let mut speaker_chunks = ChunkAccumulator::new(OUTPUT_CHUNK_SIZE);

        loop {
            match command_rx.recv_timeout(SESSION_POLL_INTERVAL) {
                Ok(WorkerMessage::Audio(chunk)) => {
                    let delivery = process_audio_chunk(
                        chunk,
                        &mut joiner,
                        &mut mic_resampler,
                        &mut speaker_resampler,
                        &mut mic_chunks,
                        &mut speaker_chunks,
                        &mut on_chunk,
                    );

                    if let Err(message) = delivery {
                        set_error(&error, message);
                        break;
                    }
                }
                Ok(WorkerMessage::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
        }

        let remaining = finish_joined_audio(&mut joiner, &mut mic_chunks, &mut speaker_chunks);

        for (mic, speaker) in remaining {
            if let Err(message) = on_chunk(mix_audio(&mic, &speaker), mic, speaker) {
                set_error(&error, message);
                break;
            }
        }

        drop(mic_stream);
        drop(speaker_capture);
        running.store(false, Ordering::SeqCst);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = command_tx;
        let _ = command_rx;
        let _ = running;
        let _ = error;
        let _ = on_chunk;
        let _ = startup_tx.send(Err(
            "Meeting capture is only implemented for macOS in this build.".to_string(),
        ));
    }
}

fn process_audio_chunk<F>(
    chunk: AudioChunk,
    joiner: &mut ChunkJoiner,
    mic_resampler: &mut LinearResampler,
    speaker_resampler: &mut LinearResampler,
    mic_chunks: &mut ChunkAccumulator,
    speaker_chunks: &mut ChunkAccumulator,
    on_chunk: &mut F,
) -> Result<(), String>
where
    F: FnMut(Vec<f32>, Vec<f32>, Vec<f32>) -> Result<(), String>,
{
    let resampled = match chunk.source {
        AudioSource::Mic => mic_resampler.process(&chunk.samples, chunk.sample_rate),
        AudioSource::Speaker => speaker_resampler.process(&chunk.samples, chunk.sample_rate),
    };

    if resampled.is_empty() {
        return Ok(());
    }

    let ready_chunks = match chunk.source {
        AudioSource::Mic => mic_chunks.push(resampled),
        AudioSource::Speaker => speaker_chunks.push(resampled),
    };

    for ready in ready_chunks {
        match chunk.source {
            AudioSource::Mic => joiner.push_mic(ready),
            AudioSource::Speaker => joiner.push_speaker(ready),
        }
    }

    while let Some((mic, speaker)) = joiner.pop_pair() {
        on_chunk(mix_audio(&mic, &speaker), mic, speaker)?;
    }

    Ok(())
}

fn finish_joined_audio(
    joiner: &mut ChunkJoiner,
    mic_chunks: &mut ChunkAccumulator,
    speaker_chunks: &mut ChunkAccumulator,
) -> Vec<(Vec<f32>, Vec<f32>)> {
    if let Some(chunk) = mic_chunks.finish() {
        joiner.push_mic(chunk);
    }
    if let Some(chunk) = speaker_chunks.finish() {
        joiner.push_speaker(chunk);
    }

    joiner.finish()
}

fn mix_audio(mic: &[f32], speaker: &[f32]) -> Vec<f32> {
    let max_len = mic.len().max(speaker.len());
    let mut mixed = Vec::with_capacity(max_len);

    for index in 0..max_len {
        let mic_sample = mic.get(index).copied().unwrap_or(0.0);
        let speaker_sample = speaker.get(index).copied().unwrap_or(0.0);
        mixed.push(((mic_sample + speaker_sample) * 0.5).clamp(-1.0, 1.0));
    }

    mixed
}

fn set_error(error: &Arc<Mutex<Option<String>>>, message: impl Into<String>) {
    let message = message.into();
    error!(%message, "meeting_capture_failed");
    if let Ok(mut slot) = error.lock() {
        *slot = Some(message);
    }
}

struct ChunkAccumulator {
    chunk_size: usize,
    buffered: Vec<f32>,
}

impl ChunkAccumulator {
    fn new(chunk_size: usize) -> Self {
        Self {
            chunk_size,
            buffered: Vec::new(),
        }
    }

    fn push(&mut self, samples: Vec<f32>) -> Vec<Vec<f32>> {
        if samples.is_empty() {
            return Vec::new();
        }

        self.buffered.extend(samples);

        let mut ready = Vec::new();
        while self.buffered.len() >= self.chunk_size {
            let chunk = self.buffered.drain(..self.chunk_size).collect();
            ready.push(chunk);
        }

        ready
    }

    fn finish(&mut self) -> Option<Vec<f32>> {
        if self.buffered.is_empty() {
            return None;
        }

        self.buffered.resize(self.chunk_size, 0.0);
        Some(std::mem::take(&mut self.buffered))
    }
}

struct ChunkJoiner {
    mic: VecDeque<Vec<f32>>,
    speaker: VecDeque<Vec<f32>>,
}

impl ChunkJoiner {
    fn new() -> Self {
        Self {
            mic: VecDeque::new(),
            speaker: VecDeque::new(),
        }
    }

    fn push_mic(&mut self, samples: Vec<f32>) {
        self.mic.push_back(samples);
        if self.mic.len() > JOINER_MAX_QUEUE_SIZE {
            self.mic.pop_front();
        }
    }

    fn push_speaker(&mut self, samples: Vec<f32>) {
        self.speaker.push_back(samples);
        if self.speaker.len() > JOINER_MAX_QUEUE_SIZE {
            self.speaker.pop_front();
        }
    }

    fn pop_pair(&mut self) -> Option<(Vec<f32>, Vec<f32>)> {
        if self.mic.front().is_some() && self.speaker.front().is_some() {
            return Some((self.mic.pop_front()?, self.speaker.pop_front()?));
        }

        if self.mic.front().is_some() && self.speaker.is_empty() && self.mic.len() > JOINER_MAX_LAG
        {
            let mic = self.mic.pop_front()?;
            return Some((mic.clone(), vec![0.0; mic.len()]));
        }

        if self.speaker.front().is_some()
            && self.mic.is_empty()
            && self.speaker.len() > JOINER_MAX_LAG
        {
            let speaker = self.speaker.pop_front()?;
            return Some((vec![0.0; speaker.len()], speaker));
        }

        None
    }

    fn finish(&mut self) -> Vec<(Vec<f32>, Vec<f32>)> {
        let mut pairs = Vec::new();

        while let Some((mic, speaker)) = self.pop_pair() {
            pairs.push((mic, speaker));
        }

        while let Some(mic) = self.mic.pop_front() {
            pairs.push((mic.clone(), vec![0.0; mic.len()]));
        }

        while let Some(speaker) = self.speaker.pop_front() {
            pairs.push((vec![0.0; speaker.len()], speaker));
        }

        pairs
    }
}

struct LinearResampler {
    target_sample_rate: u32,
    source_sample_rate: Option<u32>,
    position: f64,
    buffer: Vec<f32>,
}

impl LinearResampler {
    fn new(target_sample_rate: u32) -> Self {
        Self {
            target_sample_rate,
            source_sample_rate: None,
            position: 0.0,
            buffer: Vec::new(),
        }
    }

    fn process(&mut self, samples: &[f32], source_sample_rate: u32) -> Vec<f32> {
        if samples.is_empty() {
            return Vec::new();
        }

        if source_sample_rate == self.target_sample_rate {
            return samples.to_vec();
        }

        if self.source_sample_rate != Some(source_sample_rate) {
            self.source_sample_rate = Some(source_sample_rate);
            self.position = 0.0;
            self.buffer.clear();
        }

        self.buffer.extend_from_slice(samples);

        let ratio = source_sample_rate as f64 / self.target_sample_rate as f64;
        let mut output = Vec::new();

        while self.position + 1.0 < self.buffer.len() as f64 {
            let index = self.position.floor() as usize;
            let fraction = (self.position - index as f64) as f32;
            let current = self.buffer[index];
            let next = self.buffer[index + 1];
            output.push(current + ((next - current) * fraction));
            self.position += ratio;
        }

        let consumed = self
            .position
            .floor()
            .min(self.buffer.len().saturating_sub(1) as f64) as usize;
        if consumed > 0 {
            self.buffer.drain(..consumed);
            self.position -= consumed as f64;
        }

        output
    }
}

#[cfg(test)]
mod tests {
    use super::LinearResampler;

    #[test]
    fn linear_resampler_does_not_drain_past_buffer_when_downsampling() {
        let mut resampler = LinearResampler::new(16_000);
        let samples = vec![0.0_f32; 512];

        let first = resampler.process(&samples, 48_000);
        let second = resampler.process(&samples, 48_000);

        assert!(!first.is_empty());
        assert!(!second.is_empty());
    }
}

fn start_mic_capture(sender: mpsc::Sender<WorkerMessage>) -> Result<cpal::Stream, String> {
    use cpal::{
        traits::{DeviceTrait, HostTrait, StreamTrait},
        Device, SampleFormat, SizedSample, Stream, StreamConfig, SupportedStreamConfig,
    };
    use dasp::sample::ToSample;

    fn build_stream<S>(
        device: &Device,
        config: &StreamConfig,
        sample_rate: u32,
        channels: usize,
        sender: mpsc::Sender<WorkerMessage>,
    ) -> Result<Stream, cpal::BuildStreamError>
    where
        S: ToSample<f32> + SizedSample,
    {
        device.build_input_stream(
            config,
            move |data: &[S], _| {
                let samples = downmix_interleaved(data, channels);
                if samples.is_empty() {
                    return;
                }

                let _ = sender.send(WorkerMessage::Audio(AudioChunk {
                    source: AudioSource::Mic,
                    sample_rate,
                    samples,
                }));
            },
            move |stream_error| {
                error!(%stream_error, "microphone_capture_failed");
            },
            None,
        )
    }

    let host = cpal::default_host();
    let device_name = |device: &Device| device.name().unwrap_or_default();
    let is_system_audio_device =
        |device: &Device| device_name(device).contains(SYSTEM_AUDIO_DEVICE_NAME);

    let default_input = host
        .default_input_device()
        .filter(|device| !is_system_audio_device(device));
    let input_devices: Vec<Device> = host
        .input_devices()
        .map(|devices| {
            devices
                .filter(|device| !is_system_audio_device(device))
                .collect()
        })
        .unwrap_or_default();

    let device = default_input
        .or_else(|| input_devices.into_iter().next())
        .ok_or_else(|| "No microphone input device is available.".to_string())?;
    let supported_config: SupportedStreamConfig = device
        .default_input_config()
        .map_err(|error| format!("Failed to read microphone config: {error}"))?;
    let sample_format = supported_config.sample_format();
    let channels = supported_config.channels() as usize;
    let stream_config: StreamConfig = supported_config.into();

    let stream = match sample_format {
        SampleFormat::F32 => build_stream::<f32>(
            &device,
            &stream_config,
            stream_config.sample_rate.0,
            channels,
            sender,
        ),
        SampleFormat::I16 => build_stream::<i16>(
            &device,
            &stream_config,
            stream_config.sample_rate.0,
            channels,
            sender,
        ),
        SampleFormat::U16 => build_stream::<u16>(
            &device,
            &stream_config,
            stream_config.sample_rate.0,
            channels,
            sender,
        ),
        other => return Err(format!("Unsupported microphone sample format: {other:?}")),
    }
    .map_err(|error| format!("Failed to build microphone stream: {error}"))?;

    stream
        .play()
        .map_err(|error| format!("Failed to start microphone capture: {error}"))?;

    Ok(stream)
}

fn downmix_interleaved<S>(data: &[S], channels: usize) -> Vec<f32>
where
    S: dasp::sample::ToSample<f32> + Copy,
{
    if channels <= 1 {
        return data.iter().map(|sample| sample.to_sample_()).collect();
    }

    let mut mono = Vec::with_capacity(data.len() / channels.max(1));
    for frame in data.chunks(channels) {
        let sum: f32 = frame.iter().map(|sample| sample.to_sample_()).sum();
        mono.push(sum / frame.len() as f32);
    }

    mono
}

#[cfg(target_os = "macos")]
struct SpeakerCapture {
    _device: cidre::core_audio::hardware::StartedDevice<cidre::core_audio::AggregateDevice>,
    _tap: cidre::core_audio::TapGuard,
    _ctx: Box<SpeakerCaptureContext>,
}

#[cfg(target_os = "macos")]
struct SpeakerCaptureContext {
    sender: mpsc::Sender<WorkerMessage>,
    common_format: cidre::av::audio::CommonFormat,
    sample_rate: u32,
}

#[cfg(target_os = "macos")]
impl SpeakerCapture {
    fn start(sender: mpsc::Sender<WorkerMessage>) -> Result<Self, String> {
        use cidre::{av, cat, cf, core_audio as ca, ns, os};

        extern "C" fn proc(
            _device: ca::Device,
            _now: &cat::AudioTimeStamp,
            input_data: &cat::AudioBufList<1>,
            _input_time: &cat::AudioTimeStamp,
            _output_data: &mut cat::AudioBufList<1>,
            _output_time: &cat::AudioTimeStamp,
            ctx: Option<&mut SpeakerCaptureContext>,
        ) -> os::Status {
            let Some(ctx) = ctx else {
                return os::Status::NO_ERR;
            };

            let first_buffer = &input_data.buffers[0];
            if first_buffer.data_bytes_size == 0 || first_buffer.data.is_null() {
                return os::Status::NO_ERR;
            }

            let samples = match ctx.common_format {
                av::audio::CommonFormat::PcmF32 => {
                    read_samples::<f32>(first_buffer).map(|samples| samples.to_vec())
                }
                av::audio::CommonFormat::PcmF64 => read_samples::<f64>(first_buffer)
                    .map(|samples| samples.iter().map(|sample| *sample as f32).collect()),
                av::audio::CommonFormat::PcmI32 => {
                    read_samples::<i32>(first_buffer).map(|samples| {
                        samples
                            .iter()
                            .map(|sample| *sample as f32 / i32::MAX as f32)
                            .collect()
                    })
                }
                av::audio::CommonFormat::PcmI16 => {
                    read_samples::<i16>(first_buffer).map(|samples| {
                        samples
                            .iter()
                            .map(|sample| *sample as f32 / 32768.0)
                            .collect()
                    })
                }
                _ => None,
            };

            if let Some(samples) = samples {
                let _ = ctx.sender.send(WorkerMessage::Audio(AudioChunk {
                    source: AudioSource::Speaker,
                    sample_rate: ctx.sample_rate,
                    samples,
                }));
            }

            os::Status::NO_ERR
        }

        let tap_desc = ca::TapDesc::with_mono_global_tap_excluding_processes(&ns::Array::new());
        let tap = tap_desc
            .create_process_tap()
            .map_err(|error| format!("Failed to create system audio tap: {error}"))?;

        let asbd = tap
            .asbd()
            .map_err(|error| format!("Failed to read system audio format: {error}"))?;
        let format = av::AudioFormat::with_asbd(&asbd)
            .ok_or_else(|| "Failed to create the system audio format.".to_string())?;
        let common_format = format.common_format();

        let sub_tap = cf::DictionaryOf::with_keys_values(
            &[ca::sub_device_keys::uid()],
            &[tap
                .uid()
                .map_err(|error| format!("Failed to resolve the system audio tap UID: {error}"))?
                .as_type_ref()],
        );

        let aggregate_desc = cf::DictionaryOf::with_keys_values(
            &[
                ca::aggregate_device_keys::is_private(),
                ca::aggregate_device_keys::tap_auto_start(),
                ca::aggregate_device_keys::name(),
                ca::aggregate_device_keys::uid(),
                ca::aggregate_device_keys::tap_list(),
            ],
            &[
                cf::Boolean::value_true().as_type_ref(),
                cf::Boolean::value_false(),
                cf::String::from_str(SYSTEM_AUDIO_DEVICE_NAME).as_ref(),
                &cf::Uuid::new().to_cf_string(),
                &cf::ArrayOf::from_slice(&[sub_tap.as_ref()]),
            ],
        );

        let aggregate_device = ca::AggregateDevice::with_desc(&aggregate_desc)
            .map_err(|error| format!("Failed to create the system audio device: {error}"))?;

        let mut ctx = Box::new(SpeakerCaptureContext {
            sender,
            common_format,
            sample_rate: asbd.sample_rate as u32,
        });

        let proc_id = aggregate_device
            .create_io_proc_id(proc, Some(&mut *ctx))
            .map_err(|error| format!("Failed to create the system audio callback: {error}"))?;
        let started_device = ca::device_start(aggregate_device, Some(proc_id))
            .map_err(|error| format!("Failed to start system audio capture: {error}"))?;

        Ok(Self {
            _device: started_device,
            _tap: tap,
            _ctx: ctx,
        })
    }
}

#[cfg(target_os = "macos")]
fn read_samples<T: Copy>(buffer: &cidre::cat::AudioBuf) -> Option<&[T]> {
    let byte_count = buffer.data_bytes_size as usize;
    if byte_count == 0 || buffer.data.is_null() {
        return None;
    }

    let data = buffer.data as *const T;
    if !(data as usize).is_multiple_of(std::mem::align_of::<T>()) {
        return None;
    }

    let sample_count = byte_count / std::mem::size_of::<T>();
    if sample_count == 0 {
        return None;
    }

    Some(unsafe { std::slice::from_raw_parts(data, sample_count) })
}
