/**
 * 播放音效
 */
export function playSound(type: 'round-end' | 'warning' | 'danger' | 'time-up'): void {
  // 使用 Web Audio API 生成音效
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  switch (type) {
    case 'round-end':
      // 回合结束：连续两个音调，更有提示感
      playTone(audioContext, 600, 0.15, 0.4, 'sine');
      setTimeout(() => {
        playTone(audioContext, 800, 0.15, 0.4, 'sine');
      }, 150);
      break;
    case 'warning':
      // 3分钟警告：两个急促的音调
      playTone(audioContext, 800, 0.1, 0.5, 'square');
      setTimeout(() => {
        playTone(audioContext, 1000, 0.1, 0.5, 'square');
      }, 100);
      break;
    case 'danger':
      // 1分钟危险：三个急促的音调，更紧迫
      playTone(audioContext, 900, 0.08, 0.6, 'square');
      setTimeout(() => {
        playTone(audioContext, 1100, 0.08, 0.6, 'square');
      }, 80);
      setTimeout(() => {
        playTone(audioContext, 1300, 0.08, 0.6, 'square');
      }, 160);
      break;
    case 'time-up':
      // 时间用尽：低沉的警告音
      playTone(audioContext, 400, 0.2, 0.6, 'sawtooth');
      setTimeout(() => {
        playTone(audioContext, 300, 0.3, 0.6, 'sawtooth');
      }, 200);
      break;
  }
}

/**
 * 播放单个音调
 */
function playTone(
  audioContext: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine'
): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

/**
 * 检查是否启用音效
 */
export function isSoundEnabled(): boolean {
  const saved = localStorage.getItem('debate-chess-clock-sound-enabled');
  return saved === null ? true : saved === 'true';
}

/**
 * 设置音效启用状态
 */
export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem('debate-chess-clock-sound-enabled', String(enabled));
}
