import { useEffect, useRef } from 'react'

const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#DDA0DD', '#FFB347', '#FF69B4']

export default function Confetti({ active }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    const container = containerRef.current
    const pieces = []

    for (let i = 0; i < 120; i++) {
      const el = document.createElement('div')
      el.className = 'confetti-piece'
      const size = Math.random() * 10 + 6
      el.style.cssText = `
        left: ${Math.random() * 100}vw;
        top: -20px;
        width: ${size}px;
        height: ${size}px;
        background: ${COLORS[Math.floor(Math.random() * COLORS.length)]};
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-duration: ${Math.random() * 2 + 2}s;
        animation-delay: ${Math.random() * 1.5}s;
        transform: rotate(${Math.random() * 360}deg);
      `
      container.appendChild(el)
      pieces.push(el)
    }

    const timer = setTimeout(() => {
      pieces.forEach(p => p.remove())
    }, 5000)

    return () => {
      clearTimeout(timer)
      pieces.forEach(p => p.remove())
    }
  }, [active])

  return <div ref={containerRef} className="fixed inset-0 pointer-events-none z-50" />
}
