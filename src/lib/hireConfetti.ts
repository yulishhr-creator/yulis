import confetti from 'canvas-confetti'

const PARTY = ['#fde047', '#22c55e', '#f97316', '#ec4899', '#3b82f6', '#a855f7', '#eab308', '#14b8a6', '#f43f5e']

function rnd(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

/**
 * Heavy full-screen celebration for ~10s. Returns a disposer to stop early (e.g. route change).
 */
export function fireInsaneHireConfetti(durationMs = 10_000): () => void {
  const end = Date.now() + durationMs
  let burstCount = 0

  const burst = () => {
    burstCount += 1

    void confetti({
      particleCount: rnd(90, 160),
      spread: rnd(52, 88),
      startVelocity: rnd(38, 62),
      ticks: 420,
      gravity: rnd(0.85, 1.15),
      scalar: rnd(0.95, 1.35),
      colors: PARTY,
      origin: { x: rnd(0.05, 0.25), y: rnd(0.15, 0.45) },
      zIndex: 2147483646,
    })
    void confetti({
      particleCount: rnd(90, 160),
      spread: rnd(52, 88),
      startVelocity: rnd(38, 62),
      ticks: 420,
      gravity: rnd(0.85, 1.15),
      scalar: rnd(0.95, 1.35),
      colors: PARTY,
      origin: { x: rnd(0.75, 0.95), y: rnd(0.15, 0.45) },
      zIndex: 2147483646,
    })
    void confetti({
      particleCount: rnd(70, 130),
      spread: rnd(60, 100),
      startVelocity: rnd(45, 70),
      ticks: 400,
      gravity: 0.9,
      scalar: rnd(1, 1.4),
      colors: PARTY,
      origin: { x: rnd(0.4, 0.6), y: rnd(0, 0.25) },
      shapes: ['circle', 'square'],
      zIndex: 2147483646,
    })

    if (burstCount % 2 === 0) {
      void confetti({
        particleCount: rnd(100, 180),
        angle: rnd(55, 125),
        spread: rnd(55, 75),
        startVelocity: rnd(55, 75),
        ticks: 320,
        origin: { x: rnd(0.2, 0.8), y: 1 },
        colors: PARTY,
        zIndex: 2147483646,
      })
    }

    if (burstCount % 3 === 0) {
      void confetti({
        particleCount: rnd(50, 100),
        spread: 360,
        ticks: 500,
        startVelocity: rnd(25, 45),
        origin: { x: 0.5, y: rnd(0.35, 0.55) },
        colors: PARTY,
        shapes: ['square'],
        scalar: rnd(1.1, 1.5),
        zIndex: 2147483646,
      })
    }
  }

  const id = window.setInterval(() => {
    if (Date.now() >= end) {
      clearInterval(id)
      return
    }
    burst()
  }, 160)

  burst()

  return () => {
    clearInterval(id)
  }
}
