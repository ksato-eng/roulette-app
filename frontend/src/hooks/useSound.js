import { useRef, useCallback } from 'react'

// Web Audio API を使ったサウンドエフェクト
export function useSound() {
  const audioCtxRef = useRef(null)
  const drumrollNodeRef = useRef(null)
  const drumrollAudioRef = useRef(null)  // 実際のドラムロール音源用
  const playingOscillatorsRef = useRef([])  // 再生中のOscillator群を管理

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

  // デフォルト：実際のドラムロール音源MP3をループ再生
  const playDrumrollDefault = useCallback(() => {
    stopDrumroll()  // 前回の再生を停止

    // Audio要素を作成
    const audio = new Audio('/sounds/drumroll-default.mp3')
    audio.loop = true
    audio.volume = 0.7
    audio.play().catch(err => {
      console.warn('Audio playback failed:', err)
    })

    drumrollAudioRef.current = audio
  }, [])

  // 電子音：ビープ音パターン（クレッシェンド付き）
  const playDrumrollElectronic = useCallback(() => {
    const ctx = getCtx()
    const startTime = ctx.currentTime
    const beepFreq = 1200
    const duration = 4
    const beatCount = Math.floor(duration * 20)  // 秒間20ビート

    for (let i = 0; i < beatCount; i++) {
      const beatTime = startTime + (i / 20)  // 秒単位の時間
      const progress = i / beatCount
      // クレッシェンド：だんだん音量が上がる
      const volume = 0.15 + progress * 0.55

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = beepFreq

      gain.gain.setValueAtTime(volume, beatTime)
      gain.gain.exponentialRampToValueAtTime(0.01, beatTime + 0.04)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(beatTime)
      osc.stop(beatTime + 0.05)
    }
  }, [])

  // シンセ：パルスロール（ピッチ上昇＋クレッシェンド）
  const playDrumrollSynth = useCallback(() => {
    const ctx = getCtx()
    const startTime = ctx.currentTime
    const duration = 4
    const pulseCount = Math.floor(duration * 16)  // 秒間16パルス

    for (let i = 0; i < pulseCount; i++) {
      const pulseTime = startTime + (i / 16)
      const progress = i / pulseCount

      // クレッシェンド＋ピッチシフト
      const baseFreq = 300 + progress * 400  // 300Hz → 700Hzに上昇
      const volume = 0.2 + progress * 0.5

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = baseFreq

      gain.gain.setValueAtTime(volume, pulseTime)
      gain.gain.exponentialRampToValueAtTime(0.01, pulseTime + 0.08)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(pulseTime)
      osc.stop(pulseTime + 0.1)
    }
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
    // MP3ファイルを再生中の場合
    if (drumrollAudioRef.current) {
      try {
        drumrollAudioRef.current.pause()
        drumrollAudioRef.current.currentTime = 0
      } catch (e) {
        // already stopped
      }
      drumrollAudioRef.current = null
    }

    // Web Audio APIで生成した音の場合
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
    stopAllWinSounds()  // 前回の音を停止
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

      // Oscillatorを管理リストに追加
      playingOscillatorsRef.current.push({ osc, osc2, gain, gain2 })

      time += durations[i]
    })
  }, [])

  // ベル音
  const playBell = useCallback(() => {
    stopAllWinSounds()  // 前回の音を停止
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

      playingOscillatorsRef.current.push({ osc, gain })
    })
  }, [])

  // チャイム音
  const playChime = useCallback(() => {
    stopAllWinSounds()  // 前回の音を停止
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

      playingOscillatorsRef.current.push({ osc, gain })
    })
  }, [])

  // キラキラ音
  const playSparkle = useCallback(() => {
    stopAllWinSounds()  // 前回の音を停止
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

      playingOscillatorsRef.current.push({ osc, gain })
    })
  }, [])

  // ────────── ハズレ音（複数パターン） ──────────

  const playBuzz = useCallback(() => {
    stopAllLoseSounds()  // 前回の音を停止
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

    playingOscillatorsRef.current.push({ osc, gain })
  }, [])

  const playSad = useCallback(() => {
    stopAllLoseSounds()  // 前回の音を停止
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

      playingOscillatorsRef.current.push({ osc, gain })
    })
  }, [])

  const playFail = useCallback(() => {
    stopAllLoseSounds()  // 前回の音を停止
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

    playingOscillatorsRef.current.push({ osc, gain })
  }, [])

  // 全ての当選音を停止
  const stopAllWinSounds = useCallback(() => {
    playingOscillatorsRef.current.forEach(({ osc, osc2, gain, gain2 }) => {
      try {
        const ctx = audioCtxRef.current
        if (ctx) {
          if (gain) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
          if (osc) osc.stop(ctx.currentTime + 0.1)
          if (osc2) osc2.stop(ctx.currentTime + 0.1)
        }
      } catch (e) {}
    })
    playingOscillatorsRef.current = []
  }, [])

  // 全てのハズレ音を停止
  const stopAllLoseSounds = useCallback(() => {
    playingOscillatorsRef.current.forEach(({ osc, gain }) => {
      try {
        const ctx = audioCtxRef.current
        if (ctx) {
          if (gain) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
          if (osc) osc.stop(ctx.currentTime + 0.1)
        }
      } catch (e) {}
    })
    playingOscillatorsRef.current = []
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
    playWin,
    playLose,
    stopAllWinSounds,
    stopAllLoseSounds,
    // 後方互換性のため
    playFanfare,
    playChime,
    playBuzz
  }
}
