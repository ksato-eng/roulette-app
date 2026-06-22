import { useRef, useCallback } from 'react'

// Web Audio API を使ったサウンドエフェクト
export function useSound() {
  const audioCtxRef = useRef(null)
  const drumrollNodeRef = useRef(null)

  // AudioContext は最初のユーザー操作後に作成
  function getCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    // サスペンド状態なら再開
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }

  // ドラムロール音（ホワイトノイズ＋フィルター）
  const startDrumroll = useCallback(() => {
    const ctx = getCtx()
    stopDrumroll()

    const bufferSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    // バンドパスフィルターでスネアドラムっぽい音に
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 180
    filter.Q.value = 0.5

    // トレモロ効果（ドラムロール感）
    const gainNode = ctx.createGain()
    gainNode.gain.value = 0.6

    const lfo = ctx.createOscillator()
    lfo.frequency.value = 30
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.4
    lfo.connect(lfoGain)
    lfoGain.connect(gainNode.gain)
    lfo.start()

    source.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)
    source.start()

    drumrollNodeRef.current = { source, gainNode, lfo, filter }
  }, [])

  const stopDrumroll = useCallback(() => {
    if (drumrollNodeRef.current) {
      const { source, gainNode, lfo } = drumrollNodeRef.current
      try {
        const ctx = audioCtxRef.current
        gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
        source.stop(ctx.currentTime + 0.3)
        lfo.stop(ctx.currentTime + 0.3)
      } catch (e) {
        // already stopped
      }
      drumrollNodeRef.current = null
    }
  }, [])

  // ファンファーレ（1等・2等用）
  const playFanfare = useCallback(() => {
    const ctx = getCtx()
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5]
    const durations = [0.12, 0.12, 0.12, 0.4, 0.1, 0.5]
    let time = ctx.currentTime + 0.05

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq

      // 高調波を加えてブラス感を出す
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sawtooth'
      osc2.frequency.value = freq * 1.5
      gain2.gain.value = 0.1
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(time)
      osc2.stop(time + durations[i])

      gain.gain.setValueAtTime(0, time)
      gain.gain.linearRampToValueAtTime(0.25, time + 0.02)
      gain.gain.setTargetAtTime(0, time + durations[i] - 0.05, 0.05)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(time)
      osc.stop(time + durations[i])

      time += durations[i]
    })
  }, [])

  // チャイム音（3等以下用）
  const playChime = useCallback(() => {
    const ctx = getCtx()
    const chords = [523.25, 659.25, 783.99]
    const startTime = ctx.currentTime + 0.05

    chords.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq

      gain.gain.setValueAtTime(0, startTime + i * 0.08)
      gain.gain.linearRampToValueAtTime(0.3, startTime + i * 0.08 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + i * 0.08 + 1.2)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime + i * 0.08)
      osc.stop(startTime + i * 0.08 + 1.3)
    })
  }, [])

  // ハズレ音
  const playBuzz = useCallback(() => {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(200, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.3)

    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  }, [])

  return { startDrumroll, stopDrumroll, playFanfare, playChime, playBuzz }
}
