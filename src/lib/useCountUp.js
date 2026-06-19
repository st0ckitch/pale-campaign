import { useEffect, useState } from 'react'

// Ease-out count-up from 0 to `target`. Respects reduced motion.
export function useCountUp(target, reduceMotion, dur = 1200) {
  const [v, setV] = useState(reduceMotion ? target : 0)
  useEffect(() => {
    if (reduceMotion) {
      setV(target)
      return
    }
    let raf
    const start = performance.now()
    const ease = (p) => 1 - Math.pow(1 - p, 3)
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur)
      setV(target * ease(p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduceMotion, dur])
  return v
}
