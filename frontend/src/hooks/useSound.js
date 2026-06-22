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

  // ────────── ドラムロール音（複数パターン） ──────────

  // デフォルト：ホワイトノイズ＋フィルター
  const playDrumrollDefault = useCallback(() => {
    const ctx = getCtx()
    const bufferSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 180
    filter.Q.value = 0.5

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

  // 電子音：ビープ音パターン
  const playDrumrollElectronic = useCallback(() => {
    const ctx = getCtx()
    const beepFreq = 1200
    let time = ctx.currentTime

    for (let i = 0; i < 15; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = beepFreq
      gain.gain.setValueAtTime(0.2, time + i * 0.08)
      gain.gain.setTargetAtTime(0, time + i * 0.08 + 0.02, 0.02)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(time + i * 0.08)
      osc.stop(time + i * 0.08 + 0.05)
    }
  }, [])

  // シンセ：スイープ音
  const playDrumrollSynth = useCallback(() => {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const startTime = ctx.currentTime

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(500, startTime)
    osc.frequency.linearRampToValueAtTime(800, startTime + 0.5)
    osc.frequency.linearRampToValueAtTime(500, startTime + 1)

    gain.gain.setValueAtTime(0.3, startTime)
    gain.gain.setTargetAtTime(0, startTime + 0.8, 0.1)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startTime)
    osc.stop(startTime + 1.2)

    drumrollNodeRef.current = { source: osc, gainNode: gain, lfo: null, filter: null }
  }, [])

  const startDrumroll = useCallback((soundType = 'default') => {
    stopDrumroll()
    if (soundType === 'electronic') {
      playDrumrollElectronic()
    } else if (soundType === 'synth') {
      playDrumrollSynth()
    } else {
      playDrumrollDefault()
    }
  }, [playDrumrollDefault, playDrumrollElectronic, playDrumrollSynth])

  const stopDrumroll = useCallback(() => {
    if (drumrollNodeRef.current) {
      const { source, gainNode, lfo } = drumrollNodeRef.current
      try {
        const ctx = audioCtxRef.current
        if (gainNode) {
          gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
        }
        if (source) {
          source.stop(ctx.currentTime + 0.3)
        }
        if (lfo) {
          lfo.stop(ctx.currentTime + 0.3)
        }
      } catch (e) {
        // already stopped
      }
      drumrollNodeRef.current = null
    }
  }, [])

  // ────────── 当選音（複数パターン） ──────────

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

  // ベル音
  const playBell = useCallback(() => {
    const ctx = getCtx()
    const frequencies = [659.25, 783.99, 987.77]
    const startTime = ctx.currentTime + 0.05

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq

      gain.gain.setValueAtTime(0.25, startTime + i * 0.1)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + i * 0.1 + 1.5)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime + i * 0.1)
      osc.stop(startTime + i * 0.1 + 1.8)
    })
  }, [])

  // チャイム音
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

  // キラキラ音
  const playSparkle = useCallback(() => {
    const ctx = getCtx()
    const baseTime = ctx.currentTime + 0.05
    const frequencies = [1046.5, 1318.51, 1567.98, 1046.5]

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq

      gain.gain.setValueAtTime(0.15, baseTime + i * 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, baseTime + i * 0.05 + 0.4)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(baseTime + i * 0.05)
      osc.stop(baseTime + i * 0.05 + 0.5)
    })
  }, [])

  const playWin = useCallback((soundType = 'fanfare') => {
    if (soundType === 'bell') {
      playBell()
    } else if (soundType === 'chime') {
      playChime()
    } else if (soundType === 'sparkle') {
      playSparkle()
    } else {
      playFanfare()
    }
  }, [playFanfare, playBell, playChime, playSparkle])

  // ────────── ハズレ音（複数パターン） ──────────

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

  const playSad = useCallback(() => {
    const ctx = getCtx()
    const startTime = ctx.currentTime + 0.05
    const frequencies = [392, 349.23]

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq

      gain.gain.setValueAtTime(0.2, startTime + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + i * 0.15 + 0.6)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startTime + i * 0.15)
      osc.stop(startTime + i * 0.15 + 0.7)
    })
  }, [])

  const playFail = useCallback(() => {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.2)

    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
  }, [])

  const playLose = useCallback((soundType = 'buzz') => {
    if (soundType === 'sad') {
      playSad()
    } else if (soundType === 'fail') {
      playFail()
    } else {
      playBuzz()
    }
  }, [playBuzz, playSad, playFail])

  return {
    startDrumroll,
    stopDrumroll,
    playWin,     // playWin（soundType パラメータ対応）
    playLose,    // playLose（soundType パラメータ対応）
    // 後方互換性のため
    playFanfare,
    playChime,
    playBuzz
  }
}
